import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, listQuery, type PageResult } from '@/features/shared/api'

export type ApplicationStatus = 'active' | 'disabled'
export type ProjectionStatus = 'pending' | 'projected' | 'failed'
export type BusinessProjectionStatus = ProjectionStatus | 'not_required'
export type AssignmentStatus = 'active' | 'revoked' | 'expired'
export type ScopeType = 'global' | 'tenant' | 'org' | 'team' | 'project'

export type Application = {
  id: string
  code: string
  name: string
  keycloakClientId: string
  accessClientRole: string
  status: ApplicationStatus
  loginUrl: string | null
  adminUrl: string | null
  webhookUrl: string | null
  webhookSecretRef: string | null
  createdAt: string
  updatedAt: string
}

export type ApplicationAssignment = {
  id: string
  applicationId: string
  portalUserId: string
  keycloakSub: string
  status: AssignmentStatus
  source: string
  projectionStatus: ProjectionStatus
  lastProjectionError: string | null
  businessProjectionStatus: BusinessProjectionStatus
  lastBusinessProjectionError: string | null
  createdAt: string
  userEmail: string | null
  userDisplayName: string | null
}

export type ApplicationRole = {
  id: string
  applicationId: string
  code: string
  name: string
  description: string | null
  status: ApplicationStatus
  createdAt: string
}

export type ApplicationUserRole = {
  id: string
  applicationId: string
  applicationRoleId: string
  portalUserId: string
  keycloakSub: string
  scopeType: ScopeType
  scopeId: string
  status: AssignmentStatus
  projectionStatus: ProjectionStatus
  createdAt: string
}

export type PortalUserOption = {
  id: string
  email: string
  displayName: string | null
  status: string
}

export type GrantResult = {
  assignment: ApplicationAssignment
  projection: 'projected' | 'pending'
}

export const appKeys = {
  all: ['applications'] as const,
  list: (params: { page: number; pageSize: number }) =>
    [...appKeys.all, 'list', params] as const,
  detail: (id: string) => [...appKeys.all, 'detail', id] as const,
  assignmentsRoot: (id: string) => [...appKeys.all, id, 'assignments'] as const,
  assignments: (id: string, params: { page: number; pageSize: number }) =>
    [...appKeys.assignmentsRoot(id), params] as const,
  roles: (id: string) => [...appKeys.all, id, 'roles'] as const,
  roleAssignments: (id: string) => [...appKeys.all, id, 'role-assignments'] as const,
  userOptions: (keyword: string) => ['admin-users', 'options', keyword] as const,
}

// ---- 应用目录 ----

export function useApplications(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: appKeys.list(params),
    queryFn: () =>
      apiFetch<PageResult<Application>>(`/api/admin/applications${listQuery(params)}`),
    placeholderData: (prev) => prev,
  })
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: appKeys.detail(id),
    queryFn: () => apiFetch<Application>(`/api/admin/applications/${id}`),
  })
}

// 应用/角色定义的创建与编辑已收敛至应用注册表(/admin/apps/registry),
// 命令式写端点(POST /applications、PATCH /applications/[id]、
// POST/PATCH .../roles[/roleId])统一返回 409 CATALOG_MANAGED——
// 此处不再提供 useCreateApplication/useUpdateApplication。

// ---- 准入 ----

export function useAssignments(appId: string, params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: appKeys.assignments(appId, params),
    queryFn: () =>
      apiFetch<PageResult<ApplicationAssignment>>(
        `/api/admin/applications/${appId}/assignments${listQuery(params)}`,
      ),
    placeholderData: (prev) => prev,
  })
}

export function useGrantAssignment(appId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (portalUserId: string) =>
      apiFetch<GrantResult>(`/api/admin/applications/${appId}/assignments`, {
        method: 'POST',
        json: { portalUserId },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: appKeys.assignmentsRoot(appId) }),
  })
}

export function useRevokeAssignment(appId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) =>
      apiFetch<unknown>(`/api/admin/applications/${appId}/assignments/${assignmentId}`, {
        method: 'DELETE',
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: appKeys.assignmentsRoot(appId) }),
  })
}

// ---- 应用角色目录 ----

export function useAppRoles(appId: string) {
  return useQuery({
    queryKey: appKeys.roles(appId),
    queryFn: () =>
      apiFetch<{ items: ApplicationRole[] }>(`/api/admin/applications/${appId}/roles`),
  })
}

// 角色定义的创建与编辑同样收敛至应用注册表,不再提供
// useCreateAppRole/useUpdateAppRole——本 tab 仅保留只读的 useAppRoles。

// ---- 角色分配 ----

export function useRoleAssignments(appId: string) {
  return useQuery({
    queryKey: appKeys.roleAssignments(appId),
    queryFn: () =>
      apiFetch<{ items: ApplicationUserRole[] }>(
        `/api/admin/applications/${appId}/role-assignments`,
      ),
  })
}

export type AssignRoleInput = {
  applicationRoleId: string
  portalUserId: string
  scopeType?: ScopeType
  scopeId?: string
}

export function useAssignRole(appId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssignRoleInput) =>
      apiFetch<ApplicationUserRole>(`/api/admin/applications/${appId}/role-assignments`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: appKeys.roleAssignments(appId) }),
  })
}

export function useRevokeRoleAssignment(appId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) =>
      apiFetch<ApplicationUserRole>(
        `/api/admin/applications/${appId}/role-assignments/${assignmentId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: appKeys.roleAssignments(appId) }),
  })
}

// ---- 用户检索(选人用) ----

export function useUserOptions(keyword: string) {
  return useQuery({
    queryKey: appKeys.userOptions(keyword),
    queryFn: () =>
      apiFetch<PageResult<PortalUserOption>>(
        `/api/admin/users${listQuery({ keyword: keyword || undefined, pageSize: 10 })}`,
      ),
    placeholderData: (prev) => prev,
  })
}
