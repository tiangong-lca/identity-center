import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { ApiError } from '@/lib/http/api-error'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

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

export function createAdminRbacService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)

  return {
    listRoles: () => ctx.db.query.adminRoles.findMany(),
    listPermissions: () => ctx.db.query.adminPermissions.findMany(),

    async listRolePermissions(adminRoleId: string) {
      return ctx.db.query.adminRolePermissions.findMany({
        where: eq(schema.adminRolePermissions.adminRoleId, adminRoleId),
      })
    },

    async createRole(input: { code: string; name: string; description?: string }) {
      const dup = await ctx.db.query.adminRoles.findFirst({
        where: eq(schema.adminRoles.code, input.code),
      })
      if (dup) throw new ApiError('CONFLICT', `管理角色 ${input.code} 已存在`)
      const [row] = await ctx.db
        .insert(schema.adminRoles)
        .values({ ...input, builtIn: false })
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'admin_role.create',
        targetType: 'admin_role',
        targetId: row.id,
        afterData: input,
        result: 'success',
      })
      return row
    },

    /** 内置角色不可删除(评审 v2 建议明确) */
    async deleteRole(id: string) {
      const role = await ctx.db.query.adminRoles.findFirst({ where: eq(schema.adminRoles.id, id) })
      if (!role) throw new ApiError('NOT_FOUND', '管理角色不存在')
      if (role.builtIn) throw new ApiError('CONFLICT', '内置角色不可删除')
      const bindings = await ctx.db.query.adminUserRoles.findMany({
        where: eq(schema.adminUserRoles.adminRoleId, id),
      })
      if (bindings.length > 0) throw new ApiError('CONFLICT', '角色仍被管理员绑定,先解绑')
      await ctx.db.delete(schema.adminRolePermissions).where(eq(schema.adminRolePermissions.adminRoleId, id))
      await ctx.db.delete(schema.adminRoles).where(eq(schema.adminRoles.id, id))
      await audit.append({
        ...actorOf(),
        action: 'admin_role.delete',
        targetType: 'admin_role',
        targetId: id,
        beforeData: { code: role.code },
        result: 'success',
      })
    },

    async grantPermission(adminRoleId: string, adminPermissionId: string) {
      const exists = await ctx.db.query.adminRolePermissions.findFirst({
        where: and(
          eq(schema.adminRolePermissions.adminRoleId, adminRoleId),
          eq(schema.adminRolePermissions.adminPermissionId, adminPermissionId),
        ),
      })
      if (exists) return
      await ctx.db.insert(schema.adminRolePermissions).values({ adminRoleId, adminPermissionId })
      await audit.append({
        ...actorOf(),
        action: 'admin_role.grant_permission',
        targetType: 'admin_role',
        targetId: adminRoleId,
        afterData: { adminPermissionId },
        result: 'success',
      })
    },

    async revokePermission(adminRoleId: string, adminPermissionId: string) {
      await ctx.db
        .delete(schema.adminRolePermissions)
        .where(
          and(
            eq(schema.adminRolePermissions.adminRoleId, adminRoleId),
            eq(schema.adminRolePermissions.adminPermissionId, adminPermissionId),
          ),
        )
      await audit.append({
        ...actorOf(),
        action: 'admin_role.revoke_permission',
        targetType: 'admin_role',
        targetId: adminRoleId,
        beforeData: { adminPermissionId },
        result: 'success',
      })
    },

    async bindUser(portalUserId: string, adminRoleId: string, scope?: { type: 'global' | 'org' | 'app'; id?: string }) {
      const scopeType = scope?.type ?? 'global'
      const scopeId = scope?.id ?? ''
      const exists = await ctx.db.query.adminUserRoles.findFirst({
        where: and(
          eq(schema.adminUserRoles.portalUserId, portalUserId),
          eq(schema.adminUserRoles.adminRoleId, adminRoleId),
          eq(schema.adminUserRoles.scopeType, scopeType),
          eq(schema.adminUserRoles.scopeId, scopeId),
        ),
      })
      if (exists) throw new ApiError('CONFLICT', '绑定已存在')
      const [row] = await ctx.db
        .insert(schema.adminUserRoles)
        .values({ portalUserId, adminRoleId, scopeType, scopeId })
        .returning()
      await audit.append({
        ...actorOf(),
        action: 'admin_role.bind_user',
        targetType: 'admin_user_role',
        targetId: row.id,
        afterData: { portalUserId, adminRoleId, scopeType, scopeId },
        result: 'success',
      })
      return row
    },

    async unbindUser(bindingId: string) {
      const deleted = await ctx.db
        .delete(schema.adminUserRoles)
        .where(eq(schema.adminUserRoles.id, bindingId))
        .returning()
      if (deleted.length === 0) throw new ApiError('NOT_FOUND', '绑定不存在')
      await audit.append({
        ...actorOf(),
        action: 'admin_role.unbind_user',
        targetType: 'admin_user_role',
        targetId: bindingId,
        result: 'success',
      })
    },
  }
}

export type AdminRbacService = ReturnType<typeof createAdminRbacService>
