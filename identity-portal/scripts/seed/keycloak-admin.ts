import KcAdminClient from '@keycloak/keycloak-admin-client'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'

type Db = NodePgDatabase<typeof schema>

export type SeedAdminConfig = {
  baseUrl: string
  realm: string
  adminUsername: string
  adminPassword: string
  seedEmail: string
  seedTempPassword: string
}

export function seedAdminConfigFromEnv(): SeedAdminConfig {
  return {
    baseUrl: process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM ?? 'company-dev',
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    seedEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@identity.local',
    seedTempPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Identity-Admin-2026',
  }
}

/**
 * 种子管理员闭环(幂等):
 * Keycloak 用户(临时密码,首登强制改密)+ realm 角色(admin_console_access/platform_admin)
 * → 镜像 portal_users → 绑定本地 platform_admin(global)。
 */
export async function seedKeycloakAdmin(db: Db, cfg: SeedAdminConfig) {
  const kc = new KcAdminClient({ baseUrl: cfg.baseUrl, realmName: 'master' })
  await kc.auth({
    username: cfg.adminUsername,
    password: cfg.adminPassword,
    grantType: 'password',
    clientId: 'admin-cli',
  })
  kc.setConfig({ realmName: cfg.realm })

  let user = (await kc.users.find({ email: cfg.seedEmail, exact: true }))[0]
  if (!user) {
    const { id } = await kc.users.create({
      username: cfg.seedEmail,
      email: cfg.seedEmail,
      emailVerified: true,
      enabled: true,
      firstName: 'Platform',
      lastName: 'Admin',
      credentials: [{ type: 'password', value: cfg.seedTempPassword, temporary: true }],
    })
    user = (await kc.users.findOne({ id }))!
  }
  const userId = user.id as string

  const wanted = ['admin_console_access', 'platform_admin']
  const current = await kc.users.listRealmRoleMappings({ id: userId })
  const missing = wanted.filter((w) => !current.some((r) => r.name === w))
  if (missing.length > 0) {
    const all = await kc.roles.find()
    const toAdd = all
      .filter((r) => r.name && missing.includes(r.name))
      .map((r) => ({ id: r.id as string, name: r.name as string }))
    if (toAdd.length > 0) await kc.users.addRealmRoleMappings({ id: userId, roles: toAdd })
  }

  // Keycloak 本地用户 sub 即用户 ID;联邦身份场景两者可能不同,分别保存
  const keycloakSub = userId
  let portalUser = await db.query.portalUsers.findFirst({
    where: eq(schema.portalUsers.keycloakSub, keycloakSub),
  })
  if (!portalUser) {
    const [inserted] = await db
      .insert(schema.portalUsers)
      .values({
        keycloakSub,
        keycloakUserId: userId,
        email: cfg.seedEmail,
        displayName: 'Platform Admin',
        status: 'active',
      })
      .returning()
    portalUser = inserted
  }

  const platformAdminRole = await db.query.adminRoles.findFirst({
    where: eq(schema.adminRoles.code, 'platform_admin'),
  })
  if (!platformAdminRole) throw new Error('内置角色 platform_admin 缺失,请先执行 seedAdminRbac')

  const bound = await db.query.adminUserRoles.findFirst({
    where: eq(schema.adminUserRoles.portalUserId, portalUser.id),
  })
  if (!bound) {
    await db.insert(schema.adminUserRoles).values({
      portalUserId: portalUser.id,
      adminRoleId: platformAdminRole.id,
      scopeType: 'global',
      scopeId: '',
    })
  }

  return { keycloakSub, portalUserId: portalUser.id }
}
