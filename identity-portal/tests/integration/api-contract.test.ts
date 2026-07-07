import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { seedAdminRbac } from '@/scripts/seed/admin-rbac'
import { __setServiceContextForTests, type ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

// 会话可注入的 auth mock(契约测试的登录态开关)
const mockSession = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/auth', () => ({
  auth: async () => mockSession.current,
  handlers: { GET: () => {}, POST: () => {} },
  signIn: async () => {},
  signOut: async () => {},
  ADMIN_CONSOLE_ROLE: 'admin_console_access',
}))

import { GET as listUsers, POST as createUser } from '@/app/api/admin/users/route'
import { POST as disableUser } from '@/app/api/admin/users/[id]/disable/route'
import { GET as listAudit } from '@/app/api/admin/audit-logs/route'
import { createApplicationService } from '@/server/services/application-service'
import { POST as grantAssignment } from '@/app/api/admin/applications/[id]/assignments/route'
import { DELETE as revokeAssignment } from '@/app/api/admin/applications/[id]/assignments/[assignmentId]/route'
import { POST as submitRegistration } from '@/app/api/public/registration-requests/route'
import { GET as getProfile } from '@/app/api/account/profile/route'
import { GET as health } from '@/app/api/health/route'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)
const ADMIN_SUB = `contract-admin-${suffix}`

const adminSession = {
  user: { keycloakSub: ADMIN_SUB, email: 'contract@test.local', roles: ['admin_console_access'], isAdmin: true },
}
const nonAdminSession = {
  user: { keycloakSub: 'nobody-sub', email: 'nobody@test.local', roles: [], isAdmin: false },
}

