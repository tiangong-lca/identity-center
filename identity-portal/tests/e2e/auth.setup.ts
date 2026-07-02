import { expect, test as setup } from '@playwright/test'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@identity.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Identity-Admin-2026'

/** 经 Keycloak OIDC 完成真实登录并保存会话状态,供全部用例复用 */
setup('管理员登录', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /登录|Sign in/ }).click()

  // Keycloak 登录页(identity 主题)
  await page.waitForURL(/localhost:8080/)
  await page.locator('#username').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.locator('#kc-login').click()

  await page.waitForURL('http://localhost:3000/**')
  await expect(page.getByText(ADMIN_EMAIL).first()).toBeVisible()
  await page.context().storageState({ path: 'tests/e2e/.auth/admin.json' })
})
