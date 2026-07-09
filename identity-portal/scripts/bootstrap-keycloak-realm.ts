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
import { emailVerificationEnabled } from '@/lib/config/email'
import { buildRealmRepresentation } from './keycloak/realm-config'
import { remediateEmailState } from './keycloak/remediate-email-state'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'
const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN ?? 'http://localhost:3000'
const KC_BACKCHANNEL_HOST = process.env.KC_BACKCHANNEL_HOST ?? 'host.docker.internal'

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

  // 邮箱验证默认关闭(无需 SMTP);设 KC_VERIFY_EMAIL=true + KC_SMTP_HOST 开启邮件链路
  const realmRepresentation = buildRealmRepresentation({
    realm: REALM,
    verifyEmail: emailVerificationEnabled(),
    smtpHost: process.env.KC_SMTP_HOST,
    smtpPort: process.env.KC_SMTP_PORT,
  })

  const existing = (await kc.realms.find()).find((r) => r.realm === REALM)
  if (existing) {
    await kc.realms.update({ realm: REALM }, realmRepresentation)
    console.log(`realm ${REALM} 已更新`)
  } else {
    await kc.realms.create(realmRepresentation)
    console.log(`realm ${REALM} 已创建`)
  }

  kc.setConfig({ realmName: REALM })

  // 邮件关闭模式:修复存量用户(realm 开关不清除用户身上已挂的 VERIFY_EMAIL 动作,
  // 历史账号登录仍会尝试发邮件并失败),统一 emailVerified=true 并剥离邮件依赖动作
  if (!emailVerificationEnabled()) {
    const { patched } = await remediateEmailState(kc)
    if (patched > 0) console.log(`存量用户邮件状态已修复:${patched} 个`)
  }

  // 用户资料由平台侧维护(portal_users.display_name),Keycloak 不做资料补全拦截:
  // 禁用 VERIFY_PROFILE,否则 lastName 等默认必填项缺失时首次登录会被"更新账户信息"页卡住
  const requiredActions = await kc.authenticationManagement.getRequiredActions()
  const verifyProfile = requiredActions.find((a) => a.alias === 'VERIFY_PROFILE')
  if (verifyProfile?.enabled) {
    await kc.authenticationManagement.updateRequiredAction(
      { alias: 'VERIFY_PROFILE' },
      { ...verifyProfile, enabled: false, defaultAction: false },
    )
    console.log('required action VERIFY_PROFILE 已禁用(资料平台侧维护)')
  }

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
      'backchannel.logout.url': `${PORTAL_ORIGIN.replace('localhost', KC_BACKCHANNEL_HOST)}/api/auth/backchannel-logout`,
      'backchannel.logout.session.required': 'true',
      'backchannel.logout.revoke.offline.tokens': 'false',
    },
  })

  // 首个业务应用:TianGong LCA(Supabase self-host 形态;OAuth RP 是 GoTrue,redirect 指向 GoTrue 回调)
  const lcaGotrueCallback =
    process.env.TIANGONG_LCA_GOTRUE_CALLBACK ?? 'http://localhost:54321/auth/v1/callback'
  const lcaAppOrigin = process.env.TIANGONG_LCA_APP_ORIGIN ?? 'http://localhost:8000'
  const lcaClient = await ensureClient(kc, {
    clientId: 'tiangong-lca-business-app',
    name: 'TianGong LCA Platform',
    description: '首个接入的业务应用(TianGong LCA,Supabase self-host)',
    publicClient: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [lcaGotrueCallback],
    webOrigins: [lcaAppOrigin],
    // GoTrue 对上游 IdP 不发 code_challenge(见 docs/references/2026-07-03-gotrue-keycloak-federation.md),
    // 不设 pkce.code.challenge.method;凭 client secret 保障
    attributes: {},
  })
  // 准入投影角色 tiangong_lca_access
  const existingLcaRole = await kc.clients
    .findRole({ id: lcaClient.id, roleName: 'tiangong_lca_access' })
    .catch(() => null)
  if (!existingLcaRole) {
    await kc.clients.createRole({ id: lcaClient.id, name: 'tiangong_lca_access' })
  }

  // 第二个业务应用:CMS(铭飞 CMS,Apache Shiro;OIDC 回调直接指向 CMS 后端)
  const cmsAppOrigin = process.env.CMS_APP_ORIGIN ?? 'http://localhost:8081'
  const cmsClient = await ensureClient(kc, {
    clientId: 'cms-business-app',
    name: 'CMS 平台',
    description: '内容管理系统(铭飞 CMS 6.2.0,OIDC 桥接)',
    publicClient: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [`${cmsAppOrigin}/ms/oidc/callback`],
    webOrigins: [cmsAppOrigin],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': `${cmsAppOrigin}/ms/login.do`,
      'backchannel.logout.url': `${cmsAppOrigin.replace('localhost', KC_BACKCHANNEL_HOST)}/ms/oidc/backchannel-logout`,
      'backchannel.logout.session.required': 'true',
      'backchannel.logout.revoke.offline.tokens': 'false',
    },
  })
  // 准入投影角色 cms_access
  const existingCmsRole = await kc.clients
    .findRole({ id: cmsClient.id, roleName: 'cms_access' })
    .catch(() => null)
  if (!existingCmsRole) {
    await kc.clients.createRole({ id: cmsClient.id, name: 'cms_access' })
  }

  const legacySupabaseClient = (await kc.clients.find({ clientId: 'supabase-business-app' }))[0]
  if (legacySupabaseClient?.id) {
    await kc.clients.del({ id: legacySupabaseClient.id })
    console.log('legacy client supabase-business-app 已移除')
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
