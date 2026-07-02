import { expect, test } from '@playwright/test'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@identity.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Identity-Admin-2026'

// 独立会话:本用例自己完成登录→登出→再登录的完整 SSO 生命周期
test.use({ storageState: { cookies: [], origins: [] } })

async function keycloakLogin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /^登录$|^Sign in$/ }).click()
  await page.waitForURL(/localhost:8080/)
  await page.locator('#username').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.locator('#kc-login').click()
  await page.waitForURL('http://localhost:3000/**')
}

test('登出后再点登录必须重新认证(不免密直入)', async ({ page }) => {
  // 1) 首次登录
  await keycloakLogin(page)
  await expect(page.getByText(ADMIN_EMAIL).first()).toBeVisible()

  // 2) 登出(第二层:终止 Keycloak SSO 会话)
  await page.getByRole('button', { name: /退出登录|Sign out/ }).click()
  await expect(page.getByRole('link', { name: /^登录$|^Sign in$/ })).toBeVisible({ timeout: 15_000 })

  // 3) 再次点登录 → 应回到 Keycloak 登录表单(要求重新输入凭据),而非免密跳回门户
  await page.getByRole('link', { name: /^登录$|^Sign in$/ }).click()
  await page.getByRole('button', { name: /^登录$|^Sign in$/ }).click()
  await page.waitForURL(/localhost:8080/, { timeout: 15_000 })
  await expect(page.locator('#username')).toBeVisible()
})
