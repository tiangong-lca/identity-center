import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, listQuery, type PageResult } from '@/features/shared/api'

export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type RequestedAccessEntry = { applicationCode: string; roleCode?: string }

export type RegistrationRequest = {
  id: string
  email: string
  displayName: string | null
  requestedReason: string | null
  status: RegistrationStatus
  approvalRequired: boolean
  reviewedBy: string | null
  reviewedAt: string | null
  reviewComment: string | null
  createdAt: string
  requestedAccess?: RequestedAccessEntry[]
}

export type RegistrationListParams = {
  page: number
  pageSize: number
  status?: RegistrationStatus
}

export const registrationKeys = {
  all: ['registration-requests'] as const,
  list: (params: RegistrationListParams) => [...registrationKeys.all, 'list', params] as const,
}

export function useRegistrationRequests(params: RegistrationListParams) {
  return useQuery({
    queryKey: registrationKeys.list(params),
    queryFn: () =>
      apiFetch<PageResult<RegistrationRequest>>(
        `/api/admin/registration-requests${listQuery(params)}`,
      ),
    placeholderData: (prev) => prev,
  })
}

export type ApproveInput = { id: string; reviewComment?: string; temporaryPassword?: string }
export type RejectInput = { id: string; reviewComment?: string }

export function useApproveRegistration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ApproveInput) =>
      apiFetch<{ request: RegistrationRequest }>(
        `/api/admin/registration-requests/${id}/approve`,
        { method: 'POST', json: body },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  })
}

export function useRejectRegistration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RejectInput) =>
      apiFetch<RegistrationRequest>(`/api/admin/registration-requests/${id}/reject`, {
        method: 'POST',
        json: body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  })
}
