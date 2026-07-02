import { createDbClient, type DbClient } from './client'

let singleton: DbClient | null = null

/** 应用运行时共享连接(env DATABASE_URL);测试请直接用 createDbClient 建独立连接 */
export function getDb(): DbClient {
  if (!singleton) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL 未配置')
    singleton = createDbClient(url)
  }
  return singleton
}

export { createDbClient } from './client'
export type { DbClient } from './client'
