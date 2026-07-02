import { randomBytes } from 'node:crypto'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { createDbClient, type DbClient } from '@/lib/db/client'

export type TestDb = DbClient & {
  /** 删除临时库,测试结束必须调用 */
  destroy: () => Promise<void>
  databaseName: string
}

/** 从零创建临时数据库并执行全部迁移 —— 每次调用都验证"迁移从零可执行" */
export async function createMigratedTestDb(adminUrl: string): Promise<TestDb> {
  const databaseName = `identity_test_${randomBytes(6).toString('hex')}`
  const admin = new Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${databaseName}`)
  await admin.end()

  const url = new URL(adminUrl)
  url.pathname = `/${databaseName}`
  const client = createDbClient(url.toString())
  await migrate(client.db, { migrationsFolder: 'db/migrations' })

  return {
    ...client,
    databaseName,
    destroy: async () => {
      await client.close()
      const adminAgain = new Client({ connectionString: adminUrl })
      await adminAgain.connect()
      await adminAgain.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
      await adminAgain.end()
    },
  }
}
