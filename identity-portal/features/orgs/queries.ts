/** 组织管理:类型 + react-query hooks(仅客户端组件使用) */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, listQuery, type PageResult } from '@/features/shared/api'

export const ORG_TYPES = ['company', 'department', 'business_unit', 'team'] as const
export type OrgType = (typeof ORG_TYPES)[number]

export type PlatformOrg = {
  id: string
  code: string
  name: string
  type: string
  status: string
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export type OrgMember = {
  id: string
  organizationId: string
  portalUserId: string
  memberType: string
  status: string
  joinedAt: string | null
}

export type OrgAppMapping = {
  id: string
  platformOrganizationId: string
  applicationId: string
  businessAppOrgId: string
  mappingType: string
  status: string
}

export const MEMBER_TYPES = ['member', 'manager', 'owner'] as const

const orgKeys = {
  all: ['orgs'] as const,
  list: (page: number) => ['orgs', 'list', page] as const,
  options: ['orgs', 'options'] as const,
  members: (orgId: string) => ['orgs', orgId, 'members'] as const,
  mappings: (orgId: string) => ['orgs', orgId, 'mappings'] as const,
}

export const ORG_PAGE_SIZE = 20

export function useOrgList(page: number) {
  return useQuery({
    queryKey: orgKeys.list(page),
    queryFn: () =>
      apiFetch<PageResult<PlatformOrg>>(
        `/api/admin/platform-organizations${listQuery({ page, pageSize: ORG_PAGE_SIZE })}`,
      ),
  })
}

/** 父组织下拉选项(前 100 条) */
export function useOrgOptions() {
  return useQuery({
    queryKey: orgKeys.options,
    queryFn: () =>
      apiFetch<PageResult<PlatformOrg>>(
        `/api/admin/platform-organizations${listQuery({ pageSize: 100 })}`,
      ),
  })
}

export function useCreateOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; name: string; type: OrgType; parentId?: string }) =>
      apiFetch<PlatformOrg>('/api/admin/platform-organizations', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.all }),
  })
}

export function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: orgKeys.members(orgId ?? ''),
    queryFn: () =>
      apiFetch<{ items: OrgMember[] }>(`/api/admin/platform-organizations/${orgId}/members`),
    enabled: !!orgId,
  })
}

export function useAddOrgMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { portalUserId: string; memberType: string }) =>
      apiFetch<OrgMember>(`/api/admin/platform-organizations/${orgId}/members`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  })
}

export function useRemoveOrgMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (portalUserId: string) =>
      apiFetch<{ removed: boolean }>(
        `/api/admin/platform-organizations/${orgId}/members/${portalUserId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  })
}

export function useOrgMappings(orgId: string | null) {
  return useQuery({
    queryKey: orgKeys.mappings(orgId ?? ''),
    queryFn: () =>
      apiFetch<{ items: OrgAppMapping[] }>(
        `/api/admin/platform-organizations/${orgId}/application-mappings`,
      ),
    enabled: !!orgId,
  })
}

export function useSetOrgMapping(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { applicationId: string; businessAppOrgId: string }) =>
      apiFetch<OrgAppMapping>(`/api/admin/platform-organizations/${orgId}/application-mappings`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.mappings(orgId) }),
  })
}
