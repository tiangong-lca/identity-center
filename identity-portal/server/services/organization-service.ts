import { and, count, desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { buildPageResult, paginate, type PageParams } from '@/lib/db/pagination'
import { ApiError } from '@/lib/http/api-error'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

export type PlatformOrganization = typeof schema.platformOrganizations.$inferSelect

function actorOf() {
  const c = getAuditContext()
  return {
    actorKeycloakSub: c?.actor?.keycloakSub ?? 'system',
    actorEmail: c?.actor?.email,
    requestId: c?.requestId,
    traceId: c?.traceId,
    operationId: c?.operationId,
  }
}

export function createOrganizationService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)

  return {
    async get(id: string) {
      return ctx.db.query.platformOrganizations.findFirst({
        where: eq(schema.platformOrganizations.id, id),
      })
    },

    async list(params: PageParams & { parentId?: string }) {
      const { page, pageSize, limit, offset } = paginate(params)
      const where = params.parentId
        ? eq(schema.platformOrganizations.parentId, params.parentId)
        : undefined
      const items = await ctx.db
        .select()
        .from(schema.platformOrganizations)
        .where(where)
        .orderBy(desc(schema.platformOrganizations.createdAt))
        .limit(limit)
        .offset(offset)
      const [{ n: total }] = await ctx.db
        .select({ n: count() })
        .from(schema.platformOrganizations)
        .where(where)
      return buildPageResult(items, total, page, pageSize)
    },

    async create(input: { code: string; name: string; type?: string; parentId?: string }) {
      const dup = await ctx.db.query.platformOrganizations.findFirst({
        where: eq(schema.platformOrganizations.code, input.code),
      })
      if (dup) throw new ApiError('CONFLICT', `组织 code ${input.code} 已存在`)
      if (input.parentId) {
        const parent = await this.get(input.parentId)
        if (!parent) throw new ApiError('VALIDATION_ERROR', '父组织不存在')
      }
      const [row] = await ctx.db.insert(schema.platformOrganizations).values(input).returning()
      await audit.append({
        ...actorOf(),
        action: 'org.create',
        targetType: 'organization',
        targetId: row.id,
        afterData: { code: input.code, name: input.name },
        result: 'success',
      })
      return row
    },

    async update(id: string, patch: { name?: string; status?: string; type?: string }) {
      const before = await this.get(id)
      if (!before) throw new ApiError('NOT_FOUND', '组织不存在')
      const [row] = await ctx.db
        .update(schema.platformOrganizations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.platformOrganizations.id, id))
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'org.update',
        targetType: 'organization',
        targetId: id,
        beforeData: { name: before.name, status: before.status },
        afterData: patch,
        result: 'success',
      })
      return row
    },

    async listMembers(organizationId: string) {
      return ctx.db.query.platformOrganizationMembers.findMany({
        where: eq(schema.platformOrganizationMembers.organizationId, organizationId),
      })
    },

    async addMember(organizationId: string, portalUserId: string, memberType = 'member') {
      const org = await this.get(organizationId)
      if (!org) throw new ApiError('NOT_FOUND', '组织不存在')
      const dup = await ctx.db.query.platformOrganizationMembers.findFirst({
        where: and(
          eq(schema.platformOrganizationMembers.organizationId, organizationId),
          eq(schema.platformOrganizationMembers.portalUserId, portalUserId),
        ),
      })
      if (dup) throw new ApiError('CONFLICT', '用户已是组织成员')
      const [row] = await ctx.db
        .insert(schema.platformOrganizationMembers)
        .values({ organizationId, portalUserId, memberType, joinedAt: new Date() })
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'org.add_member',
        targetType: 'organization',
        targetId: organizationId,
        afterData: { portalUserId, memberType },
        result: 'success',
      })
      return row
    },

    async removeMember(organizationId: string, portalUserId: string) {
      const deleted = await ctx.db
        .delete(schema.platformOrganizationMembers)
        .where(
          and(
            eq(schema.platformOrganizationMembers.organizationId, organizationId),
            eq(schema.platformOrganizationMembers.portalUserId, portalUserId),
          ),
        )
        .returning()
      if (deleted.length === 0) throw new ApiError('NOT_FOUND', '成员关系不存在')
      await audit.append({
        ...actorOf(),
        action: 'org.remove_member',
        targetType: 'organization',
        targetId: organizationId,
        beforeData: { portalUserId },
        result: 'success',
      })
    },

    // ---- 组织 ↔ 业务应用映射 ----
    async listMappings(organizationId: string) {
      return ctx.db.query.businessAppOrganizationMappings.findMany({
        where: eq(schema.businessAppOrganizationMappings.platformOrganizationId, organizationId),
      })
    },

    async setMapping(organizationId: string, applicationId: string, businessAppOrgId: string) {
      const existing = await ctx.db.query.businessAppOrganizationMappings.findFirst({
        where: and(
          eq(schema.businessAppOrganizationMappings.platformOrganizationId, organizationId),
          eq(schema.businessAppOrganizationMappings.applicationId, applicationId),
        ),
      })
      const [row] = existing
        ? await ctx.db
            .update(schema.businessAppOrganizationMappings)
            .set({ businessAppOrgId, updatedAt: new Date() })
            .where(eq(schema.businessAppOrganizationMappings.id, existing.id))
            .returning()
        : await ctx.db
            .insert(schema.businessAppOrganizationMappings)
            .values({ platformOrganizationId: organizationId, applicationId, businessAppOrgId })
            .returning()
      await audit.append({
        ...actorOf(),
        action: 'org.set_mapping',
        targetType: 'organization',
        targetId: organizationId,
        afterData: { applicationId, businessAppOrgId },
        result: 'success',
      })
      return row
    },
  }
}

export type OrganizationService = ReturnType<typeof createOrganizationService>
