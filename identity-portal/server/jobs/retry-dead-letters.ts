import { and, eq, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { MqMessage } from '@/lib/mq/types'
import type { JobContext, JobResult } from './types'

/**
 * 死信重放:outbox 源 → 重新发布 MQ;webhook 源 → 投递单重置为待投。
 * 成功标记 resolved_at;仍失败保留等待下轮/人工。
 */
export async function retryDeadLetterEvents(ctx: JobContext): Promise<JobResult> {
  const rows = await ctx.db.query.deadLetterEvents.findMany({
    where: isNull(schema.deadLetterEvents.resolvedAt),
    limit: 100,
  })
  let processed = 0
  let failed = 0

  for (const row of rows) {
    try {
      if (row.source === 'outbox') {
        await ctx.mq.publish(row.eventType, row.payload as MqMessage)
      } else if (row.source === 'webhook') {
        await ctx.db
          .update(schema.webhookDeliveries)
          .set({ status: 'pending', nextRetryAt: new Date(), attempts: 0, updatedAt: new Date() })
          .where(
            and(
              eq(schema.webhookDeliveries.eventId, row.eventId),
              eq(schema.webhookDeliveries.status, 'dead'),
            ),
          )
      } else {
        continue // consumer 源保留人工处理
      }
      await ctx.db
        .update(schema.deadLetterEvents)
        .set({ resolvedAt: new Date() })
        .where(eq(schema.deadLetterEvents.id, row.id))
      processed++
    } catch (error) {
      failed++
      console.error(`[dead-letter] 重放失败 ${row.eventId}:`, error)
    }
  }
  return { processed, failed }
}
