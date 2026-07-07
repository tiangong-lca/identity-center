import { expect, test } from '@playwright/test'

const stamp = Date.now()

test.describe.configure({ mode: 'serial' })

test('用户管理:创建 → 详情禁用', async ({ page }) => {
  const email = `e2e-user-${stamp}@test.local`
  await page.goto('/admin/users/new')
  await page.locator('#user-email').fill(email)
  await page.locator('#user-display-name').fill('E2E 用户')
  await page.locator('#user-temporary-password').fill('E2E-Pass-2026')
  await page.getByRole('button', { name: /^创建$|^Create$/ }).click()

  await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 })

  // 危险区:禁用用户(触发 AlertDialog 二次确认)
  await page.getByRole('button', { name: /禁用用户|Disable user/ }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /禁用用户|Disable user/ })
    .click()
  await expect(page.getByText(/用户已禁用|User disabled/i).first()).toBeVisible({ timeout: 15_000 })
})

test('注册审批:提交(API)→ 列表审批通过', async ({ page, request }) => {
  const email = `e2e-reg-${stamp}@test.local`
  const submit = await request.post('/api/public/registration-requests', {
    data: { email, displayName: 'E2E 注册' },
    headers: { origin: 'http://localhost:3000' },
  })
  expect(submit.status()).toBe(202)

  await page.goto('/admin/registration-requests')
  await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^审批$|^Review$/ }).first().click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^通过$|^Approve$/ })
    .click()
  await expect(page.getByText(/已通过|approved/i).first()).toBeVisible({ timeout: 15_000 })
})

test('应用管理:定义由目录管理(只读,无登记入口)', async ({ page }) => {
  await page.goto('/admin/apps')

  // 应用定义(创建/编辑)已收敛至目录编辑器,列表页不再提供登记入口,
  // 取而代之的是指向 /admin/catalog 的提示条。
  await expect(page.getByRole('button', { name: /登记应用|Register/ })).toHaveCount(0)
  const catalogLink = page.getByRole('link', { name: /前往目录编辑|Edit in catalog/ })
  await expect(catalogLink).toBeVisible({ timeout: 15_000 })
  await expect(catalogLink).toHaveAttribute('href', '/admin/catalog')
})

test('审计日志:上述操作有记录', async ({ page }) => {
  await page.goto('/admin/audit')
  await expect(page.getByRole('heading', { name: /审计日志|Audit/ })).toBeVisible()
  await expect(
    page.getByText(/user\.create|app\.create|registration\.approve/).first(),
  ).toBeVisible({ timeout: 15_000 })
})
