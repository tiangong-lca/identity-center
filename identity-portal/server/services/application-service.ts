import { and, count, desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { ApiError } from '@/lib/http/api-error'
import { buildPageResult, paginate, type PageParams } from '@/lib/db/pagination'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

export type Application = typeof schema.applications.$inferSelect
export type ApplicationRole = typeof schema.applicationRoles.$inferSelect

export type CreateApplicationInput = {
  code: string
  name: string
  keycloakClientId: string
  accessClientRole?: string
  loginUrl?: string
  adminUrl?: string
  webhookUrl?: string
  webhookSecretRef?: string
}

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

export function createApplicationService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)

  return {
    async get(id: string): Promise<Application | undefined> {
      return ctx.db.query.applications.findFirst({ where: eq(schema.applications.id, id) })
    },

    async getByCode(code: string): Promise<Application | undefined> {
      return ctx.db.query.applications.findFirst({ where: eq(schema.applications.code, code) })
    },

    async list(params: PageParams & { status?: string }) {
      const { page, pageSize, limit, offset } = paginate(params)
      const where = params.status ? eq(schema.applications.status, params.status) : undefined
      const items = await ctx.db
        .select()
        .from(schema.applications)
        .where(where)
        .orderBy(desc(schema.applications.createdAt))
        .limit(limit)
        .offset(offset)
      const [{ n: total }] = await ctx.db
        .select({ n: count() })
        .from(schema.applications)
        .where(where)
      return buildPageResult(items, total, page, pageSize)
    },

    /** 登记应用:写目录 + 确保 KC client 存在 + 确保准入 Client Role 存在(设计:接入十步) */
    async create(input: CreateApplicationInput): Promise<Application> {
      const existing = await this.getByCode(input.code)
      if (existing) throw new ApiError('CONFLICT', `应用 code ${input.code} 已存在`)

      const kcClient = await ctx.keycloak.findClientByClientId(input.keycloakClientId)
      if (!kcClient?.id) {
        throw new ApiError('VALIDATION_ERROR', `Keycloak client ${input.keycloakClientId} 不存在,请先在 Keycloak 创建`)
      }
      const accessClientRole = input.accessClientRole ?? `${input.code.replace(/-/g, '_')}_access`
      await ctx.keycloak.ensureClientRole(kcClient.id, accessClientRole)

      const [row] = await ctx.db
        .insert(schema.applications)
        .values({ ...input, accessClientRole, status: 'active' })
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'app.create',
        targetType: 'application',
        targetId: row.id,
        afterData: { code: input.code, keycloakClientId: input.keycloakClientId, accessClientRole },
        result: 'success',
      })
      return row
    },

    async update(
      id: string,
      patch: Partial<Pick<Application, 'name' | 'status' | 'loginUrl' | 'adminUrl' | 'webhookUrl' | 'webhookSecretRef'>>,
    ): Promise<Application> {
      const before = await this.get(id)
      if (!before) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在')
      const [row] = await ctx.db
        .update(schema.applications)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.applications.id, id))
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'app.update',
        targetType: 'application',
        targetId: id,
        beforeData: { name: before.name, status: before.status },
        afterData: patch,
        result: 'success',
      })
      return row
    },

    // ---- 应用角色目录 ----
    async listRoles(applicationId: string): Promise<ApplicationRole[]> {
      return ctx.db.query.applicationRoles.findMany({
        where: eq(schema.applicationRoles.applicationId, applicationId),
      })
    },

    /** 注册页应用/角色选择目录(D7):仅 active 应用与 active 角色,仅暴露 code/name */
    async listCatalog(): Promise<Array<{ code: string; name: string; roles: Array<{ code: string; name: string }> }>> {
      const apps = await ctx.db.query.applications.findMany({
        where: eq(schema.applications.status, 'active'),
      })
      return Promise.all(
        apps.map(async (app) => {
          const roles = await ctx.db.query.applicationRoles.findMany({
            where: and(
              eq(schema.applicationRoles.applicationId, app.id),
              eq(schema.applicationRoles.status, 'active'),
            ),
          })
          return {
            code: app.code,
            name: app.name,
            roles: roles.map((r) => ({ code: r.code, name: r.name })),
          }
        }),
      )
    },

    async createRole(applicationId: string, input: { code: string; name: string; description?: string }) {
      const app = await this.get(applicationId)
      if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在')
      const dup = await ctx.db.query.applicationRoles.findFirst({
        where: and(
          eq(schema.applicationRoles.applicationId, applicationId),
          eq(schema.applicationRoles.code, input.code),
        ),
      })
      if (dup) throw new ApiError('CONFLICT', `角色 ${input.code} 已存在`)
      const [row] = await ctx.db
        .insert(schema.applicationRoles)
        .values({ applicationId, ...input })
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'app.role_create',
        targetType: 'application_role',
        targetId: row.id,
        afterData: { applicationId, code: input.code },
        result: 'success',
      })
      return row
    },

    async updateRole(roleId: string, patch: { name?: string; description?: string; status?: string }) {
      const [row] = await ctx.db
        .update(schema.applicationRoles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.applicationRoles.id, roleId))
        .returning()
      if (!row) throw new ApiError('NOT_FOUND', '角色不存在')
      return row
    },
  }
}

export type ApplicationService = ReturnType<typeof createApplicationService>
