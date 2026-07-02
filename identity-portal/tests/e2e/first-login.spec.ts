import { expect, test } from '@playwright/test'

const ADMIN_STATE = 'tests/e2e/.auth/admin.json'

// 新开通用户的首次登录:匿名浏览器上下文(不复用管理员会话)
test.use({ storageState: { cookies: [], origins: [] } })

/**
 * 问题 1 回归:管理员开通的账号,首次登录必须走「临时密码 → 强制改密 → 进门户」,
 * 不得被邮箱验证拦截(默认环境无 SMTP,verifyEmail 关闭、开通即已验证)。
 */
test('新开通用户首次登录:改密后直达门户,不被邮件验证拦截', async ({ page, playwright }) => {
  const email = `e2e-first-login-${Date.now()}@test.local`
  const tempPassword = 'First-Login-2026'
  const newPassword = 'First-Login-2026-New'

  // 管理员经 API 开通账号(复用 setup 阶段保存的管理员会话)
  const adminApi = await playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    storageState: ADMIN_STATE,
  })
  const created = await adminApi.post('/api/admin/users', {
    data: { email, displayName: '首登用户', temporaryPassword: tempPassword },
    headers: { origin: 'http://localhost:3000' },
  })
  expect(created.status(), await created.text()).toBe(201)
  await adminApi.dispose()

  // 新用户首次登录
  await page.goto('/login')
  await page.getByRole('button', { name: /^登录$|^Sign in$/ }).click()
  await page.waitForURL(/localhost:8080/)
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(tempPassword)
  await page.locator('#kc-login').click()

  // 不得出现邮件发送失败/邮箱验证页(问题 1 的症状)
  await expect(page.locator('body')).not.toContainText(/发送电子邮件失败|Failed to send email|验证电子邮件地址|Email verification/i)

  // 临时密码 → Keycloak 强制改密页
  await page.locator('#password-new').fill(newPassword)
  await page.locator('#password-confirm').fill(newPassword)
  await page.locator('#kc-form-buttons input[type="submit"], input#kc-submit, button[type="submit"]').first().click()

  // 改密完成 → 回门户,已登录(显示邮箱)
  await page.waitForURL('http://localhost:3000/**', { timeout: 20_000 })
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 })
})
