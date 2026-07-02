import { ApiClientError } from '@/features/shared/api'

/** 本地化时间展示(客户端渲染,数据来自 useQuery,不参与 SSR 输出) */
export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** API 错误 → 可展示消息(信封 message 已含业务语义;非 API 错误用兜底文案) */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError && error.message) return error.message
  return fallback
}
