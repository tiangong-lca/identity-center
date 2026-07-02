import { count } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { BUILT_IN_ROLES, PERMISSIONS, seedAdminRbac } from '@/scripts/seed/admin-rbac'
import { seedAdminConfigFromEnv, seedKeycloakAdmin } from '@/scripts/seed/keycloak-admin'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]

describe('seed(幂等)', () => {
  let tdb: TestDb

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
  })

  afterAll(async () => {
    await tdb?.destroy()
  })

  it('admin RBAC 种子两遍结果一致', async () => {
    await seedAdminRbac(tdb.db)
    await seedAdminRbac(tdb.db)
    const [roles] = await tdb.db.select({ n: count() }).from(schema.adminRoles)
    const [perms] = await tdb.db.select({ n: count() }).from(schema.adminPermissions)
    const [maps] = await tdb.db.select({ n: count() }).from(schema.adminRolePermissions)
    expect(roles.n).toBe(BUILT_IN_ROLES.length)
    expect(perms.n).toBe(PERMISSIONS.length)
    expect(maps.n).toBeGreaterThan(PERMISSIONS.length) // platform_admin 全量 + 其他角色
  })

  it('种子管理员闭环(Keycloak + portal_users + platform_admin 绑定),重跑幂等', async () => {
    const cfg = seedAdminConfigFromEnv()
    const first = await seedKeycloakAdmin(tdb.db, cfg)
    const second = await seedKeycloakAdmin(tdb.db, cfg)
    expect(first.keycloakSub).toBe(second.keycloakSub)

    const users = await tdb.db.select().from(schema.portalUsers)
    expect(users).toHaveLength(1)
    expect(users[0].keycloakSub).toBeTruthy()
    expect(users[0].email).toBe(cfg.seedEmail)

    const bindings = await tdb.db.select().from(schema.adminUserRoles)
    expect(bindings).toHaveLength(1)
    expect(bindings[0].scopeType).toBe('global')
  })
})
