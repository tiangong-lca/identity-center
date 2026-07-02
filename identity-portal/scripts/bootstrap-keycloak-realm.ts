/**
 * Keycloak realm 引导脚本(幂等,可重复执行):
 *   创建/更新 realm `company-dev`、平台 Client、三个全局角色、
 *   密码与暴力破解策略、SMTP(Mailpit)、多语言(zh-CN/en)。
 *
 * 用法:
 *   pnpm bootstrap:keycloak            # 创建/更新
 *   pnpm bootstrap:keycloak -- --export  # 另导出 realm JSON 到 deploy/keycloak/
 */
import KcAdminClient from '@keycloak/keycloak-admin-client'
import 'dotenv/config'
import { writeFile } from 'node:fs/promises'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'
const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN ?? 'http://localhost:3000'

const REALM_ROLES: Record<string, string> = {
  admin_console_access: '管理后台入口准入(不表达具体权限)',
  platform_admin: '平台最高管理员种子身份',
  break_glass_admin: '紧急恢复身份,仅初始化与故障修复使用',
}

/** user-portal-admin-api service account 需要的 realm-management 角色 */
const ADMIN_API_ROLES = [
  'manage-users',
  'view-users',
  'query-users',
  'query-groups',
  'manage-clients',
  'view-clients',
  'view-realm',
  'manage-realm',
]

async function main() {
  const kc = new KcAdminClient({ baseUrl: BASE_URL, realmName: 'master' })
  await kc.auth({
    username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    grantType: 'password',
    clientId: 'admin-cli',
  })

  const realmRepresentation = {
    realm: REALM,
    enabled: true,
    displayName: 'Identity Platform',
    registrationAllowed: true,
    registrationEmailAsUsername: true,
    verifyEmail: true,
    resetPasswordAllowed: true,
    rememberMe: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    bruteForceProtected: true,
    failureFactor: 5,
    passwordPolicy: 'length(10) and notUsername(undefined) and notEmail(undefined)',
    internationalizationEnabled: true,
    supportedLocales: ['zh-CN', 'en'],
    defaultLocale: 'zh-CN',
    loginTheme: 'identity',
    smtpServer: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: process.env.SMTP_PORT ?? '1025',
      from: 'noreply@identity.local',
      fromDisplayName: 'Identity Platform',
    },
  }

  const existing = (await kc.realms.find()).find((r) => r.realm === REALM)
  if (existing) {
    await kc.realms.update({ realm: REALM }, realmRepresentation)
    console.log(`realm ${REALM} 已更新`)
  } else {
    await kc.realms.create(realmRepresentation)
    console.log(`realm ${REALM} 已创建`)
  }

  kc.setConfig({ realmName: REALM })

  for (const [name, description] of Object.entries(REALM_ROLES)) {
    const found = await kc.roles.findOneByName({ name }).catch(() => null)
    if (!found) {
      await kc.roles.create({ name, description })
      console.log(`realm role ${name} 已创建`)
    }
  }

  await ensureClient(kc, {
    clientId: 'user-portal',
    name: 'User Portal',
    description: '统一用户门户与管理后台(OIDC 登录)',
    publicClient: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [`${PORTAL_ORIGIN}/*`],
    webOrigins: [PORTAL_ORIGIN],
    attributes: {
      'post.logout.redirect.uris': `${PORTAL_ORIGIN}/*`,
      'pkce.code.challenge.method': 'S256',
    },
  })

  // 首个业务应用:Supabase(接入示例;redirect 为占位,接入方按实际域名更新)
  const supabaseOrigin = process.env.SUPABASE_APP_ORIGIN ?? 'http://localhost:3100'
  const supabaseClient = await ensureClient(kc, {
    clientId: 'supabase-business-app',
    name: 'Supabase Business App',
    description: '首个接入的业务应用(Supabase)',
    publicClient: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [`${supabaseOrigin}/*`],
    webOrigins: [supabaseOrigin],
    attributes: { 'pkce.code.challenge.method': 'S256' },
  })
  // 准入投影角色 supabase_app_access
  const existingRole = await kc.clients
    .findRole({ id: supabaseClient.id, roleName: 'supabase_app_access' })
    .catch(() => null)
  if (!existingRole) {
    await kc.clients.createRole({ id: supabaseClient.id, name: 'supabase_app_access' })
  }

  const adminApiClient = await ensureClient(kc, {
    clientId: 'user-portal-admin-api',
    name: 'User Portal Admin API',
    description: '门户服务端管理编排专用 service account',
    publicClient: false,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: true,
  })

  const saUser = await kc.clients.getServiceAccountUser({ id: adminApiClient.id })
  const realmMgmt = (await kc.clients.find({ clientId: 'realm-management' }))[0]
  if (!saUser.id || !realmMgmt?.id) {
    throw new Error('service account 或 realm-management client 缺失')
  }
  const available = await kc.users.listAvailableClientRoleMappings({
    id: saUser.id,
    clientUniqueId: realmMgmt.id,
  })
  const toAdd = available.filter((r) => r.name && ADMIN_API_ROLES.includes(r.name))
  if (toAdd.length > 0) {
    await kc.users.addClientRoleMappings({
      id: saUser.id,
      clientUniqueId: realmMgmt.id,
      roles: toAdd.map((r) => ({ id: r.id as string, name: r.name as string })),
    })
    console.log(`admin-api service account 角色已授予: ${toAdd.map((r) => r.name).join(', ')}`)
  }

  if (process.argv.includes('--export')) {
    const rep = await kc.realms.export({
      realm: REALM,
      exportClients: true,
      exportGroupsAndRoles: true,
    })
    const file = 'deploy/keycloak/realm-company-dev.json'
    await writeFile(file, `${JSON.stringify(rep, null, 2)}\n`)
    console.log(`realm 配置已导出: ${file}`)
  }

  console.log(`realm ${REALM} 就绪: ${BASE_URL}/admin/master/console/#/${REALM}`)
}

type ClientRepresentation = Parameters<KcAdminClient['clients']['create']>[0] & {
  clientId: string
}

async function ensureClient(kc: KcAdminClient, rep: ClientRepresentation): Promise<{ id: string }> {
  const found = (await kc.clients.find({ clientId: rep.clientId }))[0]
  if (found?.id) {
    await kc.clients.update({ id: found.id }, rep)
    console.log(`client ${rep.clientId} 已更新`)
    return { id: found.id }
  }
  const created = await kc.clients.create(rep)
  console.log(`client ${rep.clientId} 已创建`)
  return { id: created.id }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
