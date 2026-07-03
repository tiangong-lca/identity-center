import { and, count, desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { defaultEmailVerified } from '@/lib/config/email'
import { buildPageResult, paginate, type PageParams } from '@/lib/db/pagination'
import { ApiError, isApiError } from '@/lib/http/api-error'
import { requestedAccessSchema, type RequestedAccessEntry } from '@/lib/registration/requested-access'
import { EVENT_TYPES } from '@/lib/sync/event-types'
import { appendOutboxEvent } from '@/lib/sync/outbox'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import { createAppRoleAssignmentService } from './app-role-assignment-service'
import { createAssignmentService } from './assignment-service'
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

      /**
       * D7:审批开通账号后,逐项授予申请时选择的应用准入/角色。
       * 独立于开通事务(账号已成立的事实不因授予失败回滚),失败逐项容忍不中断循环。
       *
       * 准入(admission)与角色(role)分属两个独立的 try/catch,各自只写各自的结果字段:
       * 角色环节失败绝不会回过头去覆盖已经成功的准入结果,反之亦然。
       */
      type GrantOutcome = {
        applicationCode: string
        admission: 'granted' | 'skipped' | 'failed'
        role?: 'assigned' | 'failed'
        error?: string
      }
      const grants: GrantOutcome[] = []
      const requested = (request.requestedAccess ?? []) as RequestedAccessEntry[]
      if (requested.length > 0) {
        // 不变式:本方法内 portalUser 或为新建、或为既有的启用用户(见上方事务),恒为 active。
        // 因此下面 grant() 抛出的 CONFLICT 在此上下文中只可能是"已有准入",不可能是"用户未启用"
        // (那个分支要求 user.status !== 'active',这里不成立)—— 据此可放心把 CONFLICT 当良性 skip。
        if (result.portalUser.status !== 'active') {
          throw new ApiError('CONFLICT', '账号未启用,无法进行自动授予(不变式被打破)')
        }
        const assignments = createAssignmentService(ctx)
        const roleAssignments = createAppRoleAssignmentService(ctx)
        for (const entry of requested) {
          const outcome: GrantOutcome = { applicationCode: entry.applicationCode, admission: 'granted' }
          let admissionOk = false
          try {
            const app = await ctx.db.query.applications.findFirst({
              where: and(
                eq(schema.applications.code, entry.applicationCode),
                eq(schema.applications.status, 'active'),
              ),
            })
            if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在或未启用')
            try {
              await assignments.grant(app.id, result.portalUser.id, 'registration')
            } catch (e) {
              if (isApiError(e) && e.code === 'CONFLICT') outcome.admission = 'skipped' // 已有准入
              else throw e
            }
            admissionOk = true

            if (entry.roleCode) {
              try {
                const role = await ctx.db.query.applicationRoles.findFirst({
                  where: and(
                    eq(schema.applicationRoles.applicationId, app.id),
                    eq(schema.applicationRoles.code, entry.roleCode),
                    eq(schema.applicationRoles.status, 'active'),
                  ),
                })
                if (!role) throw new ApiError('NOT_FOUND', `角色不存在: ${entry.roleCode}`)
                try {
                  await roleAssignments.assign({
                    applicationId: app.id,
                    applicationRoleId: role.id,
                    portalUserId: result.portalUser.id,
                    scopeType: 'global',
                    source: 'registration',
                  })
                  outcome.role = 'assigned'
                } catch (e) {
                  if (isApiError(e) && e.code === 'CONFLICT') outcome.role = 'assigned' // 已存在等价分配
                  else throw e
                }
              } catch (e) {
                // 角色环节失败:只标记 role,绝不回改已经成功/跳过的 admission。
                outcome.role = 'failed'
                outcome.error = e instanceof Error ? e.message : String(e)
              }
            }
          } catch (e) {
            // 准入环节失败(含应用不存在/未启用、grant() 非 CONFLICT 报错):
            // 走到这里时角色环节必然尚未尝试(admissionOk 仍为 false),只标记 admission。
            if (!admissionOk) {
              outcome.admission = 'failed'
              outcome.error = e instanceof Error ? e.message : String(e)
            }
          }
          grants.push(outcome)
        }
      }

      try {
        await audit.append({
          ...reviewer,
          action: 'registration.approve',
          targetType: 'registration_request',
          targetId: id,
          afterData: { email: request.email, portalUserId: result.portalUser.id, grants },
          result: 'success',
        })
      } catch (e) {
        // 审计写入失败不得让已经成功落地的开通 + 授予结果回滚给调用方一个 500:
        // 账号与准入/角色事实均已持久化,这里只记录、不抛出。
        console.error('[registration-service] audit.append failed after approve()', e)
      }
      return { ...result, grants }
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
