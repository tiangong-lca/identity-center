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

let testOverride: ServiceContext | null = null

/** 仅测试使用:注入独立 DB/Keycloak 的 ServiceContext */
export function __setServiceContextForTests(ctx: ServiceContext | null) {
  testOverride = ctx
}

export function createServiceContext(): ServiceContext {
  if (testOverride) return testOverride
  return { db: getDb().db, keycloak: getKeycloakAdmin() }
}
