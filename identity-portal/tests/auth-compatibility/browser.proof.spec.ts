import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Redis from 'ioredis'
import { createKeycloakAdmin } from '../../lib/keycloak/admin-client'
import { fixture, receipt } from './fixture'
import { qualifyCatalogUi } from './catalog-ui'
import { qualifyStandaloneUi } from './ui-acceptance'
import { qualificationUiPlan, combinedReactUi } from './ui-plan.mjs'
import { createBrowserDiagnostics } from './browser-diagnostics'

const c = fixture()

test('real Keycloak PKCE/Auth.js session is denied after actual signed backchannel logout', async ({ page }) => {
  expect(c.adminApiSecret && c.userId).toBeTruthy()
  const admin = createKeycloakAdmin({ baseUrl: c.keycloakOrigin, realm: c.realm, clientId: 'user-portal-admin-api', clientSecret: c.adminApiSecret! })
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, connectTimeout: 3000 })
  const plan = qualificationUiPlan(c.qualificationCase, c.variant)
  const catalog = c.qualificationCase === 'catalog-yaml' || c.qualificationCase === 'react19.3-catalog-fixed'
  const ui = plan.broad || plan.catalog
  const errors = { page: 0, console: 0 }
  const diagnostics = createBrowserDiagnostics({ portalOrigin: c.portalOrigin, builtAssetPaths: c.browserAssets ?? [],
    secrets: [c.masterPassword, c.redisPassword, c.postgresPassword, c.authSecret, c.userPassword, c.portalSecret ?? '', c.adminApiSecret ?? '', c.email, c.userId ?? ''] })
  const pageError = (error: Error) => { errors.page++; diagnostics.record(error) }
  const consoleError = (message: { type(): string }) => { if (message.type() === 'error') errors.console++ }
  let forbiddenRequests = 0
  if (catalog) await page.context().route('**/*', async route => {
    const url = new URL(route.request().url())
    if (![c.portalOrigin, c.keycloakOrigin].includes(url.origin) || url.username || url.password) {
      forbiddenRequests++
      await route.abort()
    } else await route.continue()
  })
  if (ui) { page.on('pageerror', pageError); page.on('console', consoleError) }
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
    if (ui) {
      expect(c.browserAssets?.length).toBeGreaterThan(0)
      if (c.qualificationCase === 'react19.3-catalog-fixed') {
        await qualifyStandaloneUi(page, errors, diagnostics, 'ui-broad.json')
        await qualifyCatalogUi(page, errors, diagnostics, 'ui-catalog.json')
        const read = (name: string) => JSON.parse(readFileSync(path.join(c.evidenceDirectory, name), 'utf8'))
        receipt('ui.json', combinedReactUi(c.qualificationCase, c.variant, read('ui-broad.json'), read('ui-catalog.json'), errors))
      } else if (plan.broad) await qualifyStandaloneUi(page, errors, diagnostics)
      else await qualifyCatalogUi(page, errors, diagnostics)
      page.off('pageerror', pageError); page.off('console', consoleError)
    } else if (plan.knownDefectiveSkip) receipt('ui.json', { qualificationCase: 'catalog-yaml', executed: false, passed: false,
      reason: 'known-baseline-yaml-worker-defect', baseline: '64055a2cd05fa4056ea36fd9ab1b780a77e1690e', retainedFailureRun: 40474716057 })
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
    expect(forbiddenRequests).toBe(0)
    receipt('browser.json', {
      pkce: 'S256', sessionEstablished: true, backchannelObserved: true,
      tokenShape: callback.tokenShape, redisMarked: true, sessionDenied: true, protectedDenied: true,
    })
  } finally {
    page.off('pageerror', pageError); page.off('console', consoleError)
    try { if (ui) receipt('browser-errors.json', diagnostics.snapshot()) }
    finally { await redis.quit() }
  }
})
