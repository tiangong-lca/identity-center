import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { ApiError } from '@/lib/http/api-error'
import { EVENT_TYPES } from '@/lib/sync/event-types'
import { appendOutboxEvent } from '@/lib/sync/outbox'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

export type ApplicationUserRole = typeof schema.applicationUserRoles.$inferSelect

export type AssignRoleInput = {
  applicationId: string
  applicationRoleId: string
  portalUserId: string
  scopeType?: 'global' | 'tenant' | 'org' | 'team' | 'project'
  scopeId?: string
  source?: string
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

/**
 * 用户应用角色分配(平台事实源;投影到业务应用走 Webhook 异步,不触碰 Keycloak)。
 * 前置:用户须已具备该应用的 active 准入。
 */
export function createAppRoleAssignmentService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)

  return {
    async listByApplication(applicationId: string) {
      return ctx.db.query.applicationUserRoles.findMany({
        where: eq(schema.applicationUserRoles.applicationId, applicationId),
      })
    },

    async assign(input: AssignRoleInput): Promise<ApplicationUserRole> {
      const scopeType = input.scopeType ?? 'global'
      const scopeId = input.scopeId ?? ''

      const role = await ctx.db.query.applicationRoles.findFirst({
        where: and(
          eq(schema.applicationRoles.id, input.applicationRoleId),
          eq(schema.applicationRoles.applicationId, input.applicationId),
        ),
      })
      if (!role) throw new ApiError('NOT_FOUND', '应用角色不存在')

      const user = await ctx.db.query.portalUsers.findFirst({
        where: eq(schema.portalUsers.id, input.portalUserId),
      })
      if (!user) throw new ApiError('USER_NOT_FOUND', '用户不存在')

      const admission = await ctx.db.query.applicationAssignments.findFirst({
        where: and(
          eq(schema.applicationAssignments.applicationId, input.applicationId),
          eq(schema.applicationAssignments.portalUserId, input.portalUserId),
          eq(schema.applicationAssignments.status, 'active'),
        ),
      })
      if (!admission) throw new ApiError('CONFLICT', '用户尚无该应用准入,请先分配准入')

      const existing = await ctx.db.query.applicationUserRoles.findFirst({
        where: and(
          eq(schema.applicationUserRoles.applicationId, input.applicationId),
          eq(schema.applicationUserRoles.applicationRoleId, input.applicationRoleId),
          eq(schema.applicationUserRoles.portalUserId, input.portalUserId),
          eq(schema.applicationUserRoles.scopeType, scopeType),
          eq(schema.applicationUserRoles.scopeId, scopeId),
        ),
      })
      if (existing?.status === 'active') throw new ApiError('CONFLICT', '该角色分配已存在')

      const row = await ctx.db.transaction(async (tx) => {
        let saved: ApplicationUserRole
        if (existing) {
          ;[saved] = await tx
            .update(schema.applicationUserRoles)
            .set({ status: 'active', projectionStatus: 'pending', updatedAt: new Date() })
            .where(eq(schema.applicationUserRoles.id, existing.id))
            .returning()
        } else {
          ;[saved] = await tx
            .insert(schema.applicationUserRoles)
            .values({
              applicationId: input.applicationId,
              applicationRoleId: input.applicationRoleId,
              portalUserId: input.portalUserId,
              keycloakSub: user.keycloakSub,
              scopeType,
              scopeId,
              source: input.source ?? 'admin',
              status: 'active',
              projectionStatus: 'pending',
            })
            .returning()
        }
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.ROLE_ASSIGNED,
          payload: {
            keycloakSub: user.keycloakSub,
            applicationId: input.applicationId,
            roleCode: role.code,
            scopeType,
            scopeId: scopeId || null,
            assignmentId: saved.id,
          },
        })
        return saved
      })

      await audit.append({
        ...actorOf(),
        action: 'role.grant',
        targetType: 'application_user_role',
        targetId: row.id,
        afterData: { roleCode: role.code, portalUserId: input.portalUserId, scopeType, scopeId },
        result: 'success',
      })
      return row
    },

    async revoke(assignmentId: string): Promise<ApplicationUserRole> {
      const existing = await ctx.db.query.applicationUserRoles.findFirst({
        where: eq(schema.applicationUserRoles.id, assignmentId),
      })
      if (!existing || existing.status !== 'active') {
        throw new ApiError('CONFLICT', '不存在生效中的角色分配')
      }
      const role = await ctx.db.query.applicationRoles.findFirst({
        where: eq(schema.applicationRoles.id, existing.applicationRoleId),
      })

      const row = await ctx.db.transaction(async (tx) => {
        const [saved] = await tx
          .update(schema.applicationUserRoles)
          .set({ status: 'revoked', projectionStatus: 'pending', updatedAt: new Date() })
          .where(eq(schema.applicationUserRoles.id, assignmentId))
          .returning()
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.ROLE_REVOKED,
          payload: {
            keycloakSub: existing.keycloakSub,
            applicationId: existing.applicationId,
            roleCode: role?.code ?? null,
            scopeType: existing.scopeType,
            scopeId: existing.scopeId || null,
            assignmentId,
          },
        })
        return saved
      })

      await audit.append({
        ...actorOf(),
        action: 'role.revoke',
        targetType: 'application_user_role',
        targetId: assignmentId,
        result: 'success',
      })
      return row
    },
  }
}

export type AppRoleAssignmentService = ReturnType<typeof createAppRoleAssignmentService>
