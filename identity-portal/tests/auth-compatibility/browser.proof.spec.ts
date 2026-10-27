import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Redis from 'ioredis'
import { createKeycloakAdmin } from '../../lib/keycloak/admin-client'
import { fixture, receipt } from './fixture'
import { qualifyStandaloneUi } from './ui-acceptance'

const c = fixture()

test('real Keycloak PKCE/Auth.js session is denied after actual signed backchannel logout', async ({ page }) => {
  expect(c.adminApiSecret && c.userId).toBeTruthy()
  const admin = createKeycloakAdmin({ baseUrl: c.keycloakOrigin, realm: c.realm, clientId: 'user-portal-admin-api', clientSecret: c.adminApiSecret! })
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, connectTimeout: 3000 })
  const errors = { page: 0, console: 0 }
  const pageError = () => { errors.page++ }
  const consoleError = (message: { type(): string }) => { if (message.type() === 'error') errors.console++ }
  if (process.env.AUTH_PROOF_CASE === 'react19.3') {
    page.on('pageerror', pageError)
    page.on('console', consoleError)
  }
  try {
    await page.goto('/login')
    await page.waitForURL(u => u.origin === c.keycloakOrigin && u.pathname.includes(`/realms/${c.realm}/`))
    expect(new URL(page.url()).searchParams.get('code_challenge_method')).toBe('S256')
    await page.locator('#username').fill(c.email)
    await page.locator('#password').fill(c.userPassword)
    await page.locator('#kc-login').click()
    await page.waitForURL(u => u.origin === c.portalOrigin && u.pathname === '/')
    await expect(page.getByText(c.email).first()).toBeVisible()
    const before = await page.request.get('/api/auth/session')
    expect(before.status()).toBe(200)
    expect((await before.json()).user.keycloakSub).toBe(c.userId)
    if (process.env.AUTH_PROOF_CASE === 'react19.3') {
      await qualifyStandaloneUi(page, errors)
      page.off('pageerror', pageError)
      page.off('console', consoleError)
    }
    await admin.logoutUserSessions(c.userId!)
    const callbackFile = path.join(c.evidenceDirectory, 'callback.json')
    await expect.poll(() => {
      try { return JSON.parse(readFileSync(callbackFile, 'utf8')).status } catch { return null }
    }, { timeout: 20_000 }).toBe(200)
    const callback = JSON.parse(readFileSync(callbackFile, 'utf8'))
    expect(callback.ownedSubject).toBe(true)
    expect(callback.tokenShape.algorithm).toBe('RS256')
    expect(await redis.get(`oidc:revoked:${c.userId}`)).toBe('1')
    const ttl = await redis.ttl(`oidc:revoked:${c.userId}`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(2592000)
    const after = await page.request.get('/api/auth/session')
    expect(after.status()).toBe(200)
    expect((await after.json())?.user).toBeUndefined()
    const protectedResponse = await page.request.get('/api/admin/users')
    expect(protectedResponse.status()).toBe(401)
    receipt('browser.json', {
      pkce: 'S256', sessionEstablished: true, backchannelObserved: true,
      tokenShape: callback.tokenShape, redisMarked: true, sessionDenied: true, protectedDenied: true,
    })
  } finally { await redis.quit() }
})
