import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { ApiError } from '@/lib/http/api-error'
import { EVENT_TYPES } from '@/lib/sync/event-types'
import { appendOutboxEvent } from '@/lib/sync/outbox'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import {
  createPortalUsersRepository,
  type ListPortalUsersParams,
  type PortalUser,
  type PortalUserStatus,
} from '@/server/repositories/portal-users-repository'
import type { ServiceContext } from './context'

export type { ListPortalUsersParams, PortalUser, PortalUserStatus }

export type CreateUserInput = {
  email: string
  displayName?: string
  temporaryPassword: string
}

function audit(ctx: ServiceContext) {
  return createAuditLogRepository(ctx.db)
}

function actorOf() {
  const actor = getAuditContext()?.actor
  return {
    actorKeycloakSub: actor?.keycloakSub ?? 'system',
    actorEmail: actor?.email,
    ip: actor?.ip,
    userAgent: actor?.userAgent,
    requestId: getAuditContext()?.requestId,
    traceId: getAuditContext()?.traceId,
    operationId: getAuditContext()?.operationId,
  }
}

export function createUserService(ctx: ServiceContext) {
  const users = createPortalUsersRepository(ctx.db)

  return {
    get: users.findById,
    getByKeycloakSub: users.findByKeycloakSub,
    list: (params: ListPortalUsersParams) => users.list(params),

    /** 创建:KC 先行(成功后落库);DB 失败补偿删除 KC 用户,避免孤儿 */
    async create(input: CreateUserInput): Promise<PortalUser> {
      const existing = await ctx.keycloak.findUserByEmail(input.email)
      if (existing) throw new ApiError('CONFLICT', '该邮箱已存在账号')

      const keycloakUserId = await ctx.keycloak.createUser({
        email: input.email,
        displayName: input.displayName,
        temporaryPassword: input.temporaryPassword,
        enabled: true,
        emailVerified: false,
      })

      try {
        const created = await ctx.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(schema.portalUsers)
            .values({
              keycloakSub: keycloakUserId,
              keycloakUserId,
              email: input.email,
              displayName: input.displayName,
              status: 'active',
            })
            .returning()
          await appendOutboxEvent(tx, {
            eventType: EVENT_TYPES.USER_CREATED,
            payload: {
              keycloakSub: keycloakUserId,
              email: input.email,
              displayName: input.displayName ?? null,
            },
          })
          return row
        })
        await audit(ctx).append({
          ...actorOf(),
          action: 'user.create',
          targetType: 'user',
          targetId: created.id,
          afterData: { email: input.email, keycloakSub: keycloakUserId },
          result: 'success',
        })
        return created
      } catch (error) {
        // 补偿:回收 KC 用户,保持两侧一致
        await ctx.keycloak.deleteUser(keycloakUserId).catch(() => {})
        throw error
      }
    },

    /** 禁用:Keycloak disable 成功才算完成(决议 8),再镜像/发事件/登出会话 */
    async disable(portalUserId: string): Promise<PortalUser> {
      const user = await users.findById(portalUserId)
      if (!user) throw new ApiError('USER_NOT_FOUND', '用户不存在')
      if (user.status === 'disabled') throw new ApiError('CONFLICT', '用户已是禁用状态')
      if (!user.keycloakUserId) throw new ApiError('CONFLICT', '用户缺少 Keycloak 标识')

      await ctx.keycloak.setUserEnabled(user.keycloakUserId, false)

      const updated = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.portalUsers)
          .set({ status: 'disabled', updatedAt: new Date() })
          .where(eq(schema.portalUsers.id, portalUserId))
          .returning()
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.USER_DISABLED,
          payload: { keycloakSub: user.keycloakSub, email: user.email },
        })
        return row
      })

      await ctx.keycloak.logoutUserSessions(user.keycloakUserId).catch(() => {
        // 会话登出失败不阻断禁用(token TTL + 业务侧校验兜底),记入审计 failure reason
      })
      await audit(ctx).append({
        ...actorOf(),
        action: 'user.disable',
        targetType: 'user',
        targetId: portalUserId,
        beforeData: { status: user.status },
        afterData: { status: 'disabled' },
        result: 'success',
      })
      return updated
    },

    async enable(portalUserId: string): Promise<PortalUser> {
      const user = await users.findById(portalUserId)
      if (!user) throw new ApiError('USER_NOT_FOUND', '用户不存在')
      if (user.status === 'active') throw new ApiError('CONFLICT', '用户已是启用状态')
      if (!user.keycloakUserId) throw new ApiError('CONFLICT', '用户缺少 Keycloak 标识')

      await ctx.keycloak.setUserEnabled(user.keycloakUserId, true)
      const updated = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.portalUsers)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(schema.portalUsers.id, portalUserId))
          .returning()
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.USER_ENABLED,
          payload: { keycloakSub: user.keycloakSub, email: user.email },
        })
        return row
      })
      await audit(ctx).append({
        ...actorOf(),
        action: 'user.enable',
        targetType: 'user',
        targetId: portalUserId,
        beforeData: { status: user.status },
        afterData: { status: 'active' },
        result: 'success',
      })
      return updated
    },

    /** 更新资料(displayName 等非身份字段);身份键与 email 不在此处变更 */
    async update(portalUserId: string, patch: { displayName?: string }): Promise<PortalUser> {
      const user = await users.findById(portalUserId)
      if (!user) throw new ApiError('USER_NOT_FOUND', '用户不存在')
      const updated = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.portalUsers)
          .set({ displayName: patch.displayName, updatedAt: new Date() })
          .where(eq(schema.portalUsers.id, portalUserId))
          .returning()
        await appendOutboxEvent(tx, {
          eventType: EVENT_TYPES.USER_UPDATED,
          payload: { keycloakSub: user.keycloakSub, displayName: patch.displayName ?? null },
        })
        return row
      })
      await audit(ctx).append({
        ...actorOf(),
        action: 'user.update',
        targetType: 'user',
        targetId: portalUserId,
        beforeData: { displayName: user.displayName },
        afterData: patch,
        result: 'success',
      })
      return updated
    },

    async resetPassword(portalUserId: string, temporaryPassword: string): Promise<void> {
      const user = await users.findById(portalUserId)
      if (!user?.keycloakUserId) throw new ApiError('USER_NOT_FOUND', '用户不存在')
      await ctx.keycloak.resetPassword(user.keycloakUserId, temporaryPassword)
      await audit(ctx).append({
        ...actorOf(),
        action: 'user.reset_password',
        targetType: 'user',
        targetId: portalUserId,
        result: 'success',
      })
    },

    async resetMfa(portalUserId: string): Promise<void> {
      const user = await users.findById(portalUserId)
      if (!user?.keycloakUserId) throw new ApiError('USER_NOT_FOUND', '用户不存在')
      await ctx.keycloak.resetMfa(user.keycloakUserId)
      await audit(ctx).append({
        ...actorOf(),
        action: 'user.reset_mfa',
        targetType: 'user',
        targetId: portalUserId,
        result: 'success',
      })
    },
  }
}

export type UserService = ReturnType<typeof createUserService>
