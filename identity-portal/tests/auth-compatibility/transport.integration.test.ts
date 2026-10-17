import { expect, test, vi } from 'vitest'
import Redis from 'ioredis'
import { SignJWT, type JWTPayload } from 'jose'
import { fixture, receipt } from './fixture'
import { localJwks } from './local-jwks'

const event = 'http://schemas.openid.net/event/backchannel-logout'

test('real route/JWKS/Redis controls and separately recorded baseline SID limitation', async () => {
  const c = fixture()
  const jwks = await localJwks()
  vi.stubEnv('KEYCLOAK_BASE_URL', jwks.origin)
  vi.resetModules()
  const { POST } = await import('../../app/api/auth/backchannel-logout/route')
  const { authConfig } = await import('../../lib/auth/auth-config')
  const { getRedis } = await import('../../lib/rate-limit/redis')
  const redis = getRedis()
  redis.on('error', () => {})
  const observer = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 })
  const keys: string[] = []
  const cases: Record<string, { status: number; marker: boolean }> = {}
  const base = (name: string): JWTPayload => ({
    iss: jwks.issuer, aud: 'user-portal', iat: Math.floor(Date.now() / 1000),
    sub: `${c.project}-${name}`, events: { [event]: {} },
  })
  const invoke = async (token: string) => POST(new Request(`${c.portalOrigin}/api/auth/backchannel-logout`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ logout_token: token }),
  }))
  const check = async (name: string, claims: JWTPayload, expected: number, signed?: string) => {
    const key = `oidc:revoked:${claims.sub}`
    keys.push(key)
    const result = await invoke(signed ?? await jwks.sign(claims))
    const marker = Boolean(await observer.exists(key))
    expect(result.status, name).toBe(expected)
    expect(marker, name).toBe(expected === 200)
    cases[name] = { status: result.status, marker }
  }
  try {
    const good = base('valid-sub')
    await check('valid-sub', good, 200)
    const subAfter = await authConfig.callbacks!.jwt!({ token: { keycloakSub: good.sub }, user: { id: good.sub }, account: null })
    expect(subAfter).toBeNull()
    const negatives: Array<[string, JWTPayload]> = [
      ['issuer', { ...base('issuer'), iss: `${jwks.issuer}-wrong` }],
      ['audience', { ...base('audience'), aud: 'other-client' }],
      ['expired', { ...base('expired'), iat: Math.floor(Date.now() / 1000) - 600 }],
      ['nonce', { ...base('nonce'), nonce: 'forbidden' }],
      ['events', { ...base('events'), events: {} }],
      ['no-identity', { ...base('no-identity'), sub: undefined }],
    ]
    for (const [name, claims] of negatives) await check(name, claims, 400)
    const wrongSignature = base('signature')
    await check('signature', wrongSignature, 400, await jwks.sign(wrongSignature, 'b', `${c.nonce}-a`))
    const hmac = base('algorithm')
    await check('algorithm', hmac, 400, await new SignJWT(hmac).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(c.authSecret)))
    await check('malformed', base('malformed'), 400, 'not-a-jwt')
    const noIdentity = await invoke(await jwks.sign({ ...base('sid-only'), sub: undefined, sid: `${c.project}-sid` }))
    expect(noIdentity.status).toBe(200)
    const sidKey = `oidc:revoked:sid:${c.project}-sid`
    keys.push(sidKey)
    const sidMarker = Boolean(await observer.exists(sidKey))
    const sidAfter = await authConfig.callbacks!.jwt!({ token: { keycloakSub: `${c.project}-sid-subject` }, user: { id: `${c.project}-sid-subject` }, account: null })
    // Observation only: never turn this known security limitation into a passing denial claim.
    const sidOnly = { status: noIdentity.status, markerPresent: sidMarker, sessionDenied: sidAfter === null }
    const initialRequests = jwks.requests
    expect(initialRequests).toBe(1)
    const rotation = base('rotation')
    await check('unknown-key-during-cooldown', rotation, 400, await jwks.sign(rotation, 'b'))
    await new Promise(resolve => setTimeout(resolve, 31_000))
    jwks.setBody({ invalid: true })
    await check('malformed-jwks', rotation, 400, await jwks.sign(rotation, 'b'))
    jwks.setBody({ keys: [jwks.publicB] })
    await check('rotated-key', rotation, 200, await jwks.sign(rotation, 'b'))
    expect(jwks.requests).toBeGreaterThanOrEqual(initialRequests + 2)
    const badUrl = new URL(process.env.REDIS_URL!)
    badUrl.password = `wrong-${c.nonce}`
    const bad = new Redis(badUrl.toString(), { lazyConnect: true, retryStrategy: () => null, maxRetriesPerRequest: 1, connectTimeout: 1000 })
    bad.on('error', () => {})
    try { await expect(bad.ping()).rejects.toThrow() } finally { bad.disconnect() }
    receipt('transport.json', { cases, subSessionDenied: subAfter === null, wrongRedisPasswordRejected: true, jwksRotationObserved: true, sidOnly })
  } finally {
    if (keys.length) await observer.del(...keys)
    await observer.quit()
    redis.disconnect()
    await jwks.close()
    vi.unstubAllEnvs()
  }
}, 60_000)
