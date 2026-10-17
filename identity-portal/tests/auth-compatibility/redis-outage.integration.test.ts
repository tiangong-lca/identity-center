import { expect, test, vi } from 'vitest'
import { fixture, receipt } from './fixture'
import { localJwks } from './local-jwks'

test('actual handler rejects when its owned Redis service is stopped', async () => {
  const c = fixture()
  expect(process.env.AUTH_PROOF_REDIS_STOPPED).toBe(c.project)
  const jwks = await localJwks()
  vi.stubEnv('KEYCLOAK_BASE_URL', jwks.origin)
  vi.resetModules()
  const { POST } = await import('../../app/api/auth/backchannel-logout/route')
  const { getRedis } = await import('../../lib/rate-limit/redis')
  const redis = getRedis()
  redis.on('error', () => {})
  try {
    const token = await jwks.sign({ iss: jwks.issuer, aud: 'user-portal', iat: Math.floor(Date.now() / 1000), sub: `${c.project}-outage`, events: { 'http://schemas.openid.net/event/backchannel-logout': {} } })
    await expect(POST(new Request(`${c.portalOrigin}/api/auth/backchannel-logout`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ logout_token: token }),
    }))).rejects.toThrow()
    expect(jwks.requests).toBe(1)
    receipt('outage.json', { rejected: true, jwksFetched: true, ownedRedisStopped: true })
  } finally { redis.disconnect(); await jwks.close(); vi.unstubAllEnvs() }
})
