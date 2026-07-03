import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { __setServiceContextForTests, type ServiceContext } from '@/server/services/context'
import { createAppRoleAssignmentService } from '@/server/services/app-role-assignment-service'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)

/**
 * application.role.* outbox payload 需带 applicationCode(与 access.* 事件对齐),
 * 消费端(业务应用)按 applicationCode 过滤,而非不跨环境稳定的 applicationId。
 */
describe('application.role.* 事件 payload 含 applicationCode(真实 PG)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  let portalUserId: string
  let applicationId: string
  let roleId: string

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    __setServiceContextForTests(ctx)

    await seedBusinessApps(tdb.db)
    const app = await tdb.db.query.applications.findFirst({
      where: eq(schema.applications.code, 'tiangong-lca'),
    })
    applicationId = app!.id
    const role = await tdb.db.query.applicationRoles.findFirst({
      where: and(
        eq(schema.applicationRoles.applicationId, applicationId),
        eq(schema.applicationRoles.code, 'review-admin'),
      ),
    })
    roleId = role!.id

    const [user] = await tdb.db
      .insert(schema.portalUsers)
      .values({ keycloakSub: `role-events-${suffix}`, email: `role-events-${suffix}@test.local`, status: 'active' })
      .returning()
    portalUserId = user.id

    // 角色分配前置:用户须已具备该应用的 active 准入(assign() 不触碰 Keycloak,直接造事实行即可)
    await tdb.db.insert(schema.applicationAssignments).values({
      applicationId,
      portalUserId,
      keycloakSub: user.keycloakSub,
      status: 'active',
    })
  })

  afterAll(async () => {
    __setServiceContextForTests(null)
    await tdb?.destroy()
  })

  it('assign() 写入的 outbox payload 含 applicationCode;revoke() 同样携带', async () => {
    const assigned = await createAppRoleAssignmentService(ctx).assign({
      applicationId,
      applicationRoleId: roleId,
      portalUserId,
      source: 'admin',
    })
    const outbox = await tdb.db.query.outboxEvents.findMany({
      where: eq(schema.outboxEvents.eventType, 'application.role.assigned'),
    })
    expect(outbox).toHaveLength(1)
    expect(outbox[0].payload).toMatchObject({
      eventType: 'application.role.assigned',
      keycloakSub: expect.any(String),
      applicationCode: 'tiangong-lca',
      roleCode: 'review-admin',
      scopeType: 'global',
    })

    await createAppRoleAssignmentService(ctx).revoke(assigned.id)
    const revoked = await tdb.db.query.outboxEvents.findMany({
      where: eq(schema.outboxEvents.eventType, 'application.role.revoked'),
    })
    expect(revoked[0].payload).toMatchObject({ applicationCode: 'tiangong-lca' })
  })
})
