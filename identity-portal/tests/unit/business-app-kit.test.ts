import { describe, expect, it } from 'vitest'
import { checkApplicationAccess } from '@/lib/business-app-kit/verify-access'
import { verifyPlatformWebhook } from '@/lib/business-app-kit/verify-webhook'
import { signWebhook } from '@/lib/sync/webhook-signature'

function fakeToken(resourceAccess: Record<string, { roles: string[] }>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ resource_access: resourceAccess })).toString('base64url')
  return `${header}.${payload}.sig`
}

describe('business-app-kit 接入参考', () => {
  it('token 含准入角色 → 放行', () => {
    const token = fakeToken({ 'supabase-business-app': { roles: ['supabase_app_access'] } })
    expect(checkApplicationAccess(token, 'supabase-business-app', 'supabase_app_access')).toEqual({
      allowed: true,
    })
  })

  it('token 缺角色 → APP_ACCESS_DENIED', () => {
    const token = fakeToken({ 'other-app': { roles: ['x'] } })
    const r = checkApplicationAccess(token, 'supabase-business-app', 'supabase_app_access')
    expect(r).toMatchObject({ allowed: false, code: 'APP_ACCESS_DENIED' })
  })

  it('无 token → UNAUTHENTICATED', () => {
    expect(checkApplicationAccess(undefined, 'supabase-business-app', 'supabase_app_access')).toMatchObject({
      allowed: false,
      code: 'UNAUTHENTICATED',
    })
  })

  it('webhook 验签回环', () => {
    const secret = 'sup-secret'
    const ts = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ eventId: 'evt_x' })
    const sig = signWebhook(secret, ts, body)
    expect(verifyPlatformWebhook({ secret, signature: sig, timestamp: ts, rawBody: body }).valid).toBe(true)
    expect(
      verifyPlatformWebhook({ secret, signature: sig, timestamp: ts, rawBody: body + 'x' }).valid,
    ).toBe(false)
  })
})
