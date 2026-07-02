import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/db/schema'
import { outboxEvents } from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { newEventId } from '@/lib/http/request-id'
import type { EventType } from './event-types'

type Tx = Pick<NodePgDatabase<typeof schema>, 'insert'>

export type OutboxInput = {
  eventType: EventType
  payload: Record<string, unknown>
  eventVersion?: number
  traceId?: string
  operationId?: string
}

/**
 * 事务内追加 outbox 事件(决议 11:事实与事件同事务):
 * 必须传入事实变更所在的 tx,禁止在事务外单独调用。
 * payload 自动补 eventId/eventVersion/occurredAt(camelCase)。
 */
export async function appendOutboxEvent(tx: Tx, input: OutboxInput) {
  const ctx = getAuditContext()
  const eventId = newEventId()
  const eventVersion = input.eventVersion ?? 1
  const traceId = input.traceId ?? ctx?.traceId
  const operationId = input.operationId ?? ctx?.operationId

  const [row] = await tx
    .insert(outboxEvents)
    .values({
      id: eventId.replace(/^evt_/, ''),
      eventType: input.eventType,
      eventVersion,
      payload: {
        eventId,
        eventVersion,
        eventType: input.eventType,
        occurredAt: new Date().toISOString(),
        ...(traceId ? { traceId } : {}),
        ...(operationId ? { operationId } : {}),
        ...input.payload,
      },
      traceId,
      operationId,
      status: 'pending',
    })
    .returning()
  return row
}
