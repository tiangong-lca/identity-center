import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createApplicationService } from '@/server/services/application-service'
import { createAssignmentService } from '@/server/services/assignment-service'
import type { ServiceContext } from '@/server/services/context'
import { createUserService } from '@/server/services/user-service'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)

describe('L3 核心链路(真实 PG + Keycloak)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  let brokenCtx: ServiceContext
  let keycloakUserId: string
  let portalUserId: string
  let applicationId: string

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    const kcConfig = await resolveAdminApiConfig()
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(kcConfig) }
    // 错误端口模拟 Keycloak 不可达(投影失败注入)
    brokenCtx = {
      db: tdb.db,
      keycloak: createKeycloakAdmin({ ...kcConfig, baseUrl: 'http://localhost:18080' }),
    }
  })

  afterAll(async () => {
    if (keycloakUserId) await ctx.keycloak.deleteUser(keycloakUserId).catch(() => {})
    await tdb?.destroy()
  })

  it('用户创建:KC 用户 + 镜像 + outbox + 审计', async () => {
    const users = createUserService(ctx)
    const created = await users.create({
      email: `svc-${suffix}@test.local`,
      displayName: '服务 测试',
      temporaryPassword: 'Temp-Svc-2026',
    })
    portalUserId = created.id
    keycloakUserId = created.keycloakUserId as string
    expect(created.status).toBe('active')
    expect(created.keycloakSub).toBe(keycloakUserId)

    const outbox = await tdb.db.query.outboxEvents.findMany({
      where: eq(schema.outboxEvents.eventType, 'identity.user.created'),
    })
    expect(outbox).toHaveLength(1)
    expect((outbox[0].payload as { eventId: string }).eventId).toMatch(/^evt_/)

    const audits = await tdb.db.query.auditLogs.findMany({
      where: eq(schema.auditLogs.action, 'user.create'),
    })
    expect(audits).toHaveLength(1)
  })

  it('重复邮箱创建 → CONFLICT', async () => {
    const users = createUserService(ctx)
    await expect(
      users.create({ email: `svc-${suffix}@test.local`, temporaryPassword: 'Temp-Svc-2026' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('禁用:KC disable 成功为完成点,镜像+事件+审计齐备;启用对称', async () => {
    const users = createUserService(ctx)
    const disabled = await users.disable(portalUserId)
    expect(disabled.status).toBe('disabled')
    expect((await ctx.keycloak.getUser(keycloakUserId))?.enabled).toBe(false)

    const events = await tdb.db.query.outboxEvents.findMany({
      where: eq(schema.outboxEvents.eventType, 'identity.user.disabled'),
    })
    expect(events).toHaveLength(1)

    const enabled = await users.enable(portalUserId)
    expect(enabled.status).toBe('active')
    expect((await ctx.keycloak.getUser(keycloakUserId))?.enabled).toBe(true)
  })

  it('KC 不可达时禁用直接失败,事实不变(不产生半状态)', async () => {
    const users = createUserService(brokenCtx)
    await expect(users.disable(portalUserId)).rejects.toMatchObject({ code: 'KEYCLOAK_ERROR' })
    const user = await tdb.db.query.portalUsers.findFirst({
      where: eq(schema.portalUsers.id, portalUserId),
    })
    expect(user?.status).toBe('active')
  })

  it('应用登记:目录 + KC Client Role 就绪', async () => {
    const apps = createApplicationService(ctx)
    const app = await apps.create({
      code: `it-app-${suffix}`,
      name: '集成测试应用',
      keycloakClientId: 'user-portal',
    })
    applicationId = app.id
    expect(app.accessClientRole).toBe(`it_app_${suffix}_access`)
    const kcClient = await ctx.keycloak.findClientByClientId('user-portal')
    const role = await ctx.keycloak.raw.clients.findRole({
      id: kcClient!.id!,
      roleName: app.accessClientRole,
    })
    expect(role?.name).toBe(app.accessClientRole)
  })

  it('准入授予:事实+outbox+同步投影,KC 侧角色生效;重复授予 CONFLICT', async () => {
    const assignments = createAssignmentService(ctx)
    const { assignment, projection } = await assignments.grant(applicationId, portalUserId)
    expect(projection).toBe('projected')
    expect(assignment.status).toBe('active')

    const kcClient = await ctx.keycloak.findClientByClientId('user-portal')
    const roles = await ctx.keycloak.listUserClientRoles(keycloakUserId, kcClient!.id!)
    expect(roles.some((r) => r.name === `it_app_${suffix}_access`)).toBe(true)

    await expect(assignments.grant(applicationId, portalUserId)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('准入撤销:关键完成点达成(outcome=revoked),KC 角色消失', async () => {
    const assignments = createAssignmentService(ctx)
    const { outcome } = await assignments.revoke(applicationId, portalUserId)
    expect(outcome).toBe('revoked')

    const kcClient = await ctx.keycloak.findClientByClientId('user-portal')
    const roles = await ctx.keycloak.listUserClientRoles(keycloakUserId, kcClient!.id!)
    expect(roles.some((r) => r.name === `it_app_${suffix}_access`)).toBe(false)

    const revokedEvents = await tdb.db.query.outboxEvents.findMany({
      where: eq(schema.outboxEvents.eventType, 'access.application.revoked'),
    })
    expect(revokedEvents).toHaveLength(1)
  })

  it('KC 不可达下的授予:事实成立但投影 pending/failed(最终一致语义)', async () => {
    const assignments = createAssignmentService(brokenCtx)
    const { projection, assignment } = await assignments.grant(applicationId, portalUserId)
    expect(projection).toBe('pending')

    const row = await tdb.db.query.applicationAssignments.findFirst({
      where: eq(schema.applicationAssignments.id, assignment.id),
    })
    expect(row?.status).toBe('active')
    expect(row?.projectionStatus).toBe('failed')
    expect(row?.lastProjectionError).toBeTruthy()
  })

  it('KC 不可达下的撤销:事实 revoked + outcome=projection_failed(供 502 映射)', async () => {
    const assignments = createAssignmentService(brokenCtx)
    const { outcome, assignment } = await assignments.revoke(applicationId, portalUserId)
    expect(outcome).toBe('projection_failed')
    const row = await tdb.db.query.applicationAssignments.findFirst({
      where: eq(schema.applicationAssignments.id, assignment.id),
    })
    expect(row?.status).toBe('revoked')
    expect(row?.projectionStatus).toBe('failed')
  })
})
