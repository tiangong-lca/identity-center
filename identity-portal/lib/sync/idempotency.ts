import * as schema from '@/db/schema'
import type { DrizzleDb } from '@/lib/db/client'

/**
 * 幂等键守卫(processed_events 复用):首次见 → 登记并放行;重复 → false。
 * API 层 Idempotency-Key 与 MQ 消费幂等共用该表。
 */
export async function claimIdempotencyKey(
  db: DrizzleDb,
  key: string,
  consumer: string,
): Promise<boolean> {
  const inserted = await db
    .insert(schema.processedEvents)
    .values({ eventId: key, consumer })
    .onConflictDoNothing()
    .returning()
  return inserted.length > 0
}
