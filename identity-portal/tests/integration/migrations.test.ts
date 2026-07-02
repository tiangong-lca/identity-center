import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const EXPECTED_TABLES = [
  'portal_users',
  'registration_requests',
  'applications',
  'application_roles',
  'application_assignments',
  'application_user_roles',
  'platform_tenants',
  'platform_tenant_members',
  'platform_organizations',
  'platform_organization_members',
  'business_app_organization_mappings',
  'admin_roles',
  'admin_permissions',
  'admin_role_permissions',
  'admin_user_roles',
  'audit_logs',
  'outbox_events',
  'webhook_deliveries',
  'dead_letter_events',
  'processed_events',
]

describe.each(getDbTargets())('数据库迁移($name)', ({ adminUrl }) => {
  let tdb: TestDb

  beforeAll(async () => {
    tdb = await createMigratedTestDb(adminUrl)
  })

  afterAll(async () => {
    await tdb?.destroy()
  })

  it('从零迁移后 20 张表全部存在', async () => {
    const res = await tdb.db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const names = res.rows.map((r) => r.table_name as string)
    for (const t of EXPECTED_TABLES) expect(names, `缺表 ${t}`).toContain(t)
  })

  it('迁移重复执行幂等(已应用跳过)', async () => {
    await expect(migrate(tdb.db, { migrationsFolder: 'db/migrations' })).resolves.not.toThrow()
  })

  it('portal_users.keycloak_sub 唯一约束生效', async () => {
    await tdb.db.execute(
      sql`INSERT INTO portal_users (id, keycloak_sub, email) VALUES (${crypto.randomUUID()}, 'sub-uq-1', 'a@x.com')`,
    )
    await expect(
      tdb.db.execute(
        sql`INSERT INTO portal_users (id, keycloak_sub, email) VALUES (${crypto.randomUUID()}, 'sub-uq-1', 'b@x.com')`,
      ),
    ).rejects.toThrow()
  })

  it('processed_events (event_id, consumer) 主键幂等约束生效', async () => {
    await tdb.db.execute(
      sql`INSERT INTO processed_events (event_id, consumer) VALUES ('evt-1', 'worker-a')`,
    )
    await tdb.db.execute(
      sql`INSERT INTO processed_events (event_id, consumer) VALUES ('evt-1', 'worker-b')`,
    )
    await expect(
      tdb.db.execute(
        sql`INSERT INTO processed_events (event_id, consumer) VALUES ('evt-1', 'worker-a')`,
      ),
    ).rejects.toThrow()
  })

  it('application_user_roles 复合唯一(scope_id 空串归一化)生效', async () => {
    const userId = crypto.randomUUID()
    const appId = crypto.randomUUID()
    const roleId = crypto.randomUUID()
    await tdb.db.execute(
      sql`INSERT INTO portal_users (id, keycloak_sub, email) VALUES (${userId}, 'sub-role-1', 'r@x.com')`,
    )
    await tdb.db.execute(
      sql`INSERT INTO applications (id, code, name, keycloak_client_id, access_client_role) VALUES (${appId}, 'demo', 'Demo', 'demo-web', 'demo_access')`,
    )
    await tdb.db.execute(
      sql`INSERT INTO application_roles (id, application_id, code, name) VALUES (${roleId}, ${appId}, 'editor', '编辑')`,
    )
    const insert = () =>
      tdb.db.execute(
        sql`INSERT INTO application_user_roles (id, application_id, application_role_id, portal_user_id, keycloak_sub)
            VALUES (${crypto.randomUUID()}, ${appId}, ${roleId}, ${userId}, 'sub-role-1')`,
      )
    await insert()
    await expect(insert()).rejects.toThrow()
  })
})
