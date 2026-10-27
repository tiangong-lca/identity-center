import { expect, type Page, type Worker } from '@playwright/test'
import { load } from 'js-yaml'
import { fixture, receipt } from './fixture'
import { syntheticCatalogDocument } from './catalog-case.mjs'
import { classifyYamlWorker } from './catalog-worker-identity.mjs'
import type { BrowserDiagnostics } from './browser-diagnostics'
import { nativeInputState } from './native-input-state'

export async function qualifyCatalogUi(page: Page, errors: { page: number; console: number }, diagnostics: BrowserDiagnostics) {
  const c = fixture()
  const workers: Worker[] = []
  const closed = new Set<Worker>()
  let unrecognizedWorkers = 0
  let passed = false
  const undoSteps: number[] = []
  const workerCreated = (worker: Worker) => {
    const kind = classifyYamlWorker(worker.url(), c.portalOrigin, c.yamlWorker)
    if (kind === 'yaml') { workers.push(worker); worker.once('close', () => closed.add(worker)) }
    else if (kind === 'unrecognized') unrecognizedWorkers++
  }
  page.on('worker', workerCreated)
  try {
    expect(c.qualificationCase).toBe('catalog-yaml')
    expect(c.variant).toBe('candidate')
    expect(c.yamlWorker?.chunks.length).toBeGreaterThan(0)
    // Locale is a prerequisite for exact semantic controls, not a locale suite.
    await page.locator('select').filter({ has: page.locator('option[value="en"]') }).selectOption('en')
    diagnostics.setStage('navigation')
    await page.evaluate(() => { Object.assign(window, { identityCatalogSpa: 'same-document' }) })
    await page.locator('a[href="/admin"]').click()
    await page.locator('a[href="/admin/apps"]').click()
    const registry = () => page.getByRole('navigation').getByRole('link', { name: 'Registry', exact: true })
    await expect(registry()).toHaveCount(1)
    await registry().click()
    await expect(page).toHaveURL(`${c.portalOrigin}/admin/apps/registry`)
    const snapshot = await page.request.get('/api/admin/catalog')
    expect(snapshot.status()).toBe(200)
    const current = (await snapshot.json()).data as { yaml: string; version: number }
    expect(load(current.yaml)).toEqual(syntheticCatalogDocument(c))
    const editor = () => page.locator('.monaco-editor[role="code"]')
    const focus = async () => {
      await expect(editor()).toHaveCount(1)
      await expect(editor()).toBeVisible()
      await editor().click()
      await expect.poll(() => editor().evaluate(el => el.contains(document.activeElement))).toBe(true)
    }
    const replace = async (value: string) => { await focus(); await page.keyboard.press('Control+A'); await page.keyboard.insertText(value) }
    const schema = async () => {
      diagnostics.setStage('worker-schema')
      await replace('version: 1\napplications: false\n')
      const warning = editor().locator('.squiggly-warning')
      await expect(warning).toHaveCount(1)
      const value = editor().locator('.view-lines').getByText('false', { exact: true })
      await expect(value).toHaveCount(1)
      await expect(value).toBeVisible()
      await value.hover()
      await expect(page.getByText('Incorrect type. Expected "array".', { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await focus()
      let restored = false
      for (let step = 1; step <= 8; step++) {
        await page.keyboard.press('Control+Z')
        await page.keyboard.press('Control+A')
        const state = await page.evaluate(nativeInputState, current.yaml)
        expect(state.available).toBe(true)
        expect(state.wholeSelection).toBe(true)
        if (state.exact) { restored = true; undoSteps.push(step); break }
      }
      expect(restored).toBe(true)
      await expect(editor().locator('.squiggly-warning, .squiggly-error')).toHaveCount(0)
    }
    diagnostics.setStage('monaco-load')
    await schema()
    await expect.poll(() => workers.length).toBe(1)
    diagnostics.setStage('monaco-edit-apply')
    await focus()
    await page.keyboard.press('Control+End')
    const comment = `# synthetic-yaml-${c.nonce}`
    await page.keyboard.insertText(`\n${comment}\n`)
    const applied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/catalog/apply' && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    const response = await applied
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({ yaml: `${current.yaml}\n${comment}\n`, expectedVersion: current.version })
    expect((await response.json()).data.version).toBe(current.version)
    const readback = await page.request.get('/api/admin/catalog')
    expect(readback.status()).toBe(200)
    expect((await readback.json()).data).toEqual(current)
    diagnostics.setStage('worker-disposal')
    const first = workers[0]
    const apps = page.getByRole('navigation').getByRole('link', { name: 'Application list', exact: true })
    await expect(apps).toHaveCount(1)
    expect(closed.has(first)).toBe(false)
    await apps.click()
    await expect(page).toHaveURL(`${c.portalOrigin}/admin/apps`)
    await expect.poll(() => closed.has(first)).toBe(true)
    diagnostics.setStage('worker-reopen')
    await registry().click()
    await expect(page).toHaveURL(`${c.portalOrigin}/admin/apps/registry`)
    await schema()
    await expect.poll(() => workers.length).toBe(2)
    expect(workers[1]).not.toBe(first)
    expect(closed.has(workers[1])).toBe(false)
    await apps.click()
    await expect.poll(() => closed.size).toBe(2)
    expect(await page.evaluate(() => Reflect.get(window, 'identityCatalogSpa'))).toBe('same-document')
    expect(unrecognizedWorkers).toBe(0)
    expect(errors).toEqual({ page: 0, console: 0 })
    passed = true
  } finally {
    page.off('worker', workerCreated)
    receipt('ui.json', { qualificationCase: 'catalog-yaml', executed: true, passed, errors,
      schemaWorker: passed, keyboardApplyReadback: passed, spaDisposalReopen: passed,
      yamlWorkers: workers.length, yamlWorkersClosed: closed.size, unrecognizedWorkers, exactBufferRestored: passed, undoSteps, syntheticDataOnly: true })
  }
}
