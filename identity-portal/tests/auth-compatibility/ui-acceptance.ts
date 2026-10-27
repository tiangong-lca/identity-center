import { expect, type Page } from '@playwright/test'
import { fixture, receipt } from './fixture'
import type { BrowserDiagnostics } from './browser-diagnostics'

// Actual shipped routes/components and real APIs, exclusively in the owned fixture.
// This runs before logout so deliberate transport-denial errors do not mask UI errors.
export async function qualifyStandaloneUi(page: Page, errors: { page: number; console: number }, diagnostics: BrowserDiagnostics) {
  const c = fixture()
  let passed = false
  try {
    diagnostics.setStage('hydration')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    const language = () => page.locator('select').filter({ has: page.locator('option[value="en"]') })
    const theme = () => page.locator('select').filter({ has: page.locator('option[value="dark"]') })
    await language().selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'Identity Platform', exact: true })).toBeVisible()
    await theme().selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await theme().selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    diagnostics.setStage('navigation')
    // A full-document fallback loses the sentinel; URL-only checks cannot prove Link hydration.
    await page.evaluate(() => { Object.assign(window, { identityUiNavigationSentinel: 'same-document' }) })
    await page.locator('a[href="/admin"]').click()
    await expect(page).toHaveURL(`${c.portalOrigin}/admin`)
    await page.locator('a[href="/admin/users"]').click()
    await expect(page).toHaveURL(`${c.portalOrigin}/admin/users`)
    expect(await page.evaluate(() => Reflect.get(window, 'identityUiNavigationSentinel'))).toBe('same-document')
    await page.getByRole('link', { name: c.email, exact: true }).click()
    await page.getByRole('tab', { name: 'App access', exact: true }).click()
    diagnostics.setStage('radix')
    const trigger = page.getByRole('button', { name: 'Assign application', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Assign application', exact: true })
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
    // Walk forward and backward past the complete small dialog focus cycle.
    for (const key of ['Tab', 'Shift+Tab']) for (let n = 0; n < 8; n++) {
      await page.keyboard.press(key)
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    diagnostics.setStage('organization')
    await page.locator('a[href="/admin/orgs"]').click()
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Create organization', exact: true }).click()
    const create = page.getByRole('dialog', { name: 'Create organization', exact: true })
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(create.getByText('Code and name are required', { exact: true })).toBeVisible()
    const code = `ui-${c.nonce}`
    await create.locator('#org-code').fill(code)
    await create.locator('#org-name').fill(`Synthetic ${code}`)
    const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/platform-organizations' && r.request().method() === 'POST')
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    const response = await created
    expect(response.status()).toBe(201)
    expect(response.request().postDataJSON()).toEqual({ code, name: `Synthetic ${code}`, type: 'department' })
    expect((await response.json()).data).toMatchObject({ code, name: `Synthetic ${code}`, type: 'department', status: 'active' })
    await expect(create).toBeHidden()
    await expect(page.getByRole('cell', { name: code, exact: true })).toBeVisible()
    const persisted = await page.request.get('/api/admin/platform-organizations?pageSize=100')
    expect(persisted.status()).toBe(200)
    expect((await persisted.json()).data.items).toEqual(expect.arrayContaining([expect.objectContaining({ code, name: `Synthetic ${code}` })]))

    diagnostics.setStage('catalog')
    await page.locator('a[href="/admin/apps"]').click()
    const registryTab = page.getByRole('navigation').getByRole('link', { name: 'Registry', exact: true })
    await expect(registryTab).toHaveCount(1)
    await registryTab.click()
    await expect(page).toHaveURL(`${c.portalOrigin}/admin/apps/registry`)
    expect(await page.evaluate(() => Reflect.get(window, 'identityUiNavigationSentinel'))).toBe('same-document')
    const snapshot = await page.request.get('/api/admin/catalog')
    expect(snapshot.status()).toBe(200)
    const current = (await snapshot.json()).data as { yaml: string; version: number }
    diagnostics.setStage('monaco-load')
    const editor = page.locator('.monaco-editor[role="code"]')
    await expect(editor).toHaveCount(1)
    await expect(editor).toBeVisible()
    await editor.click()
    await expect.poll(() => editor.evaluate(el => el.contains(document.activeElement))).toBe(true)
    diagnostics.setStage('monaco-edit-apply')
    await page.keyboard.press('Control+End')
    const comment = `# synthetic-ui-${c.nonce}`
    await page.keyboard.insertText(`\n${comment}\n`)
    const applied = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/catalog/apply' && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    const apply = await applied
    expect(apply.status()).toBe(200)
    const submitted = apply.request().postDataJSON() as { yaml: string; expectedVersion: number }
    expect(submitted).toEqual({ yaml: `${current.yaml}\n${comment}\n`, expectedVersion: current.version })
    expect((await apply.json()).data.version).toBe(current.version)
    const unchanged = await page.request.get('/api/admin/catalog')
    expect(unchanged.status()).toBe(200)
    expect((await unchanged.json()).data).toEqual(current)

    diagnostics.setStage('locale-theme')
    // Reconcile locale and theme state again after navigation and editor/form work.
    await language().selectOption('zh-CN')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('a[href="/admin/orgs"]')).toHaveText('组织管理')
    await theme().selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await language().selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('a[href="/admin/orgs"]')).toHaveText('Organizations')
    await theme().selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(errors).toEqual({ page: 0, console: 0 })
    passed = true
  } finally {
    // Counts only: never retain raw console/error text, token URLs or browser state.
    receipt('ui.json', { passed, errors, firstRenderHydration: passed, clientNavigation: passed, realFormAndReadback: passed, radixFocusTrapAndRestore: passed, monacoEditAndApply: passed, localesAndThemes: passed, syntheticDataOnly: true })
  }
}
