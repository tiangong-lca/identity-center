import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'
import { buildPageResult, paginate, type PageParams, type PageResult } from '@/lib/db/pagination'

type Db = NodePgDatabase<typeof schema>

export type PortalUser = typeof schema.portalUsers.$inferSelect
export type NewPortalUser = typeof schema.portalUsers.$inferInsert
export type PortalUserStatus = 'active' | 'disabled' | 'pending_deprovision' | 'deleted'

export type ListPortalUsersParams = PageParams & {
  keyword?: string
  status?: PortalUserStatus
}

export function createPortalUsersRepository(db: Db) {
  return {
    async create(values: NewPortalUser): Promise<PortalUser> {
      const [row] = await db.insert(schema.portalUsers).values(values).returning()
      return row
    },

    async findById(id: string): Promise<PortalUser | undefined> {
      return db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.id, id) })
    },

    async findByKeycloakSub(keycloakSub: string): Promise<PortalUser | undefined> {
      return db.query.portalUsers.findFirst({
        where: eq(schema.portalUsers.keycloakSub, keycloakSub),
      })
    },

    async updateStatus(id: string, status: PortalUserStatus): Promise<PortalUser | undefined> {
      const [row] = await db
        .update(schema.portalUsers)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.portalUsers.id, id))
        .returning()
      return row
    },

    async list(params: ListPortalUsersParams): Promise<PageResult<PortalUser>> {
      const { page, pageSize, limit, offset } = paginate(params)
      const conditions: SQL[] = []
      if (params.status) conditions.push(eq(schema.portalUsers.status, params.status))
      if (params.keyword) {
        const kw = `%${params.keyword}%`
        const keywordCond = or(
          ilike(schema.portalUsers.email, kw),
          ilike(schema.portalUsers.displayName, kw),
        )
        if (keywordCond) conditions.push(keywordCond)
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const items = await db
        .select()
        .from(schema.portalUsers)
        .where(where)
        .orderBy(desc(schema.portalUsers.createdAt))
        .limit(limit)
        .offset(offset)
      const [{ n: total }] = await db
        .select({ n: count() })
        .from(schema.portalUsers)
        .where(where)
      return buildPageResult(items, total, page, pageSize)
    },
  }
}

export type PortalUsersRepository = ReturnType<typeof createPortalUsersRepository>
