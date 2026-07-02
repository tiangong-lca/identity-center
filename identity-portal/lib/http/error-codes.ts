/** 统一错误码(API 设计 §错误码;HTTP 状态映射) */
export const ERROR_CODES = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  APP_ACCESS_DENIED: 403,
  CSRF_REJECTED: 403,
  USER_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  KEYCLOAK_ERROR: 502,
  DEPENDENCY_FAILED: 424,
  SYNC_PENDING: 202,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export function httpStatusOf(code: ErrorCode): number {
  return ERROR_CODES[code]
}
