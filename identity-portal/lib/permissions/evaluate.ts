import type { AdminGrant, PermissionDecision, PermissionScope } from './types'

const SUPER_ROLE = 'platform_admin'

/**
 * 权限评估(用户与权限模型设计 §9):
 * 1. platform_admin 自动拥有全部权限;
 * 2. global 授权覆盖所有 org/app 范围;
 * 3. org 授权覆盖该 org 范围;org→app 的层级映射由调用方展开为多条 grants;
 * 4. 其余精确匹配 scope。
 */
export function canWithReason(
  grants: readonly AdminGrant[],
  permissionCode: string,
  scope?: PermissionScope,
): PermissionDecision {
  if (grants.some((g) => g.roleCode === SUPER_ROLE)) return { allowed: true }

  const holding = grants.filter((g) => g.permissionCodes.includes(permissionCode))
  if (holding.length === 0) {
    return { allowed: false, internalReason: `缺少权限 ${permissionCode}` }
  }
  if (holding.some((g) => g.scopeType === 'global')) return { allowed: true }
  if (!scope) {
    return { allowed: false, internalReason: `权限 ${permissionCode} 仅有范围授权,需要 global` }
  }
  const matched = holding.some(
    (g) => g.scopeType === scope.type && g.scopeId === scope.id,
  )
  return matched
    ? { allowed: true }
    : { allowed: false, internalReason: `权限 ${permissionCode} 不覆盖 ${scope.type}:${scope.id}` }
}

export function can(
  grants: readonly AdminGrant[],
  permissionCode: string,
  scope?: PermissionScope,
): boolean {
  return canWithReason(grants, permissionCode, scope).allowed
}
