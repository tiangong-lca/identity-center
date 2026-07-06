import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('seedBusinessApps(tiangong-lca)', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('幂等登记 tiangong-lca 应用与 3 个角色', async () => {
    await seedBusinessApps(tdb.db)
    await seedBusinessApps(tdb.db)
    const apps = await tdb.db.query.applications.findMany()
    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      code: 'tiangong-lca',
      keycloakClientId: 'tiangong-lca-business-app',
      accessClientRole: 'tiangong_lca_access',
      webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
    })
    const roles = await tdb.db.query.applicationRoles.findMany({
      where: eq(schema.applicationRoles.applicationId, apps[0].id),
    })
    expect(roles.map((r) => r.code).sort()).toEqual(['admin', 'review-admin', 'review-member'])
  })
})
