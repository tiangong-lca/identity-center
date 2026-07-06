/**
 * 平台数据库种子脚本(幂等,可重复执行):
 *   1. 内置管理角色与权限清单及映射
 *   2. 种子管理员(Keycloak 用户 + portal_users 镜像 + platform_admin 绑定)
 * 前置:数据库已迁移(pnpm db:migrate)、Keycloak realm 已引导(pnpm bootstrap:keycloak)。
 */
import 'dotenv/config'
import { createDbClient } from '@/lib/db/client'
import { createKeycloakAdmin, keycloakConfigFromEnv } from '@/lib/keycloak/admin-client'
import { applyCatalogFromFile } from './apply-catalog'
import { seedAdminRbac } from './seed/admin-rbac'
import { seedAdminConfigFromEnv, seedKeycloakAdmin } from './seed/keycloak-admin'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未配置')
  const client = createDbClient(url)
  try {
    await seedAdminRbac(client.db)
    console.log('内置角色/权限/映射就绪')
    const { keycloakSub } = await seedKeycloakAdmin(client.db, seedAdminConfigFromEnv())
    console.log(`种子管理员就绪(keycloak_sub=${keycloakSub})`)
    await applyCatalogFromFile(
      { db: client.db, keycloak: createKeycloakAdmin(keycloakConfigFromEnv()) },
      'config/business-apps.yaml',
    )
    console.log('业务应用目录就绪(tiangong-lca + 3 角色)')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
