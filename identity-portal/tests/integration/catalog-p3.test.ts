import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
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
import { exportCatalogYaml } from '@/scripts/export-catalog'
import { parseCatalogYaml } from '@/lib/catalog/serialize'
import { computeCatalogDiff, hasChanges } from '@/lib/catalog/diff'
import { toCatalogApps } from '@/lib/catalog/serialize'
import { GET as pendingList } from '@/app/api/admin/catalog/pending-deactivate/route'
import { POST as deactivate } from '@/app/api/admin/catalog/deactivate/route'
import { POST as applyCatalog } from '@/app/api/admin/catalog/apply/route'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)
const ADMIN_SUB = `catalog-p3-admin-${suffix}`
const adminSession = { user: { keycloakSub: ADMIN_SUB, email: 'cat-p3@test.local', roles: ['admin_console_access'], isAdmin: true } }

function req(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

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
      const { yaml } = await exportCatalogYaml(ctx)
      const doc = parseCatalogYaml(yaml)
      const curApps = await ctx.db.query.applications.findMany()
      const curRoles = await ctx.db.query.applicationRoles.findMany()
      const diff = computeCatalogDiff(toCatalogApps(curApps, curRoles), doc.applications)
      expect(hasChanges(diff)).toBe(false)
    })
  })

  describe('confirmDeactivate + 端点', () => {
    it('确认停用 pending_deactivate 应用 → deactivated + 从 getCurrent 消失', async () => {
      mockSession.current = adminSession
      await createCatalogService(ctx).apply({ yaml: `version: 1\napplications:\n  - code: dz\n    name: DZ\n    keycloak: { clientId: dz-client, accessRole: dz_access }\n    roles: []\n`, source: 'cli' })
      await createCatalogService(ctx).apply({ yaml: `version: 1\napplications: []\n`, source: 'cli' }) // dz → pending_deactivate

      const listRes = await pendingList(req('GET', '/api/admin/catalog/pending-deactivate'))
      expect(listRes.status).toBe(200)
      const listed = (await listRes.json()).data.items.map((i: { appCode: string }) => i.appCode)
      expect(listed).toContain('dz')

      const res = await deactivate(req('POST', '/api/admin/catalog/deactivate', { appCode: 'dz' }))
      expect(res.status).toBe(200)
      expect((await res.json()).data.status).toBe('deactivated')

      const row = await ctx.db.query.applications.findFirst({ where: eq(schema.applications.code, 'dz') })
      expect(row?.status).toBe('deactivated')
      const { yaml } = await createCatalogService(ctx).getCurrent()
      expect(yaml).not.toContain('code: dz')
    })

    it('对非 pending_deactivate 目标 → 409 CONFLICT', async () => {
      mockSession.current = adminSession
      await createCatalogService(ctx).apply({ yaml: `version: 1\napplications:\n  - code: live\n    name: Live\n    keycloak: { clientId: live-client, accessRole: live_access }\n    roles: []\n`, source: 'cli' })
      const res = await deactivate(req('POST', '/api/admin/catalog/deactivate', { appCode: 'live' }))
      expect(res.status).toBe(409)
    })

    it('apply 含明文密钥 → 400 VALIDATION_ERROR(details 只出路径)', async () => {
      mockSession.current = adminSession
      const res = await applyCatalog(req('POST', '/api/admin/catalog/apply', {
        yaml: `version: 1\napplications:\n  - code: leak\n    name: Leak\n    keycloak: { clientId: leak-client, accessRole: leak_access }\n    loginUrl: https://x/h?token=supersecretplaintext\n    roles: []\n`,
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(JSON.stringify(body)).not.toContain('supersecretplaintext')
    })
  })

  describe('materialize 不回翻 deactivated', () => {
    it('app 已 deactivated 后,apply 不相关目录不应把它翻回 pending_deactivate', async () => {
      // 建 app term → 移除(pending_deactivate)→ 确认停用(deactivated)
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: term\n    name: Term\n    keycloak: { clientId: term-client, accessRole: term_access }\n    roles: []\n`,
        source: 'cli',
      })
      await createCatalogService(ctx).apply({ yaml: `version: 1\napplications: []\n`, source: 'cli' }) // term → pending_deactivate
      await createCatalogService(ctx).confirmDeactivate({ appCode: 'term' }) // term → deactivated

      // apply 一个完全不相关的目录(只含 other,不含 term)
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: other\n    name: Other\n    keycloak: { clientId: other-client, accessRole: other_access }\n    roles: []\n`,
        source: 'cli',
      })

      const row = await ctx.db.query.applications.findFirst({ where: eq(schema.applications.code, 'term') })
      expect(row?.status).toBe('deactivated')
    })

    it('role 已 deactivated 后,再次 apply 同应用不应把它翻回 pending_deactivate', async () => {
      // 建 app rapp,角色 keep + drop
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: rapp\n    name: RApp\n    keycloak: { clientId: rapp-client, accessRole: rapp_access }\n    roles: [{ code: keep, name: Keep }, { code: drop, name: Drop }]\n`,
        source: 'cli',
      })
      // 移除 drop → pending_deactivate
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: rapp\n    name: RApp\n    keycloak: { clientId: rapp-client, accessRole: rapp_access }\n    roles: [{ code: keep, name: Keep }]\n`,
        source: 'cli',
      })
      // 确认停用 drop 角色 → deactivated
      await createCatalogService(ctx).confirmDeactivate({ appCode: 'rapp', roleCode: 'drop' })

      // 再次 apply(新增角色 bump,制造真实 diff,确保 materializeCatalog 真正执行,而不是被 hasChanges 短路跳过)
      await createCatalogService(ctx).apply({
        yaml: `version: 1\napplications:\n  - code: rapp\n    name: RApp\n    keycloak: { clientId: rapp-client, accessRole: rapp_access }\n    roles: [{ code: keep, name: Keep }, { code: bump, name: Bump }]\n`,
        source: 'cli',
      })

      const app = await ctx.db.query.applications.findFirst({ where: eq(schema.applications.code, 'rapp') })
      const dropRole = await ctx.db.query.applicationRoles.findFirst({
        where: and(eq(schema.applicationRoles.applicationId, app!.id), eq(schema.applicationRoles.code, 'drop')),
      })
      expect(dropRole?.status).toBe('deactivated')
    })
  })
})
