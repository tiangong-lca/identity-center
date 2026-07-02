/** 管理角色/权限:类型 + react-query hooks(仅客户端组件使用) */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/features/shared/api'

export type AdminRole = {
  id: string
  code: string
  name: string
  description: string | null
  builtIn: boolean
  createdAt: string
}

export type AdminPermission = {
  id: string
  code: string
  name: string
  description: string | null
}

export type RolePermissionBinding = {
  adminRoleId: string
  adminPermissionId: string
}

export type AdminUserRoleBinding = {
  id: string
  portalUserId: string
  adminRoleId: string
  scopeType: string
  scopeId: string
}

export const SCOPE_TYPES = ['global', 'org', 'app'] as const
export type ScopeType = (typeof SCOPE_TYPES)[number]

/** 平台管理员角色 code(权限矩阵只读展示「全部权限」) */
export const PLATFORM_ADMIN_CODE = 'platform_admin'

/** 权限矩阵分组顺序(按 code 前缀) */
export const PERMISSION_GROUP_ORDER = [
  'user',
  'app',
  'role',
  'org',
  'registration',
  'audit',
  'admin-role',
  'settings',
] as const

const rbacKeys = {
  roles: ['admin-roles'] as const,
  permissions: ['admin-permissions'] as const,
  rolePermissions: (roleId: string) => ['admin-roles', roleId, 'permissions'] as const,
}

export function useAdminRoles() {
  return useQuery({
    queryKey: rbacKeys.roles,
    queryFn: () => apiFetch<{ items: AdminRole[] }>('/api/admin/admin-roles'),
  })
}

export function useAdminPermissions() {
  return useQuery({
    queryKey: rbacKeys.permissions,
    queryFn: () => apiFetch<{ items: AdminPermission[] }>('/api/admin/admin-permissions'),
  })
}

export function useRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: rbacKeys.rolePermissions(roleId ?? ''),
    queryFn: () =>
      apiFetch<{ items: RolePermissionBinding[] }>(`/api/admin/admin-roles/${roleId}/permissions`),
    enabled: !!roleId,
  })
}

export function useCreateAdminRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; name: string; description?: string }) =>
      apiFetch<AdminRole>('/api/admin/admin-roles', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rbacKeys.roles }),
  })
}

export function useDeleteAdminRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (roleId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/admin/admin-roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rbacKeys.roles }),
  })
}

export function useGrantPermission(roleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adminPermissionId: string) =>
      apiFetch<{ granted: boolean }>(`/api/admin/admin-roles/${roleId}/permissions`, {
        method: 'POST',
        json: { adminPermissionId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rbacKeys.rolePermissions(roleId) }),
  })
}

export function useRevokePermission(roleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (permissionId: string) =>
      apiFetch<{ revoked: boolean }>(
        `/api/admin/admin-roles/${roleId}/permissions/${permissionId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: rbacKeys.rolePermissions(roleId) }),
  })
}

export function useBindAdminUser() {
  return useMutation({
    mutationFn: (input: {
      portalUserId: string
      adminRoleId: string
      scopeType?: ScopeType
      scopeId?: string
    }) => apiFetch<AdminUserRoleBinding>('/api/admin/admin-user-roles', { method: 'POST', json: input }),
  })
}

export function useUnbindAdminUser() {
  return useMutation({
    mutationFn: (bindingId: string) =>
      apiFetch<{ unbound: boolean }>(`/api/admin/admin-user-roles/${bindingId}`, {
        method: 'DELETE',
      }),
  })
}
