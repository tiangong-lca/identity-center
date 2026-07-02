import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * 公共列约定(KES 兼容,见 docs/references/kingbasees-compatibility-conventions.md):
 * - UUID 由应用生成,不依赖数据库函数
 * - 状态列一律 text + TS 联合类型,不用 PG ENUM
 */
export const uuidPk = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
