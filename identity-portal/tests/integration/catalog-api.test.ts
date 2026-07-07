import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
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

import { GET as getCatalog } from '@/app/api/admin/catalog/route'
import { GET as listVersions } from '@/app/api/admin/catalog/versions/route'
import { GET as getVersion } from '@/app/api/admin/catalog/versions/[version]/route'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)
const ADMIN_SUB = `catalog-admin-${suffix}`
const adminSession = { user: { keycloakSub: ADMIN_SUB, email: 'cat@test.local', roles: ['admin_console_access'], isAdmin: true } }
const nonAdminSession = { user: { keycloakSub: 'nobody', email: 'no@test.local', roles: [], isAdmin: false } }

function req(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}
const p = (params: Record<string, string>) => ({ params: Promise.resolve(params) })

const DOC = (name = 'TianGong LCA 平台') => `
version: 1
applications:
  - code: tiangong-lca
    name: ${name}
    keycloak: { clientId: tiangong-lca-business-app, accessRole: tiangong_lca_access }
    roles:
      - { code: admin, name: 系统管理员 }
`

describe('catalog API(mock 会话 + 真实 PG/KC)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    __setServiceContextForTests(ctx)
    await seedAdminRbac(tdb.db)
    const [admin] = await tdb.db
      .insert(schema.portalUsers)
      .values({ keycloakSub: ADMIN_SUB, email: 'cat@test.local', status: 'active' })
      .returning()
    const role = await tdb.db.query.adminRoles.findFirst({ where: eq(schema.adminRoles.code, 'platform_admin') })
    await tdb.db.insert(schema.adminUserRoles).values({ portalUserId: admin.id, adminRoleId: role!.id, scopeType: 'global', scopeId: '' })
  })
  afterAll(async () => {
    __setServiceContextForTests(null)
    await tdb?.destroy()
  })

  it('未登录 GET /catalog → 401', async () => {
    mockSession.current = null
    const res = await getCatalog(req('GET', '/api/admin/catalog'))
    expect(res.status).toBe(401)
  })
  it('非管理员 → 403', async () => {
    mockSession.current = nonAdminSession
    const res = await getCatalog(req('GET', '/api/admin/catalog'))
    expect(res.status).toBe(403)
  })
  it('GET /catalog → {yaml, version}(空库 version 0)', async () => {
    mockSession.current = adminSession
    const res = await getCatalog(req('GET', '/api/admin/catalog'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveProperty('yaml')
    expect(body.data).toHaveProperty('version')
  })
  it('GET /catalog/versions → items[];单版本 404 再 apply 后可取', async () => {
    mockSession.current = adminSession
    const list0 = await (await listVersions(req('GET', '/api/admin/catalog/versions'))).json()
    expect(Array.isArray(list0.data.items)).toBe(true)
    // 直接用 service 造一个版本(apply 端点在 Task 4)
    await (await import('@/server/services/catalog-service')).createCatalogService(ctx).apply({ yaml: DOC(), source: 'console' })
    const v1res = await getVersion(req('GET', '/api/admin/catalog/versions/1'), p({ version: '1' }))
    expect(v1res.status).toBe(200)
    expect((await v1res.json()).data.version).toBe(1)
    const vMissing = await getVersion(req('GET', '/api/admin/catalog/versions/999'), p({ version: '999' }))
    expect(vMissing.status).toBe(404)
  })
})
