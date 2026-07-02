import KcAdminClient from '@keycloak/keycloak-admin-client'
import type { KeycloakConfig } from '@/lib/keycloak/admin-client'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'

/** 用 master 管理员动态取 service account secret,测试不依赖 .env 手工配置 */
export async function resolveAdminApiConfig(): Promise<KeycloakConfig> {
  const kc = new KcAdminClient({ baseUrl: BASE_URL, realmName: 'master' })
  await kc.auth({
    username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    grantType: 'password',
    clientId: 'admin-cli',
  })
  kc.setConfig({ realmName: REALM })
  const client = (await kc.clients.find({ clientId: 'user-portal-admin-api' }))[0]
  if (!client?.id) throw new Error('user-portal-admin-api 不存在,先执行 bootstrap')
  const { value } = await kc.clients.getClientSecret({ id: client.id })
  if (!value) throw new Error('无法读取 client secret')
  return { baseUrl: BASE_URL, realm: REALM, clientId: 'user-portal-admin-api', clientSecret: value }
}
