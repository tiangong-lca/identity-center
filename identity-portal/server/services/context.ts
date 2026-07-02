import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/db/schema'
import { getDb } from '@/lib/db'
import { getKeycloakAdmin, type KeycloakAdmin } from '@/lib/keycloak/admin-client'

export type ServiceDb = NodePgDatabase<typeof schema>

/** 服务依赖注入上下文:生产用 createServiceContext(),测试注入独立实例 */
export type ServiceContext = {
  db: ServiceDb
  keycloak: KeycloakAdmin
}

export function createServiceContext(): ServiceContext {
  return { db: getDb().db, keycloak: getKeycloakAdmin() }
}
