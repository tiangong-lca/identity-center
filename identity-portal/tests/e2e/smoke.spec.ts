import { expect, test } from '@playwright/test'

test('登录态门户 → 管理后台概览可达', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: /概览|Overview/ })).toBeVisible()
  // 侧边导航齐全
  for (const item of ['用户管理', '注册审批', '应用管理', '审计日志']) {
    await expect(page.getByRole('link', { name: item })).toBeVisible()
  }
})

test('语言切换:zh-CN ↔ en 全站生效', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible()

  await page.getByRole('combobox').first().selectOption('en')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()

  await page.getByRole('combobox').first().selectOption('zh-CN')
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible()
})

test('主题切换:light/dark 生效且背景 token 翻转', async ({ page }) => {
  await page.goto('/admin')
  const combos = page.getByRole('combobox')
  await combos.nth(1).selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const darkBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )
  expect(darkBg).toBe('rgb(23, 23, 26)') // 设计库暗色 --color-bg-page #17171A

  await combos.nth(1).selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
