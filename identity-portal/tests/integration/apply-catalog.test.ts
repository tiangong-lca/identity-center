import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import type { ServiceContext } from '@/server/services/context'
import { applyCatalogFromFile } from '@/scripts/apply-catalog'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('applyCatalogFromFile(config/business-apps.yaml)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('从文件 apply,登记 tiangong-lca + 3 角色', async () => {
    const r = await applyCatalogFromFile(ctx, 'config/business-apps.yaml')
    expect('version' in r && r.version).toBe(1)
    const apps = await tdb.db.query.applications.findMany()
    expect(apps[0]).toMatchObject({ code: 'tiangong-lca', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access', webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET' })
    const roles = await tdb.db.query.applicationRoles.findMany({ where: eq(schema.applicationRoles.applicationId, apps[0].id) })
    expect(roles.map((r) => r.code).sort()).toEqual(['admin', 'review-admin', 'review-member'])
  })

  it('--check 干跑不写库', async () => {
    const tdb2 = await createMigratedTestDb(getDbTargets()[0].adminUrl)
    const ctx2: ServiceContext = { db: tdb2.db, keycloak: ctx.keycloak }
    const r = await applyCatalogFromFile(ctx2, 'config/business-apps.yaml', { check: true })
    expect('dryRun' in r && r.dryRun).toBe(true)
    expect(await tdb2.db.query.applications.findMany()).toHaveLength(0)
    await tdb2.destroy()
  })
})
