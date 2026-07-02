import { and, count, desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { buildPageResult, paginate, type PageParams } from '@/lib/db/pagination'
import { ApiError, isApiError } from '@/lib/http/api-error'
import { EVENT_TYPES } from '@/lib/sync/event-types'
import { appendOutboxEvent } from '@/lib/sync/outbox'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

export type ApplicationAssignment = typeof schema.applicationAssignments.$inferSelect

export type GrantResult = {
  assignment: ApplicationAssignment
  /** projected=KC 投影同步完成;pending=投影失败待重投(授予为最终一致,不算失败) */
  projection: 'projected' | 'pending'
}

export type RevokeResult = {
  assignment: ApplicationAssignment
  /** revoked=关键完成点达成;projection_failed=事实已撤但 KC 投影失败(L4 映射 502,重试兜底) */
  outcome: 'revoked' | 'projection_failed'
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

export function createAssignmentService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)

  async function loadAppAndUser(applicationId: string, portalUserId: string) {
    const app = await ctx.db.query.applications.findFirst({
      where: eq(schema.applications.id, applicationId),
    })
    if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在')
    const user = await ctx.db.query.portalUsers.findFirst({
      where: eq(schema.portalUsers.id, portalUserId),
    })
    if (!user) throw new ApiError('USER_NOT_FOUND', '用户不存在')
    if (user.status !== 'active') throw new ApiError('CONFLICT', '仅启用状态用户可分配准入')
    return { app, user }
  }

  async function projectToKeycloak(
    action: 'grant' | 'revoke',
    app: typeof schema.applications.$inferSelect,
    keycloakUserId: string,
  ): Promise<void> {
    const kcClient = await ctx.keycloak.findClientByClientId(app.keycloakClientId)
    if (!kcClient?.id) throw new ApiError('KEYCLOAK_ERROR', `client ${app.keycloakClientId} 不存在`)
    if (action === 'grant') {
      await ctx.keycloak.grantClientRole(keycloakUserId, kcClient.id, app.accessClientRole)
    } else {
      await ctx.keycloak.revokeClientRole(keycloakUserId, kcClient.id, app.accessClientRole)
    }
  }

  return {
    async listByApplication(applicationId: string, params: PageParams & { status?: string }) {
      const { page, pageSize, limit, offset } = paginate(params)
      const where = params.status
        ? and(
            eq(schema.applicationAssignments.applicationId, applicationId),
            eq(schema.applicationAssignments.status, params.status),
          )
        : eq(schema.applicationAssignments.applicationId, applicationId)
      const items = await ctx.db
        .select()
        .from(schema.applicationAssignments)
        .where(where)
        .orderBy(desc(schema.applicationAssignments.createdAt))
        .limit(limit)
        .offset(offset)
      const [{ n: total }] = await ctx.db
        .select({ n: count() })
        .from(schema.applicationAssignments)
        .where(where)
      return buildPageResult(items, total, page, pageSize)
    },

    async listByUser(portalUserId: string) {
      return ctx.db.query.applicationAssignments.findMany({
        where: eq(schema.applicationAssignments.portalUserId, portalUserId),
      })
    },

    /** 授予(最终一致):事实+outbox 同事务 → 同步尝试 KC 投影,失败留给重投影任务 */
    async grant(applicationId: string, portalUserId: string, source = 'admin'): Promise<GrantResult> {
      const { app, user } = await loadAppAndUser(applicationId, portalUserId)

      const existing = await ctx.db.query.applicationAssignments.findFirst({
        where: and(
          eq(schema.applicationAssignments.applicationId, applicationId),
          eq(schema.applicationAssignments.portalUserId, portalUserId),
        ),
      })
      if (existing?.status === 'active') throw new ApiError('CONFLICT', '该用户已具有此应用准入')

      const assignment = await ctx.db.transaction(async (tx) => {
        let row: ApplicationAssignment
        if (existing) {
          ;[row] = await tx
            .update(schema.applicationAssignments)
            .set({ status: 'active', source, projectionStatus: 'pending', lastProjectionError: null, updatedAt: new Date() })
            .where(eq(schema.applicationAssignments.id, existing.id))
            .returning()
        } else {
          ;[row] = await tx
            .insert(schema.applicationAssignments)
            .values({
              applicationId,
              portalUserId,
              keycloakSub: user.keycloakSub,
              status: 'active',
              source,
              projectionStatus: 'pending',
            })
            .returning()
        }
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.ACCESS_GRANTED,
          payload: {
            keycloakSub: user.keycloakSub,
            applicationCode: app.code,
            applicationId,
            assignmentId: row.id,
          },
        })
        return row
      })

      let projection: GrantResult['projection'] = 'pending'
      try {
        await projectToKeycloak('grant', app, user.keycloakUserId ?? user.keycloakSub)
        const [updated] = await ctx.db
          .update(schema.applicationAssignments)
          .set({ projectionStatus: 'projected', projectedAt: new Date(), lastProjectionError: null })
          .where(eq(schema.applicationAssignments.id, assignment.id))
          .returning()
        projection = 'projected'
        assignment.projectionStatus = updated.projectionStatus
      } catch (error) {
        const message = isApiError(error) ? error.message : String(error)
        await ctx.db
          .update(schema.applicationAssignments)
          .set({ projectionStatus: 'failed', lastProjectionError: message })
          .where(eq(schema.applicationAssignments.id, assignment.id))
      }

      await audit.append({
        ...actorOf(),
        action: 'app.assign_user',
        targetType: 'application_assignment',
        targetId: assignment.id,
        afterData: { applicationId, portalUserId, projection },
        result: 'success',
      })
      return { assignment, projection }
    },

    /** 撤销(决议 7/10):事实立即 revoked,以 KC Client Role 移除成功为关键完成点 */
    async revoke(applicationId: string, portalUserId: string): Promise<RevokeResult> {
      const { app, user } = await loadAppAndUser(applicationId, portalUserId).catch(async (e) => {
        // 撤销允许对禁用用户执行(禁用用户更要能撤权)
        if (isApiError(e) && e.message.includes('仅启用状态')) {
          const app2 = await ctx.db.query.applications.findFirst({ where: eq(schema.applications.id, applicationId) })
          const user2 = await ctx.db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.id, portalUserId) })
          if (app2 && user2) return { app: app2, user: user2 }
        }
        throw e
      })

      const existing = await ctx.db.query.applicationAssignments.findFirst({
        where: and(
          eq(schema.applicationAssignments.applicationId, applicationId),
          eq(schema.applicationAssignments.portalUserId, portalUserId),
        ),
      })
      if (!existing || existing.status !== 'active') {
        throw new ApiError('CONFLICT', '不存在生效中的准入')
      }

      const assignment = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.applicationAssignments)
          .set({ status: 'revoked', projectionStatus: 'pending', updatedAt: new Date() })
          .where(eq(schema.applicationAssignments.id, existing.id))
          .returning()
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.ACCESS_REVOKED,
          payload: {
            keycloakSub: user.keycloakSub,
            applicationCode: app.code,
            applicationId,
            assignmentId: row.id,
          },
        })
        return row
      })

      let outcome: RevokeResult['outcome']
      try {
        await projectToKeycloak('revoke', app, user.keycloakUserId ?? user.keycloakSub)
        await ctx.db
          .update(schema.applicationAssignments)
          .set({ projectionStatus: 'projected', projectedAt: new Date(), lastProjectionError: null })
          .where(eq(schema.applicationAssignments.id, assignment.id))
        outcome = 'revoked'
      } catch (error) {
        const message = isApiError(error) ? error.message : String(error)
        await ctx.db
          .update(schema.applicationAssignments)
          .set({ projectionStatus: 'failed', lastProjectionError: message })
          .where(eq(schema.applicationAssignments.id, assignment.id))
        outcome = 'projection_failed'
      }

      await audit.append({
        ...actorOf(),
        action: 'app.revoke_user',
        targetType: 'application_assignment',
        targetId: assignment.id,
        afterData: { applicationId, portalUserId, outcome },
        result: outcome === 'revoked' ? 'success' : 'failure',
        failureReason: outcome === 'projection_failed' ? 'Keycloak 投影失败,已进入重试' : undefined,
      })
      return { assignment, outcome }
    },
  }
}

export type AssignmentService = ReturnType<typeof createAssignmentService>
