/** 账号中心/门户:类型 + react-query hooks(仅客户端组件使用) */

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/features/shared/api'

export type AccountProfile = {
  id: string
  email: string
  displayName: string | null
  status: string
  createdAt: string
}

export type AccountApp = {
  id: string
  code: string
  name: string
  loginUrl: string | null
}

export type AccountSession = {
  id?: string
  ipAddress?: string
  start?: number
  lastAccess?: number
  clients?: Record<string, string>
}

export function useAccountProfile() {
  return useQuery({
    queryKey: ['account', 'profile'],
    queryFn: () => apiFetch<AccountProfile>('/api/account/profile'),
  })
}

export function useAccountApps() {
  return useQuery({
    queryKey: ['account', 'apps'],
    queryFn: () => apiFetch<{ items: AccountApp[] }>('/api/account/apps'),
  })
}

export function useAccountSessions() {
  return useQuery({
    queryKey: ['account', 'sessions'],
    queryFn: () => apiFetch<{ items: AccountSession[] }>('/api/account/sessions'),
  })
}
