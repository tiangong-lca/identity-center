import { and, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { MqMessage } from '@/lib/mq/types'
import {
  signWebhook,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
} from '@/lib/sync/webhook-signature'
import type { JobContext, JobResult } from './types'

/** 应用 webhook secret 解析:webhook_secret_ref 指向 env 键名(生产=密钥管理注入的环境变量) */
export function resolveWebhookSecret(ref: string | null): string | null {
  if (!ref) return null
  return process.env[ref] ?? null
}

/**
 * 事件扇出(MQ 消费侧):为每个订阅了 webhook 的 active 应用登记投递单。
 * 幂等:processed_events (eventId, 'webhook-fanout')。
 */
export async function enqueueWebhookDeliveries(ctx: JobContext, message: MqMessage): Promise<number> {
  const inserted = await ctx.db
    .insert(schema.processedEvents)
    .values({ eventId: message.eventId, consumer: 'webhook-fanout' })
    .onConflictDoNothing()
    .returning()
  if (inserted.length === 0) return 0 // 已处理过,幂等跳过

  const apps = await ctx.db.query.applications.findMany({
    where: and(eq(schema.applications.status, 'active'), isNotNull(schema.applications.webhookUrl)),
  })
  if (apps.length === 0) return 0

  const rows = apps.map((app) => ({
    applicationId: app.id,
    eventId: message.eventId,
    eventType: message.eventType,
    payload: message as unknown as Record<string, unknown>,
    status: 'pending' as const,
    nextRetryAt: new Date(),
  }))
  await ctx.db.insert(schema.webhookDeliveries).values(rows)
  return rows.length
}

/**
 * 投递到期的 webhook(pending/failed 且 next_retry_at 到期):
 * 签名头投递,2xx→delivered;失败按退避重试,5 次后 dead + 死信。
 */
export async function deliverDueWebhooks(ctx: JobContext): Promise<JobResult> {
  const fetchImpl = ctx.fetchImpl ?? fetch
  const due = await ctx.db.query.webhookDeliveries.findMany({
    where: and(
      inArray(schema.webhookDeliveries.status, ['pending', 'failed']),
      or(
        lte(schema.webhookDeliveries.nextRetryAt, new Date()),
        sql`${schema.webhookDeliveries.nextRetryAt} IS NULL`,
      ),
    ),
    limit: 100,
  })

  let processed = 0
  let failed = 0
  for (const delivery of due) {
    const app = await ctx.db.query.applications.findFirst({
      where: eq(schema.applications.id, delivery.applicationId),
    })
    if (!app?.webhookUrl) continue
    const secret = resolveWebhookSecret(app.webhookSecretRef)

    const rawBody = JSON.stringify(delivery.payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-webhook-event-id': delivery.eventId,
      'x-webhook-event-type': delivery.eventType,
      'x-webhook-timestamp': timestamp,
    }
    if (secret) headers['x-webhook-signature'] = signWebhook(secret, timestamp, rawBody)

    const attempts = delivery.attempts + 1
    try {
      const res = await fetchImpl(app.webhookUrl, { method: 'POST', headers, body: rawBody })
      if (res.status >= 200 && res.status < 300) {
        await ctx.db
          .update(schema.webhookDeliveries)
          .set({ status: 'delivered', attempts, deliveredAt: new Date(), lastError: null, updatedAt: new Date() })
          .where(eq(schema.webhookDeliveries.id, delivery.id))
        processed++
        continue
      }
      throw new Error(`HTTP ${res.status}`)
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : String(error)
      if (attempts >= WEBHOOK_MAX_ATTEMPTS) {
        await ctx.db.transaction(async (tx) => {
          await tx
            .update(schema.webhookDeliveries)
            .set({ status: 'dead', attempts, lastError: message, updatedAt: new Date() })
            .where(eq(schema.webhookDeliveries.id, delivery.id))
          await tx.insert(schema.deadLetterEvents).values({
            source: 'webhook',
            eventId: delivery.eventId,
            eventType: delivery.eventType,
            payload: delivery.payload as Record<string, unknown>,
            consumer: `webhook:${app.code}`,
            error: message,
            attempts,
          })
        })
        console.error(`[webhook] ${app.code} ${delivery.eventId} 投递 5 连败进入死信: ${message}`)
      } else {
        const delay = WEBHOOK_RETRY_DELAYS_MS[attempts - 1] ?? 600_000
        await ctx.db
          .update(schema.webhookDeliveries)
          .set({
            status: 'failed',
            attempts,
            lastError: message,
            nextRetryAt: new Date(Date.now() + delay),
            updatedAt: new Date(),
          })
          .where(eq(schema.webhookDeliveries.id, delivery.id))
      }
    }
  }
  return { processed, failed }
}
