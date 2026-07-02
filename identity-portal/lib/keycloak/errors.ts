import { ApiError } from '@/lib/http/api-error'

type HttpishError = { response?: { status?: number }; responseData?: unknown; message?: string }

/** Keycloak Admin API 错误 → 统一错误码(不向外泄漏 Keycloak 内部细节) */
export function toApiError(error: unknown, context: string): ApiError {
  const status = (error as HttpishError)?.response?.status
  if (status === 404) return new ApiError('USER_NOT_FOUND', `${context}: 目标不存在`)
  if (status === 409) return new ApiError('CONFLICT', `${context}: 状态冲突`)
  if (status === 401 || status === 403) {
    return new ApiError('KEYCLOAK_ERROR', `${context}: 管理凭证无效或权限不足`)
  }
  return new ApiError('KEYCLOAK_ERROR', `${context}: Keycloak 调用失败`)
}
