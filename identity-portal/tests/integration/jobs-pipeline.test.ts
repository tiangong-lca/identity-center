import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createRabbitMqAdapter } from '@/lib/mq/rabbitmq-adapter'
import { verifyWebhook } from '@/lib/sync/webhook-signature'
import { deliverDueWebhooks, enqueueWebhookDeliveries } from '@/server/jobs/deliver-webhooks'
import { dispatchOutboxEvents } from '@/server/jobs/dispatch-outbox-events'
import { reconcileApplicationProjections, reconcileKeycloakUsers } from '@/server/jobs/reconcile'
import { retryDeadLetterEvents } from '@/server/jobs/retry-dead-letters'
import type { JobContext } from '@/server/jobs/types'
import { createApplicationService } from '@/server/services/application-service'
import { createAssignmentService } from '@/server/services/assignment-service'
import type { ServiceContext } from '@/server/services/context'
import { createUserService } from '@/server/services/user-service'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://identity:identity@localhost:5672'

describe('L3 任务管道与故障演练(真实 PG/KC/RabbitMQ)', () => {
  let tdb: TestDb
  let ctx: JobContext & ServiceContext
  let receiver: Server
  let receiverPort: number
  let receiverMode: 'ok' | 'fail' = 'ok'
  const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = []
  let keycloakUserId: string
  let portalUserId: string
  let applicationId: string

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    const kc = createKeycloakAdmin(await resolveAdminApiConfig())
    const mq = createRabbitMqAdapter(RABBIT_URL)
    ctx = { db: tdb.db, keycloak: kc, mq }
    process.env.IT_WEBHOOK_SECRET = 'it-webhook-secret'

    receiver = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push({ headers: req.headers, body })
        res.statusCode = receiverMode === 'ok' ? 200 : 500
        res.end()
      })
    })
    await new Promise<void>((r) => receiver.listen(0, () => r()))
    receiverPort = (receiver.address() as { port: number }).port
  })

  afterAll(async () => {
    receiver?.close()
    if (keycloakUserId) await ctx.keycloak.deleteUser(keycloakUserId).catch(() => {})
    await ctx.mq.close()
    await tdb?.destroy()
  })

  it('准备:用户 + 订阅 webhook 的应用 + 准入', async () => {
    const users = createUserService(ctx)
    const apps = createApplicationService(ctx)
    const user = await users.create({
      email: `pipe-${suffix}@test.local`,
      temporaryPassword: 'Temp-Pipe-2026',
    })
    portalUserId = user.id
    keycloakUserId = user.keycloakUserId as string
    const app = await apps.create({
      code: `pipe-app-${suffix}`,
      name: '管道测试应用',
      keycloakClientId: 'user-portal',
      webhookUrl: `http://127.0.0.1:${receiverPort}/hooks`,
      webhookSecretRef: 'IT_WEBHOOK_SECRET',
    })
    applicationId = app.id
    const assignments = createAssignmentService(ctx)
    await assignments.grant(applicationId, portalUserId)
  })

  it('端到端:outbox → MQ → 扇出 → 签名投递,业务端验签通过', async () => {
    // 消费者:扇出到 webhook_deliveries
    const stop = await ctx.mq.consume(
      `it.fanout.${suffix}`,
      ['identity.user.*', 'access.application.*'],
      async (msg) => {
        await enqueueWebhookDeliveries(ctx, msg)
      },
      { consumer: 'webhook-fanout' },
    )

    const dispatch = await dispatchOutboxEvents(ctx)
    expect(dispatch.processed).toBeGreaterThanOrEqual(2) // user.created + access.granted
    expect(dispatch.failed).toBe(0)

    await waitFor(async () => {
      const rows = await tdb.db.query.webhookDeliveries.findMany()
      return rows.length >= 2
    })
    const delivered = await deliverDueWebhooks(ctx)
    expect(delivered.processed).toBeGreaterThanOrEqual(2)

    const sample = received.at(-1)!
    const sig = sample.headers['x-webhook-signature'] as string
    const ts = sample.headers['x-webhook-timestamp'] as string
    expect(verifyWebhook('it-webhook-secret', ts, sample.body, sig).valid).toBe(true)
    expect(sample.headers['x-webhook-event-id']).toMatch(/^evt_/)

    // 幂等:同事件重复扇出被 processed_events 拦截
    const outbox = await tdb.db.query.outboxEvents.findMany()
    const msg = outbox[0].payload as { eventId: string; eventType: string; eventVersion: number; payload: unknown }
    const enqueued = await enqueueWebhookDeliveries(ctx, {
      eventId: msg.eventId,
      eventType: outbox[0].eventType,
      eventVersion: 1,
      payload: msg,
    })
    expect(enqueued).toBe(0)
    await stop()
  })

  it('演练1:MQ 不可达 → 5 轮后进死信;恢复后重放成功', async () => {
    const brokenCtx: JobContext = {
      ...ctx,
      mq: createRabbitMqAdapter('amqp://identity:identity@localhost:15673'),
    }
    // 制造一条新 outbox(直接插入)
    const eventId = `evt_${randomUUID()}`
    await tdb.db.insert(schema.outboxEvents).values({
      eventType: 'identity.user.updated',
      eventVersion: 1,
      payload: { eventId, eventType: 'identity.user.updated', eventVersion: 1, keycloakSub: 'x' },
      status: 'pending',
    })

    for (let i = 0; i < 5; i++) {
      await dispatchOutboxEvents(brokenCtx)
    }
    const failedRow = await tdb.db.query.outboxEvents.findFirst({
      where: eq(schema.outboxEvents.status, 'failed'),
    })
    expect(failedRow).toBeTruthy()
    const dead = await tdb.db.query.deadLetterEvents.findMany({
      where: eq(schema.deadLetterEvents.source, 'outbox'),
    })
    expect(dead.length).toBe(1)
    await brokenCtx.mq.close().catch(() => {})

    // 恢复:重放死信到真实 MQ
    const replay = await retryDeadLetterEvents(ctx)
    expect(replay.processed).toBe(1)
    const resolved = await tdb.db.query.deadLetterEvents.findFirst({
      where: eq(schema.deadLetterEvents.source, 'outbox'),
    })
    expect(resolved?.resolvedAt).toBeTruthy()
  })

  it('演练2:KC 投影漂移(直删角色)→ 对账修复', async () => {
    const kcClient = await ctx.keycloak.findClientByClientId('user-portal')
    const roleName = `pipe_app_${suffix}_access`
    await ctx.keycloak.revokeClientRole(keycloakUserId, kcClient!.id!, roleName)
    let roles = await ctx.keycloak.listUserClientRoles(keycloakUserId, kcClient!.id!)
    expect(roles.some((r) => r.name === roleName)).toBe(false)

    const result = await reconcileApplicationProjections(ctx)
    expect((result.details as { drift: number }).drift).toBeGreaterThanOrEqual(1)

    roles = await ctx.keycloak.listUserClientRoles(keycloakUserId, kcClient!.id!)
    expect(roles.some((r) => r.name === roleName)).toBe(true)
  })

  it('演练3:用户状态漂移(KC 直改)→ 对账以平台为准修复', async () => {
    await ctx.keycloak.setUserEnabled(keycloakUserId, false) // 平台侧仍是 active
    const result = await reconcileKeycloakUsers(ctx)
    expect((result.details as { drift: number }).drift).toBeGreaterThanOrEqual(1)
    expect((await ctx.keycloak.getUser(keycloakUserId))?.enabled).toBe(true)
  })

  it('演练4:webhook 5 连败 → dead;修复端点后死信重放 → delivered', async () => {
    receiverMode = 'fail'
    const eventId = `evt_${randomUUID()}`
    await tdb.db.insert(schema.webhookDeliveries).values({
      applicationId,
      eventId,
      eventType: 'identity.user.updated',
      payload: { eventId, ping: true },
      status: 'pending',
      nextRetryAt: new Date(),
    })

    for (let i = 0; i < 5; i++) {
      await deliverDueWebhooks(ctx)
      // 退避时间置为立即到期,加速演练
      await tdb.db
        .update(schema.webhookDeliveries)
        .set({ nextRetryAt: new Date() })
        .where(eq(schema.webhookDeliveries.eventId, eventId))
    }
    const deadRow = await tdb.db.query.webhookDeliveries.findFirst({
      where: and(
        eq(schema.webhookDeliveries.eventId, eventId),
        eq(schema.webhookDeliveries.status, 'dead'),
      ),
    })
    expect(deadRow).toBeTruthy()

    receiverMode = 'ok'
    await retryDeadLetterEvents(ctx) // webhook 死信 → 重置 pending
    const redeliver = await deliverDueWebhooks(ctx)
    expect(redeliver.processed).toBeGreaterThanOrEqual(1)
    const finalRow = await tdb.db.query.webhookDeliveries.findFirst({
      where: eq(schema.webhookDeliveries.eventId, eventId),
    })
    expect(finalRow?.status).toBe('delivered')
  })
})

async function waitFor(cond: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now()
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await new Promise((r) => setTimeout(r, 100))
  }
}
