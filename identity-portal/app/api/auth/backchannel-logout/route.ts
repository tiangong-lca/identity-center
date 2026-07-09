import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getRedis } from '@/lib/rate-limit/redis'

/**
 * OIDC Back-Channel Logout 1.0 端点。
 * Keycloak 在用户登出时以 application/x-www-form-urlencoded 形式 POST `logout_token`(JWT),
 * 校验通过后在 Redis 中写入吊销标记,门户 jwt 回调检测到该标记即作废本地会话。
 */

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'user-portal'
const ISSUER = `${BASE_URL}/realms/${REALM}`

const JWKS = createRemoteJWKSet(
  new URL(`${ISSUER}/protocol/openid-connect/certs`),
)

/** 吊销标记 TTL:30 天,与 NextAuth 默认 JWT maxAge 对齐 */
const REVOCATION_TTL_SECONDS = 2592000

interface LogoutTokenClaims {
  iss?: string
  aud?: string | string[]
  sub?: string
  sid?: string
  iat?: number
  events?: Record<string, unknown>
  nonce?: unknown
}

export async function POST(request: Request) {
  // 1. 解析表单编码的请求体,取出 logout_token
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return new Response(null, { status: 400 })
  }
  const body = await request.formData()
  const logoutToken = body.get('logout_token')
  if (typeof logoutToken !== 'string' || logoutToken.length === 0) {
    return new Response(null, { status: 400 })
  }

  // 2. 校验 JWT 签名与标准声明;logout_token 无 exp,用 maxTokenAge 校验 iat 时效
  const { payload } = await jwtVerify(logoutToken, JWKS, {
    algorithms: ['RS256'],
    issuer: ISSUER,
    maxTokenAge: '2m',
  }).catch(() => {
    // 签名/格式错误一律按 400 处理
    return { payload: null } as const
  })

  const claims = payload as LogoutTokenClaims | null
  if (!claims) {
    return new Response(null, { status: 400 })
  }

  // 3. iss 已由 jwtVerify 强制校验,此处不重复

  // 4. aud 必须包含本门户 client_id
  const aud = claims.aud
  const audOk = Array.isArray(aud)
    ? aud.includes(CLIENT_ID)
    : aud === CLIENT_ID
  if (!audOk) {
    return new Response(null, { status: 400 })
  }

  // 5. events 命名空间必须包含 backchannel-logout 事件
  const events = claims.events
  const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout'
  if (
    !events ||
    typeof events !== 'object' ||
    !(BACKCHANNEL_LOGOUT_EVENT in events)
  ) {
    return new Response(null, { status: 400 })
  }

  // 6. 规范禁止 logout_token 携带 nonce
  if (claims.nonce !== undefined) {
    return new Response(null, { status: 400 })
  }

  // 7. sub 与 sid 至少存在其一
  const sub = claims.sub
  const sid = claims.sid
  if (!sub && !sid) {
    return new Response(null, { status: 400 })
  }

  // 8. 写入 Redis 吊销标记(优先用 sub,缺失则用 sid 命名空间)
  const redis = getRedis()
  if (sub) {
    await redis.set(`oidc:revoked:${sub}`, '1', 'EX', REVOCATION_TTL_SECONDS)
  } else if (sid) {
    await redis.set(
      `oidc:revoked:sid:${sid}`,
      '1',
      'EX',
      REVOCATION_TTL_SECONDS,
    )
  }

  // 9. 成功:空 body 200
  return new Response(null, { status: 200 })
}
