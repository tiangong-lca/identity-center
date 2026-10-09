import { and, eq, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { MqMessage } from '@/lib/mq/types'
import type { JobContext, JobResult } from './types'

/**
 * 自动重放仅处理 outbox 死信。
 * Webhook 达到投递上限后保留 dead 与原 attempts，修复原因后由人工按应用和事件重放。
 * Consumer 死信同样保留人工处理；不自动标记为已解决。
 */
export async function retryDeadLetterEvents(ctx: JobContext): Promise<JobResult> {
  const rows = await ctx.db.query.deadLetterEvents.findMany({
    where: and(
      eq(schema.deadLetterEvents.source, 'outbox'),
      isNull(schema.deadLetterEvents.resolvedAt),
    ),
    limit: 100,
  })
  let processed = 0
  let failed = 0

  for (const row of rows) {
    if (row.source !== 'outbox') continue
    try {
      await ctx.mq.publish(row.eventType, row.payload as MqMessage)
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
