import { expect, test } from '@playwright/test'

// 公共注册页:匿名访问(清空管理员会话)
test.use({ storageState: { cookies: [], origins: [] } })

test('公共注册申请:表单提交 → 成功态;登录页有注册入口', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: /提交注册申请|Request registration/ })).toBeVisible()

  await page.goto('/register')
  await page.locator('#register-email').fill(`e2e-register-${Date.now()}@test.local`)
  await page.locator('#register-display-name').fill('E2E 注册用户')
  await page.getByRole('button', { name: /提交申请|Submit request/ }).click()
  await expect(page.getByTestId('register-success')).toBeVisible({ timeout: 10_000 })
})

test('公共注册申请:选择应用与角色(D7)→ 随申请提交 → 成功态', async ({ page }) => {
  await page.goto('/register')

  // 目录来自 GET /api/public/applications(seed:tiangong-lca + review-admin 等角色)
  const appCheckbox = page.getByLabel('TianGong LCA 平台')
  await expect(appCheckbox).toBeVisible({ timeout: 10_000 })

  await page.locator('#register-email').fill(`e2e-register-role-${Date.now()}@test.local`)
  await page.locator('#register-display-name').fill('E2E 选角色用户')

  // 勾选应用 → 出现角色下拉 → 选择 review-admin
  await appCheckbox.check()
  const roleSelect = page.getByRole('combobox', { name: /^角色$|^Role$/ })
  await expect(roleSelect).toBeVisible()
  await roleSelect.selectOption({ label: '评审管理员' })

  await page.getByRole('button', { name: /提交申请|Submit request/ }).click()
  await expect(page.getByTestId('register-success')).toBeVisible({ timeout: 10_000 })
})
