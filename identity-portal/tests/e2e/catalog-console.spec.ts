import { expect, test } from '@playwright/test'

// Monaco 在 e2e 里是脆的一环(contenteditable,异步加载):这里只做「渲染 + 可交互 + 有反馈」的
// 冒烟验证,不做逐字符编辑。更细的编辑器行为(YAML 高亮/schema 补全/内容变更)靠组件层 + 手验覆盖。
test('目录控制台:载入 → 编辑器渲染 → Apply → 结果反馈', async ({ page }) => {
  await page.goto('/admin/catalog')

  // 页面 + 标题
  await expect(page.getByRole('heading', { name: /应用目录|App Catalog/ })).toBeVisible()

  // 编辑器载入(Monaco 异步渲染 .monaco-editor,给足超时)
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 })

  // Apply 按钮可点(不改内容,验证幂等 apply 路径)
  const applyButton = page.getByRole('button', { name: /^应用$|^Apply$/ })
  await expect(applyButton).toBeEnabled()
  await applyButton.click()

  // 结果反馈:成功 toast(已应用/Applied)、diff 卡(本次变更/Changes applied),或(未改动内容时)
  // no-op 提示(无变更可应用/No changes to apply)三者其一即可;
  // 无论走哪条分支,按钮都应恢复为可点击(不应卡在 pending / 崩溃)。
  await expect(
    page.getByText(/已应用|Applied|本次变更|Changes applied|无变更|No changes/).first(),
  ).toBeVisible({ timeout: 15_000 })
  await expect(applyButton).toBeEnabled({ timeout: 15_000 })

  // 版本历史区块随之可见(即便无历史记录,标题 + 表头也应渲染)
  await expect(page.getByRole('heading', { name: /版本历史|Version history/ })).toBeVisible()
})
