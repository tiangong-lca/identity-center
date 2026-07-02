import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { seedAdminRbac } from '@/scripts/seed/admin-rbac'
import { loadGrants, requirePermission } from '@/server/policies/admin-policy'
import { createAdminRbacService } from '@/server/services/admin-rbac-service'
import { createAppRoleAssignmentService } from '@/server/services/app-role-assignment-service'
import { createApplicationService } from '@/server/services/application-service'
import { createAssignmentService } from '@/server/services/assignment-service'
import type { ServiceContext } from '@/server/services/context'
import { createOrganizationService } from '@/server/services/organization-service'
import { createRegistrationService } from '@/server/services/registration-service'
import { createUserService } from '@/server/services/user-service'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)

describe('L3 注册/角色/组织/RBAC(真实 PG + Keycloak)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  const kcUserIds: string[] = []

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    await seedAdminRbac(tdb.db)
  })

  afterAll(async () => {
    for (const id of kcUserIds) await ctx.keycloak.deleteUser(id).catch(() => {})
    await tdb?.destroy()
  })

  it('注册闭环:submit → approve(KC 用户+镜像+事件)→ 状态机守卫', async () => {
    const reg = createRegistrationService(ctx)
    const email = `reg-${suffix}@test.local`
    const submitted = await reg.submit({ email, displayName: '注册 用户', requestedReason: '接入测试' })
    expect(submitted.status).toBe('pending')

    // 重复提交幂等(防枚举:返回已有 pending)
    const again = await reg.submit({ email })
    expect(again.id).toBe(submitted.id)

    const { request, portalUser } = await reg.approve(submitted.id, { reviewComment: '通过' })
    expect(request.status).toBe('approved')
    expect(portalUser.email).toBe(email)
    if (portalUser.keycloakUserId) kcUserIds.push(portalUser.keycloakUserId)

    // 已审批不可再审批
    await expect(reg.approve(submitted.id, {})).rejects.toMatchObject({ code: 'CONFLICT' })

    // KC 侧用户存在
    const kcUser = await ctx.keycloak.findUserByEmail(email)
    expect(kcUser?.id).toBeTruthy()
  })

  it('应用角色分配:需先有准入;分配/撤销产生事件', async () => {
    const users = createUserService(ctx)
    const apps = createApplicationService(ctx)
    const admissions = createAssignmentService(ctx)
    const roles = createAppRoleAssignmentService(ctx)

    const user = await users.create({
      email: `role-${suffix}@test.local`,
      temporaryPassword: 'Temp-Role-2026',
    })
    kcUserIds.push(user.keycloakUserId as string)
    const app = await apps.create({
      code: `role-app-${suffix}`,
      name: '角色测试应用',
      keycloakClientId: 'user-portal',
    })
    const role = await apps.createRole(app.id, { code: 'editor', name: '编辑' })

    // 未有准入 → CONFLICT
    await expect(
      roles.assign({ applicationId: app.id, applicationRoleId: role.id, portalUserId: user.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    await admissions.grant(app.id, user.id)
    const assigned = await roles.assign({
      applicationId: app.id,
      applicationRoleId: role.id,
      portalUserId: user.id,
      scopeType: 'org',
      scopeId: 'org-1',
    })
    expect(assigned.status).toBe('active')

    const events = await tdb.db.query.outboxEvents.findMany({
      where: eq(schema.outboxEvents.eventType, 'application.role.assigned'),
    })
    expect(events.length).toBe(1)

    const revoked = await roles.revoke(assigned.id)
    expect(revoked.status).toBe('revoked')
  })

  it('组织:创建/成员/映射,重复成员 CONFLICT', async () => {
    const orgs = createOrganizationService(ctx)
    const users = createUserService(ctx)
    const user = await users.create({
      email: `org-${suffix}@test.local`,
      temporaryPassword: 'Temp-Org-2026',
    })
    kcUserIds.push(user.keycloakUserId as string)

    const org = await orgs.create({ code: `org-${suffix}`, name: '测试部门', type: 'department' })
    await orgs.addMember(org.id, user.id, 'manager')
    await expect(orgs.addMember(org.id, user.id)).rejects.toMatchObject({ code: 'CONFLICT' })

    const apps = createApplicationService(ctx)
    const app = await apps.getByCode(`role-app-${suffix}`)
    const mapping = await orgs.setMapping(org.id, app!.id, 'biz-org-001')
    expect(mapping.businessAppOrgId).toBe('biz-org-001')
    // upsert 语义
    const mapping2 = await orgs.setMapping(org.id, app!.id, 'biz-org-002')
    expect(mapping2.id).toBe(mapping.id)
    expect(mapping2.businessAppOrgId).toBe('biz-org-002')
  })

  it('Admin RBAC:范围绑定 → loadGrants → 权限矩阵;内置角色不可删', async () => {
    const rbac = createAdminRbacService(ctx)
    const users = createUserService(ctx)
    const admin = await users.create({
      email: `rbac-${suffix}@test.local`,
      temporaryPassword: 'Temp-Rbac-2026',
    })
    kcUserIds.push(admin.keycloakUserId as string)

    const allRoles = await rbac.listRoles()
    const userAdmin = allRoles.find((r) => r.code === 'user_admin')!
    await rbac.bindUser(admin.id, userAdmin.id, { type: 'org', id: 'org-x' })

    const grants = await loadGrants(tdb.db, admin.keycloakSub)
    expect(grants).toHaveLength(1)
    expect(grants[0].permissionCodes).toContain('user:disable')

    // org-x 范围内允许
    await requirePermission(tdb.db, admin.keycloakSub, 'user:disable', { type: 'org', id: 'org-x' })
    // 其他 org 拒绝
    await expect(
      requirePermission(tdb.db, admin.keycloakSub, 'user:disable', { type: 'org', id: 'org-y' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // 无权限码拒绝
    await expect(
      requirePermission(tdb.db, admin.keycloakSub, 'settings:manage'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const platformAdmin = allRoles.find((r) => r.code === 'platform_admin')!
    await expect(rbac.deleteRole(platformAdmin.id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
