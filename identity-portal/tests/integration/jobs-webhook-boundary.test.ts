import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { MqMessage } from '@/lib/mq/types'
import { deliverDueWebhooks, enqueueWebhookDeliveries } from '@/server/jobs/deliver-webhooks'
import { retryDeadLetterEvents } from '@/server/jobs/retry-dead-letters'
import type { JobContext } from '@/server/jobs/types'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('Webhook bounded retries and CMS routing (real PostgreSQL and HTTP)', () => {
  let tdb: TestDb
  let ctx: JobContext
  let receiver: Server
  let receiverUrl: string
  let cmsId: string
  let otherId: string
  let requests = 0
  let mode: 'ok' | 'fail' | 'hang' = 'ok'

  beforeAll(async () => {
    tdb = await createMigratedTestDb(getDbTargets()[0].adminUrl)
    // These webhook jobs never use Keycloak or MQ. Unexpected use fails the test.
    const unused = () => { throw new Error('Unexpected non-webhook dependency') }
    ctx = {
      db: tdb.db,
      keycloak: new Proxy({} as JobContext['keycloak'], { get: unused }),
      mq: new Proxy({} as JobContext['mq'], { get: unused }),
    }
    receiver = createServer((req, res) => {
      requests++
      req.resume()
      if (mode !== 'hang') {
        res.statusCode = mode === 'ok' ? 200 : 503
        res.end()
      }
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    receiverUrl = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/hooks`
    const apps = await tdb.db.insert(schema.applications).values(['cms', 'other'].map(code => ({
      code, name: code, keycloakClientId: code, accessClientRole: `${code}_access`,
      webhookUrl: receiverUrl,
    }))).returning()
    cmsId = apps.find(app => app.code === 'cms')!.id
    otherId = apps.find(app => app.code === 'other')!.id
  })

  beforeEach(async () => {
    await tdb.db.delete(schema.deadLetterEvents)
    await tdb.db.delete(schema.webhookDeliveries)
    await tdb.db.delete(schema.processedEvents)
    requests = 0
    mode = 'ok'
  })

  afterAll(async () => {
    if (receiver) {
      receiver.closeAllConnections()
      await new Promise<void>((resolve, reject) => receiver.close(error => error ? reject(error) : resolve()))
    }
    await tdb?.destroy()
  })

  function message(payload: unknown, eventType = 'access.application.granted'): MqMessage {
    return { eventId: `evt_${randomUUID()}`, eventType, eventVersion: 1, payload }
  }

  async function insertDelivery(payload: unknown, attempts = 0, applicationId = cmsId,
    eventType = 'access.application.granted') {
    const [row] = await tdb.db.insert(schema.webhookDeliveries).values({
      applicationId, eventId: `evt_${randomUUID()}`, eventType, payload, attempts,
      status: 'pending', nextRetryAt: new Date(),
    }).returning()
    return row
  }

  it('five failures stay dead across repeated automatic DLQ jobs; explicit replay preserves attempts and audit', async () => {
    mode = 'fail'
    const row = await insertDelivery(message({}), 0, otherId, 'identity.user.updated')
    for (let attempt = 0; attempt < 5; attempt++) {
      await deliverDueWebhooks(ctx)
      await tdb.db.update(schema.webhookDeliveries).set({ nextRetryAt: new Date() })
        .where(eq(schema.webhookDeliveries.id, row.id))
    }
    const dead = await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) })
    const audits = await tdb.db.query.deadLetterEvents.findMany()
    expect(dead?.status).toBe('dead')
    expect(dead?.attempts).toBe(5)
    expect(audits).toHaveLength(1)
    mode = 'ok'
    for (let cycle = 0; cycle < 20; cycle++) {
      expect(await retryDeadLetterEvents(ctx)).toEqual({ processed: 0, failed: 0 })
      expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 0, failed: 0 })
    }
    expect(requests).toBe(5)
    expect(await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) })).toEqual(dead)
    expect(await tdb.db.query.deadLetterEvents.findMany()).toEqual(audits)
    // A reviewed one-time manual requeue is separate from automatic DLQ handling.
    await tdb.db.update(schema.webhookDeliveries).set({ status: 'pending', nextRetryAt: new Date() })
      .where(eq(schema.webhookDeliveries.id, row.id))
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 1, failed: 0 })
    const delivered = await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) })
    expect(delivered?.status).toBe('delivered')
    expect(delivered?.attempts).toBe(6)
    expect(await tdb.db.query.deadLetterEvents.findMany()).toEqual(audits)
  })

  it('a failed manual attempt six returns to dead and never automatically replays', async () => {
    mode = 'fail'
    const row = await insertDelivery(message({}), 5, otherId, 'identity.user.updated')
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 0, failed: 1 })
    for (let cycle = 0; cycle < 20; cycle++) await retryDeadLetterEvents(ctx)
    await deliverDueWebhooks(ctx)
    expect(requests).toBe(1)
    const dead = await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) })
    expect(dead?.status).toBe('dead')
    expect(dead?.attempts).toBe(6)
    const audits = await tdb.db.query.deadLetterEvents.findMany()
    expect(audits).toHaveLength(1)
    expect(audits[0].resolvedAt).toBeNull()
    expect(audits[0].attempts).toBe(6)
  })

  it('other-app grants bypass CMS fanout while other receivers and dedupe remain unchanged', async () => {
    const event = message({ applicationCode: 'other' })
    expect(await enqueueWebhookDeliveries(ctx, event)).toBe(1)
    const deliveries = await tdb.db.query.webhookDeliveries.findMany()
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].applicationId).toBe(otherId)
    expect(await enqueueWebhookDeliveries(ctx, event)).toBe(0)
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 1, failed: 0 })
    expect(requests).toBe(1)
  })

  it.each([
    { applicationCode: 'cms' },
    { applicationCode: 'CMS' },
    { payload: { applicationCode: 'cms' } },
  ])('valid one-layer CMS grant reaches HTTP: %j', async payload => {
    const row = await insertDelivery(payload)
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 1, failed: 0 })
    expect(requests).toBe(1)
    expect(await tdb.db.query.deadLetterEvents.findMany()).toHaveLength(0)
    expect((await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) }))?.status).toBe('delivered')
  })

  it.each([
    { applicationCode: 'other' }, {}, { applicationCode: '' }, { applicationCode: 1 },
    { applicationCode: ' cms ' }, { payload: { payload: { applicationCode: 'cms' } } },
    { applicationCode: 'cms', payload: { applicationCode: 'other' } },
    { applicationCode: 'cms', payload: {} },
  ])('unsafe CMS grant is quarantined atomically without HTTP or attempt reset: %j', async payload => {
    const row = await insertDelivery(payload, 4)
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 0, failed: 1 })
    expect(requests).toBe(0)
    const quarantined = await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) })
    expect(quarantined?.status).toBe('dead')
    expect(quarantined?.attempts).toBe(4)
    expect(quarantined?.nextRetryAt).toBeNull()
    const audits = await tdb.db.query.deadLetterEvents.findMany()
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ source: 'webhook', consumer: 'webhook:cms', eventId: row.eventId,
      eventType: row.eventType, payload, attempts: 4, resolvedAt: null })
    await retryDeadLetterEvents(ctx)
    await deliverDueWebhooks(ctx)
    expect(await tdb.db.query.deadLetterEvents.findMany()).toEqual(audits)
    expect(requests).toBe(0)
  })

  it('malformed grants remain auditable at send time; global user events still fan out to both applications', async () => {
    expect(await enqueueWebhookDeliveries(ctx, message({}))).toBe(2)
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 1, failed: 1 })
    expect(requests).toBe(1)
    expect(await enqueueWebhookDeliveries(ctx, message({}, 'identity.user.created'))).toBe(2)
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 2, failed: 0 })
    expect(requests).toBe(3)
  })

  it('a hanging HTTP receiver times out and records a bounded first failure', async () => {
    mode = 'hang'
    const row = await insertDelivery({}, 0, otherId, 'identity.user.updated')
    const started = Date.now()
    expect(await deliverDueWebhooks(ctx)).toEqual({ processed: 0, failed: 1 })
    expect(Date.now() - started).toBeLessThan(15_000)
    const failed = await tdb.db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, row.id) })
    expect(failed?.status).toBe('failed')
    expect(failed?.attempts).toBe(1)
    expect(failed?.nextRetryAt).not.toBeNull()
    receiver.closeAllConnections()
  })
})
