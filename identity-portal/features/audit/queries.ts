/** 审计日志:类型 + react-query hooks(仅客户端组件使用) */

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiFetch, listQuery, type PageResult } from '@/features/shared/api'

export type AuditLogRow = {
  id: string
  action: string
  actorKeycloakSub: string
  actorEmail: string | null
  targetType: string
  targetId: string
  result: string
  failureReason: string | null
  requestId: string | null
  createdAt: string
  beforeData: unknown
  afterData: unknown
}

export type AuditFilters = {
  page: number
  action?: string
  targetType?: string
}

export const AUDIT_PAGE_SIZE = 20

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () =>
      apiFetch<PageResult<AuditLogRow>>(
        `/api/admin/audit-logs${listQuery({
          page: filters.page,
          pageSize: AUDIT_PAGE_SIZE,
          action: filters.action,
          targetType: filters.targetType,
        })}`,
      ),
    placeholderData: keepPreviousData,
  })
}
