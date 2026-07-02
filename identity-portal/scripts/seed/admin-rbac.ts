import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'

type Db = NodePgDatabase<typeof schema>

export const BUILT_IN_ROLES = [
  { code: 'platform_admin', name: '平台管理员', description: '拥有全部管理权限' },
  { code: 'user_admin', name: '用户管理员', description: '用户生命周期与注册审批' },
  { code: 'app_admin', name: '应用管理员', description: '应用目录、准入与应用角色' },
  { code: 'auditor', name: '审计员', description: '只读查看与审计日志' },
  { code: 'support', name: '支持人员', description: '用户查看与凭据重置' },
] as const

export const PERMISSIONS = [
  { code: 'user:read', name: '查看用户' },
  { code: 'user:create', name: '创建用户' },
  { code: 'user:update', name: '更新用户' },
  { code: 'user:disable', name: '禁用用户' },
  { code: 'user:enable', name: '启用用户' },
  { code: 'user:reset-password', name: '重置密码' },
  { code: 'user:reset-mfa', name: '重置 MFA' },
  { code: 'app:read', name: '查看应用' },
  { code: 'app:create', name: '创建应用' },
  { code: 'app:update', name: '更新应用' },
  { code: 'app:assign', name: '授予应用准入/角色' },
  { code: 'app:revoke', name: '撤销应用准入/角色' },
  { code: 'role:read', name: '查看应用角色' },
  { code: 'role:manage', name: '管理应用角色' },
  { code: 'org:read', name: '查看组织' },
  { code: 'org:manage', name: '管理组织' },
  { code: 'registration:read', name: '查看注册申请' },
  { code: 'registration:review', name: '审批注册申请' },
  { code: 'audit:read', name: '查看审计日志' },
  { code: 'admin-role:read', name: '查看管理角色' },
  { code: 'admin-role:manage', name: '管理管理角色' },
  { code: 'settings:read', name: '查看系统设置' },
  { code: 'settings:manage', name: '管理系统设置' },
] as const

const ALL_READ = PERMISSIONS.filter((p) => p.code.endsWith(':read')).map((p) => p.code)

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  platform_admin: PERMISSIONS.map((p) => p.code),
  user_admin: [
    'user:read', 'user:create', 'user:update', 'user:disable', 'user:enable',
    'user:reset-password', 'user:reset-mfa', 'registration:read', 'registration:review',
  ],
  app_admin: ['app:read', 'app:create', 'app:update', 'app:assign', 'app:revoke', 'role:read', 'role:manage'],
  auditor: [...new Set(['audit:read', ...ALL_READ])],
  support: ['user:read', 'user:reset-password', 'user:reset-mfa'],
}

/** 幂等:存在即跳过,映射表按差集补齐 */
export async function seedAdminRbac(db: Db) {
  for (const role of BUILT_IN_ROLES) {
    const exists = await db.query.adminRoles.findFirst({
      where: eq(schema.adminRoles.code, role.code),
    })
    if (!exists) await db.insert(schema.adminRoles).values({ ...role, builtIn: true })
  }
  for (const perm of PERMISSIONS) {
    const exists = await db.query.adminPermissions.findFirst({
      where: eq(schema.adminPermissions.code, perm.code),
    })
    if (!exists) await db.insert(schema.adminPermissions).values(perm)
  }

  const roles = await db.query.adminRoles.findMany()
  const perms = await db.query.adminPermissions.findMany()
  const roleId = new Map(roles.map((r) => [r.code, r.id]))
  const permId = new Map(perms.map((p) => [p.code, p.id]))
  const existing = await db.query.adminRolePermissions.findMany()
  const existingSet = new Set(existing.map((rp) => `${rp.adminRoleId}:${rp.adminPermissionId}`))

  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const rid = roleId.get(roleCode)
    if (!rid) continue
    for (const permCode of permCodes) {
      const pid = permId.get(permCode)
      if (!pid || existingSet.has(`${rid}:${pid}`)) continue
      await db.insert(schema.adminRolePermissions).values({ adminRoleId: rid, adminPermissionId: pid })
    }
  }
}
