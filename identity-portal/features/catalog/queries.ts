// features/catalog/queries.ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/features/shared/api'

export type CatalogSnapshot = { yaml: string; version: number }
export type ApplyResult = { version: number; diff: unknown; report: unknown }
export type CatalogVersion = { id: string; version: number; appliedBy: string; source: string; appliedAt: string }

export const catalogKeys = {
  all: ['catalog'] as const,
  current: () => [...catalogKeys.all, 'current'] as const,
  versions: () => [...catalogKeys.all, 'versions'] as const,
  version: (v: number) => [...catalogKeys.all, 'version', v] as const,
  pendingDeactivate: () => [...catalogKeys.all, 'pending-deactivate'] as const,
}

export function useCatalog() {
  return useQuery({ queryKey: catalogKeys.current(), queryFn: () => apiFetch<CatalogSnapshot>('/api/admin/catalog') })
}

export function useCatalogVersions() {
  return useQuery({
    queryKey: catalogKeys.versions(),
    queryFn: () => apiFetch<{ items: CatalogVersion[] }>('/api/admin/catalog/versions'),
  })
}

export function useCatalogVersion(v: number | null) {
  return useQuery({
    queryKey: catalogKeys.version(v ?? -1),
    queryFn: () => apiFetch<{ version: number; yaml: string; diff: unknown }>(`/api/admin/catalog/versions/${v}`),
    enabled: v !== null,
  })
}

export function useApplyCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { yaml: string; expectedVersion: number }) =>
      apiFetch<ApplyResult>('/api/admin/catalog/apply', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  })
}

export function useRollback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { version: number; expectedVersion: number }) =>
      apiFetch<ApplyResult>('/api/admin/catalog/rollback', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  })
}

export type PendingDeactivateItem = { kind: 'app' | 'role'; appCode: string; roleCode?: string; name: string; affectedAssignments: number }

export function usePendingDeactivate() {
  return useQuery({
    queryKey: catalogKeys.pendingDeactivate(),
    queryFn: () => apiFetch<{ items: PendingDeactivateItem[] }>('/api/admin/catalog/pending-deactivate'),
  })
}

export function useConfirmDeactivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { appCode: string; roleCode?: string }) =>
      apiFetch<{ affectedAssignments: number }>('/api/admin/catalog/deactivate', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  })
}
