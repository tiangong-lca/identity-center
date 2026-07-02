import { httpStatusOf, type ErrorCode } from './error-codes'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = httpStatusOf(code)
    this.details = details
  }
}

export const apiError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => new ApiError(code, message, details)

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
