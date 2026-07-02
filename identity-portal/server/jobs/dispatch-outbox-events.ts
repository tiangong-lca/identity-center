import { asc, eq, inArray, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { MqMessage } from '@/lib/mq/types'
import type { JobContext, JobResult } from './types'

const BATCH_SIZE = 100
const MAX_PUBLISH_ATTEMPTS = 5

/**
 * Outbox 派发(决议 11):pending → MQ → published。
 * FOR UPDATE SKIP LOCKED 保证多实例安全;发布失败 attempts++,达上限进死信。
 */
export async function dispatchOutboxEvents(ctx: JobContext): Promise<JobResult> {
  let processed = 0
  let failed = 0

  const batch = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.outboxEvents)
      .where(inArray(schema.outboxEvents.status, ['pending']))
      .orderBy(asc(schema.outboxEvents.createdAt))
      .limit(BATCH_SIZE)
      .for('update', { skipLocked: true })
    // 标记 in-flight 防止并发实例重复取(仍是 pending 语义的内部实现)
    if (rows.length > 0) {
      await tx
        .update(schema.outboxEvents)
        .set({ attempts: sql`${schema.outboxEvents.attempts} + 1` })
        .where(inArray(schema.outboxEvents.id, rows.map((r) => r.id)))
    }
    return rows
  })

  for (const row of batch) {
    const message = row.payload as MqMessage
    try {
      await ctx.mq.publish(row.eventType, message)
      await ctx.db
        .update(schema.outboxEvents)
        .set({ status: 'published', publishedAt: new Date(), lastError: null })
        .where(eq(schema.outboxEvents.id, row.id))
      processed++
    } catch (error) {
      failed++
      const attempts = row.attempts + 1
      const message2 = error instanceof Error ? error.message : String(error)
      if (attempts >= MAX_PUBLISH_ATTEMPTS) {
        await ctx.db.transaction(async (tx) => {
          await tx
            .update(schema.outboxEvents)
            .set({ status: 'failed', lastError: message2 })
            .where(eq(schema.outboxEvents.id, row.id))
          await tx.insert(schema.deadLetterEvents).values({
            source: 'outbox',
            eventId: (row.payload as { eventId?: string }).eventId ?? row.id,
            eventType: row.eventType,
            eventVersion: row.eventVersion,
            payload: row.payload,
            error: message2,
            attempts,
            traceId: row.traceId,
            operationId: row.operationId,
          })
        })
      } else {
        await ctx.db
          .update(schema.outboxEvents)
          .set({ lastError: message2 })
          .where(eq(schema.outboxEvents.id, row.id))
      }
    }
  }
  return { processed, failed }
}
