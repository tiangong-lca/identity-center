import type { NextRequest } from 'next/server'
import type { ZodType } from 'zod'
import { newAuditContext, runWithAuditContext } from '@/lib/audit/context'
import { requireAdmin, type AdminSession } from '@/lib/auth/require-admin'
import { auth } from '@/lib/auth'
import { ApiError } from '@/lib/http/api-error'
import { newRequestId } from '@/lib/http/request-id'
import { fail, failFromUnknown, ok } from '@/lib/http/response'
import type { PermissionScope } from '@/lib/permissions/types'
import { getRedis } from '@/lib/rate-limit/redis'
import {
  checkRateLimit,
  hashDim,
  RATE_LIMIT_RULES,
  rateLimitKey,
  type RateLimitRule,
} from '@/lib/rate-limit/sliding-window'
import { claimIdempotencyKey } from '@/lib/sync/idempotency'
import { requirePermission } from '@/server/policies/admin-policy'
import { createServiceContext, type ServiceContext } from '@/server/services/context'

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export type RouteExtras = {
  requestId: string
  ctx: ServiceContext
  admin: AdminSession
  params: Record<string, string>
}

type AdminRouteOptions = {
  permission: string
  /** 从路由参数解析权限 scope(如 app 级权限) */
  scope?: (params: Record<string, string>) => PermissionScope | undefined
  /** 跳过全局 adminApi 限流(仅只读高频端点酌情用) */
  rateLimit?: RateLimitRule | false
}

/** CSRF(安全设计 §6):写操作要求同源 Origin + JSON-only Content-Type */
function checkCsrf(request: NextRequest) {
  if (!MUTATING.has(request.method)) return
  const contentType = request.headers.get('content-type') ?? ''
  const contentLength = request.headers.get('content-length')
  const hasBody = contentLength !== null && contentLength !== '0'
  if (hasBody && !contentType.includes('application/json')) {
    throw new ApiError('CSRF_REJECTED', '仅接受 application/json 请求体')
  }
  const origin = request.headers.get('origin')
  if (origin) {
    const host = request.headers.get('host')
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      throw new ApiError('CSRF_REJECTED', 'Origin 非法')
    }
    if (host && originHost !== host) {
      throw new ApiError('CSRF_REJECTED', '跨源请求被拒绝')
    }
  }
}

/** Idempotency-Key 重放守卫:同 key 重复提交 → CONFLICT(设计:创建/授权/禁用类写操作支持) */
async function checkIdempotency(request: NextRequest, ctx: ServiceContext, routeId: string) {
  if (!MUTATING.has(request.method)) return
  const key = request.headers.get('idempotency-key')
  if (!key) return
  const claimed = await claimIdempotencyKey(ctx.db, `idem_${key}`, routeId)
  if (!claimed) {
    throw new ApiError('CONFLICT', '重复请求(Idempotency-Key 已使用)')
  }
}

type Handler = (request: NextRequest, extras: RouteExtras) => Promise<Response>

/** 管理端点包装器:三层校验前两层 + CSRF + 限流 + 幂等 + 审计上下文 + 错误映射 */
export function adminRoute(options: AdminRouteOptions, handler: Handler) {
  return async (
    request: NextRequest,
    routeCtx?: { params?: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const requestId = newRequestId()
    try {
      checkCsrf(request)
      const admin = await requireAdmin()

      const rule = options.rateLimit === false ? null : (options.rateLimit ?? RATE_LIMIT_RULES.adminApi)
      if (rule) {
        const key = rateLimitKey('admin_api', hashDim(admin.keycloakSub))
        const { allowed } = await checkRateLimit(getRedis(), key, rule)
        if (!allowed) throw new ApiError('RATE_LIMITED', '请求过快,请稍后再试')
      }

      const params = (await routeCtx?.params) ?? {}
      const ctx = createServiceContext()
      await requirePermission(ctx.db, admin.keycloakSub, options.permission, options.scope?.(params))
      await checkIdempotency(request, ctx, `${request.method} ${options.permission}`)

      const auditCtx = newAuditContext({
        requestId,
        actor: {
          keycloakSub: admin.keycloakSub,
          email: admin.email ?? undefined,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
          userAgent: request.headers.get('user-agent') ?? undefined,
        },
      })
      return await runWithAuditContext(auditCtx, () =>
        handler(request, { requestId, ctx, admin, params }),
      )
    } catch (error) {
      return failFromUnknown(error, requestId)
    }
  }
}

/** 公共端点包装器:IP 限流 + CSRF,无认证 */
export function publicRoute(
  options: { scene: keyof typeof RATE_LIMIT_RULES },
  handler: (request: NextRequest, extras: { requestId: string; ctx: ServiceContext }) => Promise<Response>,
) {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = newRequestId()
    try {
      checkCsrf(request)
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
      const { allowed } = await checkRateLimit(
        getRedis(),
        rateLimitKey(options.scene, ip),
        RATE_LIMIT_RULES[options.scene],
      )
      if (!allowed) throw new ApiError('RATE_LIMITED', '请求过快,请稍后再试')
      const ctx = createServiceContext()
      const auditCtx = newAuditContext({ requestId })
      return await runWithAuditContext(auditCtx, () => handler(request, { requestId, ctx }))
    } catch (error) {
      return failFromUnknown(error, requestId)
    }
  }
}

/** 账号端点包装器:仅要求登录会话 */
export function accountRoute(
  handler: (
    request: NextRequest,
    extras: { requestId: string; ctx: ServiceContext; keycloakSub: string; email?: string | null },
  ) => Promise<Response>,
) {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = newRequestId()
    try {
      const session = await auth()
      if (!session?.user?.keycloakSub) throw new ApiError('UNAUTHENTICATED', '未登录')
      const ctx = createServiceContext()
      return await handler(request, {
        requestId,
        ctx,
        keycloakSub: session.user.keycloakSub,
        email: session.user.email,
      })
    } catch (error) {
      return failFromUnknown(error, requestId)
    }
  }
}

/** zod 请求体解析(失败 → VALIDATION_ERROR) */
export async function parseBody<T>(request: NextRequest, schema_: ZodType<T>): Promise<T> {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    throw new ApiError('VALIDATION_ERROR', '请求体必须是合法 JSON')
  }
  const parsed = schema_.safeParse(json)
  if (!parsed.success) {
    throw new ApiError('VALIDATION_ERROR', '参数校验失败', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

/** 列表查询参数(统一分页约定) */
export function parseListQuery(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  return {
    page: sp.get('page') ? Number(sp.get('page')) : undefined,
    pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
    keyword: sp.get('keyword') ?? undefined,
    status: sp.get('status') ?? undefined,
  }
}

export { ok, fail, ApiError }
