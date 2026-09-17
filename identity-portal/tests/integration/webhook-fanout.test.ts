import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { enqueueWebhookDeliveries } from '@/server/jobs/deliver-webhooks'
import type { JobContext } from '@/server/jobs/types'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'
import { getDbTargets } from './helpers/db-targets'

for (const target of getDbTargets()) describe(`atomic fanout (${target.name})`, () => {
  let tdb: TestDb
  let ctx: JobContext
  beforeAll(async () => {
    tdb = await createMigratedTestDb(target.adminUrl)
    ctx = { db: tdb.db } as JobContext // 此函数不依赖 MQ 或 Keycloak。
    await tdb.db.insert(schema.applications).values(['one', 'two'].map(code => ({
      code, name: code, keycloakClientId: code, accessClientRole: `${code}_access`,
      webhookUrl: `http://${code}.invalid/hooks`,
    })))
  })
  afterAll(async () => { await tdb?.destroy() })

  it('投递单插入失败回滚标记；修复后并发重放，每个应用恰好一条', async () => {
    const event = { eventId: `evt_${randomUUID()}`, eventType: 'identity.user.updated', eventVersion: 1, payload: {} }
    await tdb.db.execute(sql`CREATE FUNCTION reject_delivery() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected insert failure'; END; $$ LANGUAGE plpgsql`)
    await tdb.db.execute(sql`CREATE TRIGGER reject_delivery BEFORE INSERT ON webhook_deliveries
      FOR EACH ROW EXECUTE FUNCTION reject_delivery()`)
    try {
      await expect(enqueueWebhookDeliveries(ctx, event)).rejects.toThrow()
      expect(await tdb.db.query.processedEvents.findMany()).toHaveLength(0)
      expect(await tdb.db.query.webhookDeliveries.findMany()).toHaveLength(0)
    } finally {
      await tdb.db.execute(sql`DROP TRIGGER reject_delivery ON webhook_deliveries`)
    }
    const results = await Promise.all(Array.from({ length: 8 }, () => enqueueWebhookDeliveries(ctx, event)))
    expect(results.reduce((a, b) => a + b, 0)).toBe(2)
    expect(await tdb.db.query.processedEvents.findMany()).toHaveLength(1)
    const deliveries = await tdb.db.query.webhookDeliveries.findMany({ where: eq(schema.webhookDeliveries.eventId, event.eventId) })
    expect(deliveries).toHaveLength(2)
    expect(new Set(deliveries.map(row => row.applicationId)).size).toBe(2)
    expect(await enqueueWebhookDeliveries(ctx, event)).toBe(0)
  })
})
