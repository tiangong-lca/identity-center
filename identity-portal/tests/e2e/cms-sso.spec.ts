import { expect, test } from '@playwright/test'

const CMS_BASE = 'http://localhost:8081'

test.describe('CMS SSO', () => {
  test('portal home → click CMS → auto SSO → CMS dashboard (no login.do)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL('http://localhost:3000/')

    const appsGrid = page.locator('.grid')
    await expect(appsGrid.first()).toBeVisible({ timeout: 15_000 })

    const cmsLink = appsGrid.locator('a', { hasText: /内容管理|CMS/i }).first()
    await expect(cmsLink).toBeVisible({ timeout: 10_000 })

    const popup = await Promise.all([
      context.waitForEvent('page', { timeout: 30_000 }),
      cmsLink.click(),
    ]).then(([p]) => p)

    // Redirect chain: 8081/ms/oidc/login → 8080 KC SSO → 8081/ms/oidc/callback → 8081/ms/index.do
    await popup.waitForURL(
      new RegExp(`${CMS_BASE.replace(/\//g, '\\/')}\\/ms\\/(index|main)`),
      { timeout: 30_000 },
    )

    expect(popup.url()).not.toMatch(/login\.do|error|callback_failed/)
    expect(popup.url()).toMatch(/localhost:8081/)
    await expect(popup.locator('body')).toBeVisible({ timeout: 10_000 })
  })
})
