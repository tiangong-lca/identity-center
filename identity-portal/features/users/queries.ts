'use client'

/** 用户管理数据层:TanStack Query hooks(统一走 apiFetch 信封解包) */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, listQuery, type PageResult } from '@/features/shared/api'
import type {
  AdminApplication,
  AssignmentGrantResult,
  AuditLogEntry,
  CreateUserInput,
  PortalUser,
  PortalUserStatus,
} from './types'

export type UsersListParams = {
  page: number
  pageSize: number
  keyword?: string
  status?: PortalUserStatus
}

export type UserAssignment = {
  id: string
  applicationId: string
  portalUserId: string
  keycloakSub: string
  status: 'active' | 'revoked' | 'expired'
  source: string
  projectionStatus: string
  businessProjectionStatus: string
  createdAt: string
  appName: string | null
  appCode: string | null
  appStatus: string | null
  appLoginUrl: string | null
}

export const usersKeys = {
  all: ['users'] as const,
  list: (params: UsersListParams) => [...usersKeys.all, 'list', params] as const,
  detail: (id: string) => [...usersKeys.all, 'detail', id] as const,
  audit: (id: string) => [...usersKeys.all, 'audit', id] as const,
  assignments: (id: string) => [...usersKeys.all, 'assignments', id] as const,
}

export const applicationsKeys = {
  options: ['applications', 'options'] as const,
}

export function useUsersQuery(params: UsersListParams) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => apiFetch<PageResult<PortalUser>>(`/api/admin/users${listQuery(params)}`),
    placeholderData: keepPreviousData,
  })
}

export function useUserQuery(id: string) {
  return useQuery({
    queryKey: usersKeys.detail(id),
    queryFn: () => apiFetch<PortalUser>(`/api/admin/users/${id}`),
  })
}

export function useUserAuditLogsQuery(id: string) {
  return useQuery({
    queryKey: usersKeys.audit(id),
    queryFn: () =>
      apiFetch<PageResult<AuditLogEntry>>(
        `/api/admin/audit-logs${listQuery({ targetType: 'user', targetId: id, pageSize: 20 })}`,
      ),
  })
}

export function useUserAssignmentsQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: usersKeys.assignments(id),
    queryFn: () =>
      apiFetch<{ items: UserAssignment[] }>(`/api/admin/users/${id}/assignments`),
    enabled,
  })
}

/** 应用下拉选项(分配准入用;打开对话框时再拉取) */
export function useApplicationsQuery(enabled = true) {
  return useQuery({
    queryKey: applicationsKeys.options,
    queryFn: () =>
      apiFetch<PageResult<AdminApplication>>(
        `/api/admin/applications${listQuery({ page: 1, pageSize: 100 })}`,
      ),
    enabled,
  })
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<PortalUser>('/api/admin/users', { method: 'POST', json: input }),
    onSuccess: (user) => {
      queryClient.setQueryData(usersKeys.detail(user.id), user)
      void queryClient.invalidateQueries({ queryKey: usersKeys.all })
    },
  })
}

/** 禁用/启用(列表行内与详情危险区共用) */
export function useSetUserStatusMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'enable' | 'disable' }) =>
      apiFetch<PortalUser>(`/api/admin/users/${id}/${action}`, { method: 'POST' }),
    onSuccess: (user, { id }) => {
      queryClient.setQueryData(usersKeys.detail(id), user)
      void queryClient.invalidateQueries({ queryKey: usersKeys.all })
    },
  })
}

export function useResetPasswordMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, temporaryPassword }: { id: string; temporaryPassword: string }) =>
      apiFetch<{ reset: boolean }>(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        json: { temporaryPassword },
      }),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.audit(id) })
    },
  })
}

export function useResetMfaMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiFetch<{ reset: boolean }>(`/api/admin/users/${id}/reset-mfa`, { method: 'POST' }),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.audit(id) })
    },
  })
}

export function useAssignApplicationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ applicationId, portalUserId }: { applicationId: string; portalUserId: string }) =>
      apiFetch<AssignmentGrantResult>(`/api/admin/applications/${applicationId}/assignments`, {
        method: 'POST',
        json: { portalUserId },
      }),
    onSuccess: (_data, { portalUserId }) => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.audit(portalUserId) })
      void queryClient.invalidateQueries({ queryKey: usersKeys.assignments(portalUserId) })
    },
  })
}
