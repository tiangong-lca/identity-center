import { createHash } from 'node:crypto'
import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'
import { buildPageResult, paginate, type PageParams, type PageResult } from '@/lib/db/pagination'

type Db = NodePgDatabase<typeof schema>

export type AuditLog = typeof schema.auditLogs.$inferSelect
export type AppendAuditLog = Omit<
  typeof schema.auditLogs.$inferInsert,
  'id' | 'recordHash' | 'previousHash' | 'createdAt'
>

export type ListAuditLogsParams = PageParams & {
  action?: string
  actorKeycloakSub?: string
  targetType?: string
  targetId?: string
}

/** 稳定序列化(键排序),保证 hash 与 JSON 键序无关 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
}

export function computeRecordHash(previousHash: string | null, record: AppendAuditLog): string {
  return createHash('sha256')
    .update(`${previousHash ?? ''}|${canonicalize(record)}`)
    .digest('hex')
}

/**
 * 审计日志仓储(append-only):
 * 每条记录 record_hash = sha256(previous_hash + canonical(record)) 构成 hash 链。
 * 仅提供 append 与查询,不提供更新/删除。
 */
export function createAuditLogRepository(db: Db) {
  return {
    async append(entry: AppendAuditLog): Promise<AuditLog> {
      // 事务内取链尾,保证链连续(并发下由事务顺序化)
      return db.transaction(async (tx) => {
        const [last] = await tx
          .select({ recordHash: schema.auditLogs.recordHash })
          .from(schema.auditLogs)
          .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
          .limit(1)
        const previousHash = last?.recordHash ?? null
        const recordHash = computeRecordHash(previousHash, entry)
        const [row] = await tx
          .insert(schema.auditLogs)
          .values({ ...entry, previousHash, recordHash })
          .returning()
        return row
      })
    },

    async list(params: ListAuditLogsParams): Promise<PageResult<AuditLog>> {
      const { page, pageSize, limit, offset } = paginate(params)
      const conditions: SQL[] = []
      if (params.action) conditions.push(eq(schema.auditLogs.action, params.action))
      if (params.actorKeycloakSub)
        conditions.push(eq(schema.auditLogs.actorKeycloakSub, params.actorKeycloakSub))
      if (params.targetType) conditions.push(eq(schema.auditLogs.targetType, params.targetType))
      if (params.targetId) conditions.push(eq(schema.auditLogs.targetId, params.targetId))
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const items = await db
        .select()
        .from(schema.auditLogs)
        .where(where)
        .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
        .limit(limit)
        .offset(offset)
      const [{ n: total }] = await db.select({ n: count() }).from(schema.auditLogs).where(where)
      return buildPageResult(items, total, page, pageSize)
    },
  }
}

export type AuditLogRepository = ReturnType<typeof createAuditLogRepository>
