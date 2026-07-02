/**
 * 读取 confidential client 的 secret(开发辅助):
 *   pnpm tsx scripts/print-client-secret.ts user-portal user-portal-admin-api
 * 输出可直接粘贴到 .env 的行。
 */
import KcAdminClient from '@keycloak/keycloak-admin-client'
import 'dotenv/config'

const ENV_KEYS: Record<string, string> = {
  'user-portal': 'KEYCLOAK_CLIENT_SECRET',
  'user-portal-admin-api': 'KEYCLOAK_ADMIN_API_CLIENT_SECRET',
}

async function main() {
  const clientIds = process.argv.slice(2)
  if (clientIds.length === 0) clientIds.push('user-portal', 'user-portal-admin-api')

  const kc = new KcAdminClient({
    baseUrl: process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080',
    realmName: 'master',
  })
  await kc.auth({
    username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    grantType: 'password',
    clientId: 'admin-cli',
  })
  kc.setConfig({ realmName: process.env.KEYCLOAK_REALM ?? 'company-dev' })

  for (const clientId of clientIds) {
    const client = (await kc.clients.find({ clientId }))[0]
    if (!client?.id) {
      console.error(`# client ${clientId} 不存在(先执行 pnpm bootstrap:keycloak)`)
      continue
    }
    const { value } = await kc.clients.getClientSecret({ id: client.id })
    console.log(`${ENV_KEYS[clientId] ?? `${clientId.toUpperCase()}_SECRET`}=${value}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
