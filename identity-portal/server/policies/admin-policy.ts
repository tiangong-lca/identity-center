import { eq, inArray } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { ApiError } from '@/lib/http/api-error'
import { canWithReason } from '@/lib/permissions/evaluate'
import type { AdminGrant, PermissionScope } from '@/lib/permissions/types'
import type { ServiceDb } from '@/server/services/context'

/** 加载管理员全部授权(admin_user_roles → 角色 → 权限码) */
export async function loadGrants(db: ServiceDb, keycloakSub: string): Promise<AdminGrant[]> {
  const user = await db.query.portalUsers.findFirst({
    where: eq(schema.portalUsers.keycloakSub, keycloakSub),
  })
  if (!user) return []

  const bindings = await db.query.adminUserRoles.findMany({
    where: eq(schema.adminUserRoles.portalUserId, user.id),
  })
  if (bindings.length === 0) return []

  const roleIds = [...new Set(bindings.map((b) => b.adminRoleId))]
  const roles = await db.query.adminRoles.findMany({ where: inArray(schema.adminRoles.id, roleIds) })
  const rolePerms = await db.query.adminRolePermissions.findMany({
    where: inArray(schema.adminRolePermissions.adminRoleId, roleIds),
  })
  const permIds = [...new Set(rolePerms.map((rp) => rp.adminPermissionId))]
  const perms = permIds.length
    ? await db.query.adminPermissions.findMany({ where: inArray(schema.adminPermissions.id, permIds) })
    : []

  const roleCodeById = new Map(roles.map((r) => [r.id, r.code]))
  const permCodeById = new Map(perms.map((p) => [p.id, p.code]))
  const permsByRole = new Map<string, string[]>()
  for (const rp of rolePerms) {
    const code = permCodeById.get(rp.adminPermissionId)
    if (!code) continue
    const list = permsByRole.get(rp.adminRoleId) ?? []
    list.push(code)
    permsByRole.set(rp.adminRoleId, list)
  }

  return bindings.map((b) => ({
    roleCode: roleCodeById.get(b.adminRoleId) ?? 'unknown',
    permissionCodes: permsByRole.get(b.adminRoleId) ?? [],
    scopeType: b.scopeType as AdminGrant['scopeType'],
    scopeId: b.scopeId,
  }))
}

/**
 * Service 层权限校验(三层校验第二层):
 * 拒绝时统一 FORBIDDEN(不暴露缺失权限细节),内部原因进服务端日志。
 */
export async function requirePermission(
  db: ServiceDb,
  keycloakSub: string,
  permissionCode: string,
  scope?: PermissionScope,
): Promise<void> {
  const grants = await loadGrants(db, keycloakSub)
  const decision = canWithReason(grants, permissionCode, scope)
  if (!decision.allowed) {
    const ctx = getAuditContext()
    console.warn(
      `[${ctx?.requestId ?? '-'}] 权限拒绝 sub=${keycloakSub} perm=${permissionCode} reason=${decision.internalReason}`,
    )
    throw new ApiError('FORBIDDEN', '无权执行该操作')
  }
}
