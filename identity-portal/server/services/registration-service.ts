import { and, count, desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { defaultEmailVerified } from '@/lib/config/email'
import { buildPageResult, paginate, type PageParams } from '@/lib/db/pagination'
import { ApiError } from '@/lib/http/api-error'
import { requestedAccessSchema, type RequestedAccessEntry } from '@/lib/registration/requested-access'
import { EVENT_TYPES } from '@/lib/sync/event-types'
import { appendOutboxEvent } from '@/lib/sync/outbox'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

export type RegistrationRequest = typeof schema.registrationRequests.$inferSelect

/** D7:requested_access 的 DB 存在性校验(形状校验由 zod 完成) */
export async function validateRequestedAccess(
  db: ServiceContext['db'],
  entries: RequestedAccessEntry[],
): Promise<void> {
  for (const entry of entries) {
    const app = await db.query.applications.findFirst({
      where: and(
        eq(schema.applications.code, entry.applicationCode),
        eq(schema.applications.status, 'active'),
      ),
    })
    if (!app) throw new ApiError('VALIDATION_ERROR', `应用不存在或未启用: ${entry.applicationCode}`)
    if (entry.roleCode) {
      const roles = await db.query.applicationRoles.findMany({
        where: and(
          eq(schema.applicationRoles.applicationId, app.id),
          eq(schema.applicationRoles.status, 'active'),
        ),
      })
      if (!roles.some((r) => r.code === entry.roleCode)) {
        throw new ApiError('VALIDATION_ERROR', `角色不属于该应用: ${entry.applicationCode}/${entry.roleCode}`)
      }
    }
  }
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

/** 注册审批(总体架构 §2:注册审批 → 开通账号;准入/角色分配为独立后续环节) */
export function createRegistrationService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)

  return {
    /** 公共入口提交(防枚举:无论邮箱是否已存在都返回成功;重复 pending 幂等返回) */
    async submit(input: {
      email: string
      displayName?: string
      requestedOrganizationId?: string
      requestedReason?: string
      requestedAccess?: RequestedAccessEntry[]
    }) {
      const pending = await ctx.db.query.registrationRequests.findFirst({
        where: eq(schema.registrationRequests.email, input.email),
        orderBy: desc(schema.registrationRequests.createdAt),
      })
      if (pending?.status === 'pending') return pending

      const requestedAccess = input.requestedAccess?.length
        ? requestedAccessSchema.parse(input.requestedAccess)
        : undefined
      if (requestedAccess) await validateRequestedAccess(ctx.db, requestedAccess)

      const [row] = await ctx.db
        .insert(schema.registrationRequests)
        .values({ ...input, requestedAccess: requestedAccess ?? null, status: 'pending', approvalRequired: true })
        .returning()
      return row
    },

    async get(id: string): Promise<RegistrationRequest | undefined> {
      return ctx.db.query.registrationRequests.findFirst({
        where: eq(schema.registrationRequests.id, id),
      })
    },

    async list(params: PageParams & { status?: string }) {
      const { page, pageSize, limit, offset } = paginate(params)
      const where = params.status
        ? eq(schema.registrationRequests.status, params.status)
        : undefined
      const items = await ctx.db
        .select()
        .from(schema.registrationRequests)
        .where(where)
        .orderBy(desc(schema.registrationRequests.createdAt))
        .limit(limit)
        .offset(offset)
      const [{ n: total }] = await ctx.db
        .select({ n: count() })
        .from(schema.registrationRequests)
        .where(where)
      return buildPageResult(items, total, page, pageSize)
    },

    /**
     * 审批通过:KC 确保用户(不存在则创建,触发邮箱验证)→ 事务[approved + portal_users 镜像 + outbox]。
     * 审批通过 ≠ 获得任何应用准入(独立环节)。
     */
    async approve(id: string, input: { reviewComment?: string; temporaryPassword?: string }) {
      const request = await this.get(id)
      if (!request) throw new ApiError('NOT_FOUND', '注册申请不存在')
      if (request.status !== 'pending') {
        throw new ApiError('CONFLICT', `申请状态为 ${request.status},仅 pending 可审批`)
      }

      const kcUser = await ctx.keycloak.findUserByEmail(request.email)
      let keycloakUserId = kcUser?.id
      if (!keycloakUserId) {
        keycloakUserId = await ctx.keycloak.createUser({
          email: request.email,
          displayName: request.displayName ?? undefined,
          temporaryPassword: input.temporaryPassword ?? `Welcome-${crypto.randomUUID().slice(0, 8)}!`,
          enabled: true,
          // 不要求邮箱验证时直接标记已验证,避免开通账号登录被验证流程拦截(无 SMTP 场景)
          emailVerified: defaultEmailVerified(),
        })
      }

      const reviewer = actorOf()
      const result = await ctx.db.transaction(async (tx) => {
        let portalUser = await ctx.db.query.portalUsers.findFirst({
          where: eq(schema.portalUsers.keycloakSub, keycloakUserId),
        })
        if (!portalUser) {
          ;[portalUser] = await tx
            .insert(schema.portalUsers)
            .values({
              keycloakSub: keycloakUserId,
              keycloakUserId,
              email: request.email,
              displayName: request.displayName,
              status: 'active',
            })
            .returning()
          await appendOutboxEvent(tx, {
            eventType: EVENT_TYPES.USER_CREATED,
            payload: { keycloakSub: keycloakUserId, email: request.email, source: 'registration' },
          })
        }
        const [updated] = await tx
          .update(schema.registrationRequests)
          .set({
            status: 'approved',
            portalUserId: portalUser.id,
            keycloakSub: keycloakUserId,
            reviewedBy: reviewer.actorKeycloakSub,
            reviewedAt: new Date(),
            reviewComment: input.reviewComment,
            updatedAt: new Date(),
          })
          .where(eq(schema.registrationRequests.id, id))
          .returning()
        return { request: updated, portalUser }
      })

      await audit.append({
        ...reviewer,
        action: 'registration.approve',
        targetType: 'registration_request',
        targetId: id,
        afterData: { email: request.email, portalUserId: result.portalUser.id },
        result: 'success',
      })
      return result
    },

    async reject(id: string, input: { reviewComment?: string }) {
      const request = await this.get(id)
      if (!request) throw new ApiError('NOT_FOUND', '注册申请不存在')
      if (request.status !== 'pending') {
        throw new ApiError('CONFLICT', `申请状态为 ${request.status},仅 pending 可拒绝`)
      }
      const reviewer = actorOf()
      const [updated] = await ctx.db
        .update(schema.registrationRequests)
        .set({
          status: 'rejected',
          reviewedBy: reviewer.actorKeycloakSub,
          reviewedAt: new Date(),
          reviewComment: input.reviewComment,
          updatedAt: new Date(),
        })
        .where(eq(schema.registrationRequests.id, id))
        .returning()
      await audit.append({
        ...reviewer,
        action: 'registration.reject',
        targetType: 'registration_request',
        targetId: id,
        afterData: { reviewComment: input.reviewComment ?? null },
        result: 'success',
      })
      return updated
    },
  }
}

export type RegistrationService = ReturnType<typeof createRegistrationService>
