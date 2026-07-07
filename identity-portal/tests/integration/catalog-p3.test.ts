import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { seedAdminRbac } from '@/scripts/seed/admin-rbac'
import { __setServiceContextForTests, type ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const mockSession = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/auth', () => ({
  auth: async () => mockSession.current,
  handlers: { GET: () => {}, POST: () => {} },
  signIn: async () => {},
  signOut: async () => {},
  ADMIN_CONSOLE_ROLE: 'admin_console_access',
}))

import { createCatalogReconcileService } from '@/server/services/catalog-reconcile-service'
import { createCatalogService } from '@/server/services/catalog-service'
import { parseCatalogYaml } from '@/lib/catalog/serialize'
import { computeCatalogDiff, hasChanges } from '@/lib/catalog/diff'
import { toCatalogApps } from '@/lib/catalog/serialize'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)
const ADMIN_SUB = `catalog-p3-admin-${suffix}`

describe('catalog P3(detectDrift 周期对账;mock 会话 + 真实 PG/KC)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    __setServiceContextForTests(ctx)
    await seedAdminRbac(tdb.db)
    const [admin] = await tdb.db
      .insert(schema.portalUsers)
      .values({ keycloakSub: ADMIN_SUB, email: 'cat-p3@test.local', status: 'active' })
      .returning()
    const role = await tdb.db.query.adminRoles.findFirst({ where: eq(schema.adminRoles.code, 'platform_admin') })
    await tdb.db.insert(schema.adminUserRoles).values({ portalUserId: admin.id, adminRoleId: role!.id, scopeType: 'global', scopeId: '' })
  })
  afterAll(async () => {
    __setServiceContextForTests(null)
    await tdb?.destroy()
  })

  describe('detectDrift(pending_deactivate backlog)', () => {
    it('apply 移除应用后,detectDrift 列出该 app', async () => {
      // 先建一个 app
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: p3app\n    name: P3\n    keycloak: { clientId: p3app-client, accessRole: p3_access }\n    roles: []\n`,
        source: 'cli',
      })
      // 再 apply 空目录 → p3app 变 pending_deactivate
      await createCatalogService(ctx).apply({ yaml: `version: 1\napplications: []\n`, source: 'cli' })
      const drift = await createCatalogReconcileService(ctx).detectDrift()
      const codes = drift.pendingDeactivate.filter((x) => x.kind === 'app').map((x) => x.appCode)
      expect(codes).toContain('p3app')
      const item = drift.pendingDeactivate.find((x) => x.appCode === 'p3app')
      expect(item?.affectedAssignments).toBe(0)
    })
  })

  describe('export round-trip', () => {
    it('getCurrent().yaml 再 apply(check)diff 空', async () => {
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: exp\n    name: Exp\n    keycloak: { clientId: exp-client, accessRole: exp_access }\n    roles: [{ code: admin, name: 管理员 }]\n`,
        source: 'cli',
      })
      const { yaml } = await createCatalogService(ctx).getCurrent()
      const doc = parseCatalogYaml(yaml)
      const curApps = await ctx.db.query.applications.findMany()
      const curRoles = await ctx.db.query.applicationRoles.findMany()
      const diff = computeCatalogDiff(toCatalogApps(curApps, curRoles), doc.applications)
      expect(hasChanges(diff)).toBe(false)
    })
  })
})
