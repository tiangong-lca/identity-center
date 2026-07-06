import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidPk } from './_shared'

/** 目录 apply 的追加式版本日志:审计 / 回滚源 / 乐观并发令牌(当前版本 = max(version)) */
export const catalogVersions = pgTable('catalog_versions', {
  id: uuidPk(),
  version: integer('version').notNull().unique(),
  /** 该次 apply 的完整 YAML(secretRef 形态,无明文) */
  yaml: text('yaml').notNull(),
  /** 结构化变更摘要(CatalogDiff) */
  diff: jsonb('diff'),
  appliedBy: text('applied_by').notNull(),
  /** console | cli | import */
  source: text('source').notNull().default('cli'),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().default(sql`now()`),
})
