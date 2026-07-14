import { expect, test } from '@playwright/test'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@identity.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Identity-Admin-2026'
const NEW_USER_PASSWORD = 'E2e-Switch-2026!'

test.use({ storageState: { cookies: [], origins: [] } })

test('切账号登录不 403:admin 在 /admin 登出 → 新用户首登落在 / 而非 /403', async ({
  page,
  request,
}) => {
  // 1) API 提交注册申请
  const email = `e2e-switch-${Date.now()}@test.local`
  await request.post('/api/public/registration-requests', {
    data: { email, displayName: 'E2E 切账号测试' },
    headers: { origin: 'http://localhost:3000' },
  })

  // 2) admin 浏览器登录
  await page.goto('/login')
  await page.getByRole('button', { name: /^登录$|^Sign in$/ }).click()
  await page.waitForURL(/localhost:8080/)
  await page.locator('#username').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.locator('#kc-login').click()
  await page.waitForURL('http://localhost:3000/**')

  // 3) 审批注册(填入已知临时密码)
  await page.goto('/admin/registration-requests')
  await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^审批$|^Review$/ }).first().click()
  await page.locator('#temporary-password').fill(NEW_USER_PASSWORD)
  await page.getByRole('dialog').getByRole('button', { name: /^通过$|^Approve$/ }).click()
  await expect(page.getByText(/已通过|approved/i).first()).toBeVisible({ timeout: 15_000 })

  // 4) 导航到 /admin — 建立 stale callback-url cookie 条件
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin/)

  // 5) 从 /admin 页面登出 → 到达 Keycloak 登录页
  await page.getByRole('button', { name: /退出登录|Sign out/ }).click()
  await page.waitForURL(/localhost:8080/, { timeout: 15_000 })

  // 6) 新用户用临时密码登录
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(NEW_USER_PASSWORD)
  await page.locator('#kc-login').click()

  // 7) Keycloak UPDATE_PASSWORD required action — 修改密码页应保持中文
  await page.waitForURL(/login-actions/, { timeout: 15_000 })
  await expect(page.locator('#password-new')).toBeVisible({ timeout: 10_000 })

  // locale 不变性:登录页中文 → 改密页也应中文
  const pageTitle = await page.locator('#kc-page-title').textContent()
  expect(pageTitle).toMatch(/更新密码|Update password/i)

  await page.locator('#password-new').fill(NEW_USER_PASSWORD)
  await page.locator('#password-confirm').fill(NEW_USER_PASSWORD)
  await page.locator('#kc-login').click()

  // 8) 核心断言:新用户应落在 / 而非 /403
  await page.waitForURL('http://localhost:3000/**', { timeout: 15_000 })
  expect(page.url()).not.toMatch(/\/403/)
  await expect(page).toHaveURL('http://localhost:3000/')
})
