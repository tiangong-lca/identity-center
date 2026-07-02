import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema'

export type DbClient = {
  db: NodePgDatabase<typeof schema>
  pool: Pool
  close: () => Promise<void>
}

/**
 * 数据库连接工厂(thin adapter,decisions.md D-001):
 * PostgreSQL 与 KingbaseES(PostgreSQL 兼容模式)共用 pg 驱动,
 * 切换数据库仅需更换连接串,业务代码不感知具体产品。
 */
export function createDbClient(connectionString: string): DbClient {
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema })
  return {
    db,
    pool,
    close: () => pool.end(),
  }
}
