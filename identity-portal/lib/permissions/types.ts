export type AdminScopeType = 'global' | 'org' | 'app'

/** 管理员的一条角色授权(含该角色的权限码集合与作用域) */
export type AdminGrant = {
  roleCode: string
  permissionCodes: readonly string[]
  scopeType: AdminScopeType
  /** global 时为 '' */
  scopeId: string
}

export type PermissionScope = {
  type: 'org' | 'app'
  id: string
}

export type PermissionDecision = {
  allowed: boolean
  /** 拒绝时的内部原因(仅日志/审计用,不下发给终端用户,防权限结构枚举) */
  internalReason?: string
}
