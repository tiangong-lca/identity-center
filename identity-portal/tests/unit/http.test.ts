import { describe, expect, it } from 'vitest'
import { ApiError, apiError, isApiError } from '@/lib/http/api-error'
import { httpStatusOf } from '@/lib/http/error-codes'
import { newEventId, newRequestId } from '@/lib/http/request-id'
import { fail, failFromUnknown, ok } from '@/lib/http/response'

describe('lib/http', () => {
  it('错误码映射符合 API 设计', () => {
    expect(httpStatusOf('UNAUTHENTICATED')).toBe(401)
    expect(httpStatusOf('APP_ACCESS_DENIED')).toBe(403)
    expect(httpStatusOf('SYNC_PENDING')).toBe(202)
    expect(httpStatusOf('DEPENDENCY_FAILED')).toBe(424)
    expect(httpStatusOf('KEYCLOAK_ERROR')).toBe(502)
  })

  it('ApiError 携带 code/status/details', () => {
    const e = apiError('CONFLICT', '状态冲突', { current: 'disabled' })
    expect(e.status).toBe(409)
    expect(isApiError(e)).toBe(true)
    expect(isApiError(new Error('x'))).toBe(false)
  })

  it('ok/fail 响应结构符合约定', async () => {
    const rid = newRequestId()
    const okRes = ok({ hello: 'world' }, rid)
    expect(okRes.status).toBe(200)
    expect(await okRes.json()).toEqual({ data: { hello: 'world' }, requestId: rid })

    const failRes = fail(new ApiError('USER_NOT_FOUND', '用户不存在'), rid)
    expect(failRes.status).toBe(404)
    const body = await failRes.json()
    expect(body.error.code).toBe('USER_NOT_FOUND')
    expect(body.requestId).toBe(rid)
  })

  it('failFromUnknown 不泄漏内部错误信息', async () => {
    const res = failFromUnknown(new Error('db password is 123'), 'req_x')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('123')
  })

  it('ID 前缀语义', () => {
    expect(newRequestId()).toMatch(/^req_/)
    expect(newEventId()).toMatch(/^evt_/)
  })
})
