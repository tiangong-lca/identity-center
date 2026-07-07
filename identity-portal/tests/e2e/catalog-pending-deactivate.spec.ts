import { expect, test } from '@playwright/test'

const ADMIN_STATE = 'tests/e2e/.auth/admin.json'
const BASE_URL = 'http://localhost:3000'

// 面板渲染的最小保障断言:无论待停用列表是否为空,面板标题必须可见。
// 用 exact 精确匹配面板标题(「待停用」/"Pending deactivation"),避免与空态文案
// (「暂无待停用项」内含「待停用」子串)在 strict mode 下产生多元素匹配歧义。
test('待停用面板渲染', async ({ page }) => {
  await page.goto('/admin/catalog')
  await expect(page.getByText(/^待停用$|^Pending deactivation$/)).toBeVisible()
})

/**
 * 完整往返:经 API(复用管理员会话,不碰 Monaco——参照 first-login.spec.ts 的 API 造 fixture 手法)
 * 新增一个临时 app → apply,再从 YAML 移除 → 再 apply 使其变为 pending_deactivate,
 * 然后走真实控制台 UI:待停用面板列出该 app → 点击确认 → AlertDialog 复述影响数 → 确认停用 → 成功 toast。
 * 若这条造 fixture 的往返在某次运行中变脆(如与其它并发 e2e/环境状态冲突),
 * 确定性的覆盖已经由 Task 5 的集成测试(tests/integration/catalog-p3.test.ts)兜底。
 */
test('临时 app 移除后进入待停用 → 控制台确认停用 → 成功', async ({ page, playwright }) => {
  const appCode = `e2e-pd-${Date.now()}`
  const appName = `E2E待停用-${Date.now()}`
  const api = await playwright.request.newContext({ baseURL: BASE_URL, storageState: ADMIN_STATE })

  try {
    // 1) 读当前目录(getCurrent 已过滤 pending_deactivate/deactivated,拿到的是可编辑存量)
    const currentRes = await api.get('/api/admin/catalog')
    expect(currentRes.status(), await currentRes.text()).toBe(200)
    const { yaml: baseYaml } = (await currentRes.json()).data as { yaml: string; version: number }

    // 2) 追加临时 app → apply(不传 expectedVersion,避免与并发用例的版本号竞争)
    const withTempAppYaml = `${baseYaml}  - code: ${appCode}\n    name: ${appName}\n    keycloak: { clientId: ${appCode}-client, accessRole: ${appCode}_access }\n    roles: []\n`
    const addRes = await api.post('/api/admin/catalog/apply', {
      data: { yaml: withTempAppYaml },
      headers: { origin: BASE_URL, 'content-type': 'application/json' },
    })
    expect(addRes.status(), await addRes.text()).toBe(200)

    // 3) 再 apply 回原 YAML(临时 app 从 desired 中消失)→ 临时 app 变 pending_deactivate
    const removeRes = await api.post('/api/admin/catalog/apply', {
      data: { yaml: baseYaml },
      headers: { origin: BASE_URL, 'content-type': 'application/json' },
    })
    expect(removeRes.status(), await removeRes.text()).toBe(200)

    // 4) 待停用列表应包含该临时 app(API 层先行确认,UI 断言前先排除 fixture 本身的问题)
    const pendingRes = await api.get('/api/admin/catalog/pending-deactivate')
    expect(pendingRes.status(), await pendingRes.text()).toBe(200)
    const items = (await pendingRes.json()).data.items as Array<{ appCode: string }>
    expect(items.map((i) => i.appCode)).toContain(appCode)

    // 5) 真实 UI:面板列出该 app → 点击确认 → AlertDialog 复述影响数 → 确认停用 → 成功 toast
    await page.goto('/admin/catalog')
    await expect(page.getByText(new RegExp(appCode))).toBeVisible({ timeout: 15_000 })

    const confirmButton = page
      .locator('li', { hasText: appCode })
      .getByRole('button', { name: /^确认停用$|^Confirm deactivate$/ })
    await confirmButton.click()

    // AlertDialog:复述目标名称 + 受影响分配数(confirmBody 把两者拼进同一段文案;
    // 用 appName 限定到本用例的临时 app,避免与环境里其它遗留 pending 项的 "0 个生效分配" 文案撞车)
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(new RegExp(appName))).toBeVisible()
    await expect(dialog.getByText(/0 个生效分配|0 active assignment/)).toBeVisible()

    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^确认停用$|^Confirm deactivate$/ })
      .click()

    await expect(page.getByText(/已停用|Deactivated/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(new RegExp(appCode))).toHaveCount(0)
  } finally {
    // 兜底清理:若用例在第 5 步的 UI 交互中途失败(如短暂的渲染时序抖动),临时 app 会残留在
    // pending_deactivate——直接经 API 补一次确认停用,防止在共享开发库里越攒越多、污染后续用例
    // 与真实控制台视图。已经被上面的 UI 流程停用时,这里会拿到 409(非 pending_deactivate 态),
    // 属预期,忽略即可。
    await api.post('/api/admin/catalog/deactivate', {
      data: { appCode },
      headers: { origin: BASE_URL, 'content-type': 'application/json' },
    }).catch(() => undefined)
    await api.dispose()
  }
})
