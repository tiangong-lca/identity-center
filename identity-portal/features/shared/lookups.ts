/** 跨功能共享的选项查询(用户选人 / 应用下拉),仅客户端组件使用 */

import { useQuery } from '@tanstack/react-query'
import { apiFetch, listQuery, type PageResult } from './api'

export type PortalUserOption = {
  id: string
  email: string
  displayName: string | null
  status: string
}

export type ApplicationOption = {
  id: string
  code: string
  name: string
}

/** 关键字搜索平台用户(选人组件用) */
export function useUserSearch(keyword: string) {
  const trimmed = keyword.trim()
  return useQuery({
    queryKey: ['lookup', 'user-search', trimmed],
    queryFn: () =>
      apiFetch<PageResult<PortalUserOption>>(
        `/api/admin/users${listQuery({ keyword: trimmed, pageSize: 10 })}`,
      ),
    enabled: trimmed.length > 0,
  })
}

/** 用户目录(首页 100 条,用于把 portalUserId 映射为邮箱展示) */
export function useUserDirectory(enabled = true) {
  return useQuery({
    queryKey: ['lookup', 'user-directory'],
    queryFn: () =>
      apiFetch<PageResult<PortalUserOption>>(`/api/admin/users${listQuery({ pageSize: 100 })}`),
    enabled,
  })
}

/** 应用下拉选项(前 100 条) */
export function useApplicationOptions(enabled = true) {
  return useQuery({
    queryKey: ['lookup', 'application-options'],
    queryFn: () =>
      apiFetch<PageResult<ApplicationOption>>(
        `/api/admin/applications${listQuery({ pageSize: 100 })}`,
      ),
    enabled,
  })
}