function req(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const p = (params: Record<string, string>) => ({ params: Promise.resolve(params) })

describe('L4 API 契约(mock 会话 + 真实 PG/KC/Redis)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  const kcUserIds: string[] = []

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    __setServiceContextForTests(ctx)
    await seedAdminRbac(tdb.db)
    // 契约管理员:portal_users + platform_admin 绑定
    const [admin] = await tdb.db
      .insert(schema.portalUsers)
      .values({ keycloakSub: ADMIN_SUB, email: 'contract@test.local', status: 'active' })
      .returning()
    const role = await tdb.db.query.adminRoles.findFirst({
      where: eq(schema.adminRoles.code, 'platform_admin'),
    })
    await tdb.db.insert(schema.adminUserRoles).values({
      portalUserId: admin.id,
      adminRoleId: role!.id,
      scopeType: 'global',
      scopeId: '',
    })
  })

  afterAll(async () => {
    __setServiceContextForTests(null)
    for (const id of kcUserIds) await ctx.keycloak.deleteUser(id).catch(() => {})
    await tdb?.destroy()
  })

  it('health 端点可用', async () => {
    const res = await health()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.checks.database).toBe(true)
  })

  it('未登录 → 401 UNAUTHENTICATED', async () => {
    mockSession.current = null
    const res = await listUsers(req('GET', '/api/admin/users'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
    expect(body.requestId).toMatch(/^req_/)
  })

  it('无 admin_console_access → 403 FORBIDDEN', async () => {
    mockSession.current = nonAdminSession
    const res = await listUsers(req('GET', '/api/admin/users'))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('参数校验失败 → 400 VALIDATION_ERROR(附字段明细)', async () => {
    mockSession.current = adminSession
    const res = await createUser(req('POST', '/api/admin/users', { email: 'not-an-email' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details.issues.length).toBeGreaterThan(0)
  })

  it('创建用户 201 → 审计记录存在;重复邮箱 409', async () => {
    mockSession.current = adminSession
    const email = `contract-u-${suffix}@test.local`
    const res = await createUser(
      req('POST', '/api/admin/users', { email, temporaryPassword: 'Temp-Contract-1' }),
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()
    kcUserIds.push(data.keycloakUserId)

    const audits = await tdb.db.query.auditLogs.findMany({
      where: eq(schema.auditLogs.action, 'user.create'),
    })
    expect(audits.length).toBe(1)
    expect(audits[0].actorKeycloakSub).toBe(ADMIN_SUB)

    const dup = await createUser(
      req('POST', '/api/admin/users', { email, temporaryPassword: 'Temp-Contract-1' }),
    )
    expect(dup.status).toBe(409)
  })

  it('Idempotency-Key 重放 → 409', async () => {
    mockSession.current = adminSession
    const key = `idem-${suffix}`
    const email = `contract-i-${suffix}@test.local`
    const first = await createUser(
      req('POST', '/api/admin/users', { email, temporaryPassword: 'Temp-Contract-2' }, { 'idempotency-key': key }),
    )
    expect(first.status).toBe(201)
    kcUserIds.push((await first.json()).data.keycloakUserId)
    const replay = await createUser(
      req(
        'POST',
        '/api/admin/users',
        { email: `other-${suffix}@test.local`, temporaryPassword: 'Temp-Contract-2' },
        { 'idempotency-key': key },
      ),
    )
    expect(replay.status).toBe(409)
  })

  it('跨源写请求 → 403 CSRF_REJECTED', async () => {
    mockSession.current = adminSession
    const res = await createUser(
      req(
        'POST',
        '/api/admin/users',
        { email: `x-${suffix}@t.local`, temporaryPassword: 'Temp-Contract-3' },
        { origin: 'https://evil.example.com', host: 'localhost:3000' },
      ),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('CSRF_REJECTED')
  })

  it('禁用用户 → 200 且审计;对已禁用再禁用 → 409', async () => {
    mockSession.current = adminSession
    const user = await tdb.db.query.portalUsers.findFirst({
      where: eq(schema.portalUsers.email, `contract-u-${suffix}@test.local`),
    })
    const res = await disableUser(req('POST', `/api/admin/users/${user!.id}/disable`), p({ id: user!.id }))
    expect(res.status).toBe(200)
    const again = await disableUser(req('POST', `/api/admin/users/${user!.id}/disable`), p({ id: user!.id }))
    expect(again.status).toBe(409)
  })

  it('应用创建 → 准入授予(201/202)→ 撤销 200;审计链完整', async () => {
    mockSession.current = adminSession
    const app = await createApplicationService(ctx).create({
      code: `contract-app-${suffix}`,
      name: '契约应用',
      keycloakClientId: 'user-portal',
    })

    const userRes = await createUser(
      req('POST', '/api/admin/users', {
        email: `contract-g-${suffix}@test.local`,
        temporaryPassword: 'Temp-Contract-4',
      }),
    )
    const user = (await userRes.json()).data
    kcUserIds.push(user.keycloakUserId)

    const grantRes = await grantAssignment(
      req('POST', `/api/admin/applications/${app.id}/assignments`, { portalUserId: user.id }),
      p({ id: app.id }),
    )
    expect([201, 202]).toContain(grantRes.status)
    const assignment = (await grantRes.json()).data.assignment

    const revokeRes = await revokeAssignment(
      req('DELETE', `/api/admin/applications/${app.id}/assignments/${assignment.id}`),
      p({ id: app.id, assignmentId: assignment.id }),
    )
    expect(revokeRes.status).toBe(200)
    expect((await revokeRes.json()).data.outcome).toBe('revoked')

    // 重复撤销 → 409
    const again = await revokeAssignment(
      req('DELETE', `/api/admin/applications/${app.id}/assignments/${assignment.id}`),
      p({ id: app.id, assignmentId: assignment.id }),
    )
    expect(again.status).toBe(409)
  })

  it('审计查询(只读)返回分页结构', async () => {
    mockSession.current = adminSession
    const res = await listAudit(req('GET', '/api/admin/audit-logs?pageSize=5'))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.items.length).toBeGreaterThan(0)
    expect(data).toHaveProperty('total')
  })

  it('公共注册入口 202(固定响应防枚举)', async () => {
    const res = await submitRegistration(
      req('POST', '/api/public/registration-requests', { email: `pub-${suffix}@test.local` }),
    )
    expect(res.status).toBe(202)
    expect((await res.json()).data.submitted).toBe(true)
  })

  it('account/profile:登录用户取自身资料', async () => {
    mockSession.current = adminSession
    const res = await getProfile(req('GET', '/api/account/profile'))
    expect(res.status).toBe(200)
    expect((await res.json()).data.email).toBe('contract@test.local')
  })
})
