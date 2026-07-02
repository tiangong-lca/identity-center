import { NextResponse } from 'next/server'
import { ApiError, isApiError } from './api-error'

export type ApiOk<T> = { data: T; requestId: string }
export type ApiFail = {
  error: { code: string; message: string; details?: Record<string, unknown> }
  requestId: string
}

export function ok<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json<ApiOk<T>>({ data, requestId }, { status })
}

export function fail(error: ApiError, requestId: string) {
  return NextResponse.json<ApiFail>(
    {
      error: { code: error.code, message: error.message, details: error.details },
      requestId,
    },
    { status: error.status },
  )
}

/** Route Handler 兜底:ApiError 按码返回,未知错误 500 且不泄漏内部信息 */
export function failFromUnknown(error: unknown, requestId: string) {
  if (isApiError(error)) return fail(error, requestId)
  console.error(`[${requestId}] 未处理异常:`, error)
  return fail(new ApiError('INTERNAL_ERROR', '服务器内部错误'), requestId)
}
