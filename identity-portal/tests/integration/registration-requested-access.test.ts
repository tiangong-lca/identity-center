import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { createRegistrationService } from '@/server/services/registration-service'
import type { ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('registration submit: requestedAccess (D7)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  const kcUserIds: string[] = []

  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    await seedBusinessApps(tdb.db)
  })

  afterAll(async () => {
    for (const id of kcUserIds) await ctx.keycloak.deleteUser(id).catch(() => {})
    await tdb?.destroy()
  })

  it('合法选择随申请落库', async () => {
    const svc = createRegistrationService(ctx)
    const row = await svc.submit({
      email: 'u1@test.local',
      requestedAccess: [{ applicationCode: 'tiangong-lca', roleCode: 'review-admin' }],
    })
    expect(row.requestedAccess).toEqual([
      { applicationCode: 'tiangong-lca', roleCode: 'review-admin' },
    ])
  })

  it.each([
    [[{ applicationCode: 'no-such-app' }], /应用/],
    [[{ applicationCode: 'tiangong-lca', roleCode: 'no-such-role' }], /角色/],
  ])('非法选择被拒: %#', async (requestedAccess, msg) => {
    const svc = createRegistrationService(ctx)
    await expect(
      svc.submit({ email: `bad-${Math.random()}@test.local`, requestedAccess }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringMatching(msg) })
  })

  it('审批通过后自动授予所选准入与角色(source=registration)', async () => {
    const svc = createRegistrationService(ctx)
    const req = await svc.submit({
      email: 'grantee@test.local',
      requestedAccess: [{ applicationCode: 'tiangong-lca', roleCode: 'review-admin' }],
    })
    const { portalUser, grants } = await svc.approve(req.id, {})
    kcUserIds.push(portalUser.keycloakUserId!)
    expect(grants).toEqual([
      { applicationCode: 'tiangong-lca', admission: 'granted', role: 'assigned' },
    ])
    const assignment = await tdb.db.query.applicationAssignments.findFirst({
      where: eq(schema.applicationAssignments.portalUserId, portalUser.id),
    })
    expect(assignment).toMatchObject({ status: 'active', source: 'registration' })
    const roleRows = await tdb.db.query.applicationUserRoles.findMany({
      where: eq(schema.applicationUserRoles.portalUserId, portalUser.id),
    })
    expect(roleRows).toHaveLength(1)
    expect(roleRows[0]).toMatchObject({ status: 'active', source: 'registration' })
    const events = await tdb.db.query.outboxEvents.findMany()
    const types = events.map((e) => e.eventType)
    expect(types).toEqual(
      expect.arrayContaining([
        'identity.user.created', 'access.application.granted', 'application.role.assigned',
      ]),
    )
  })

  it('审批时应用已失效 → 该项 failed 但开通成功', async () => {
    const svc = createRegistrationService(ctx)
    const req = await svc.submit({
      email: 'partial@test.local',
      requestedAccess: [{ applicationCode: 'tiangong-lca' }],
    })
    await tdb.db.update(schema.applications).set({ status: 'disabled' })
      .where(eq(schema.applications.code, 'tiangong-lca'))
    const { portalUser, grants } = await svc.approve(req.id, {})
    kcUserIds.push(portalUser.keycloakUserId!)
    expect(grants[0]).toMatchObject({ applicationCode: 'tiangong-lca', admission: 'failed' })
    await tdb.db.update(schema.applications).set({ status: 'active' })
      .where(eq(schema.applications.code, 'tiangong-lca'))
  })

  it('准入成功但角色不存在(非 CONFLICT)→ admission 不应被误判为 failed', async () => {
    const svc = createRegistrationService(ctx)
    const req = await svc.submit({
      email: 'role-fail@test.local',
      requestedAccess: [{ applicationCode: 'tiangong-lca', roleCode: 'review-member' }],
    })
    // 提交时角色合法;审批前使其失效,复现"角色查找在准入之后失败"场景(非 CONFLICT)
    await tdb.db.update(schema.applicationRoles).set({ status: 'disabled' })
      .where(eq(schema.applicationRoles.code, 'review-member'))
    const { portalUser, grants } = await svc.approve(req.id, {})
    kcUserIds.push(portalUser.keycloakUserId!)
    expect(grants[0]).toMatchObject({
      applicationCode: 'tiangong-lca',
      admission: 'granted',
      role: 'failed',
      error: expect.any(String),
    })
    const assignment = await tdb.db.query.applicationAssignments.findFirst({
      where: eq(schema.applicationAssignments.portalUserId, portalUser.id),
    })
    expect(assignment).toMatchObject({ status: 'active' })
    await tdb.db.update(schema.applicationRoles).set({ status: 'active' })
      .where(eq(schema.applicationRoles.code, 'review-member'))
  })
})
