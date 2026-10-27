import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join, extname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { projectWorkerStage } from '../tests/monaco-worker/stages.mjs'

// Focused worker bundle only: never starts Next, Portal, Docker or authentication.
const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
assert(args.length === 3 && ['--build-only', '--run'].includes(args[0]) && args[1] === '--output')
assert(isAbsolute(args[2]))
const output = resolve(args[2])
await mkdir(output, { mode: 0o700 }) // Existing output is refused; no stale proof reuse.
const require = createRequire(import.meta.url)
const requireTsx = createRequire(require.resolve('tsx'))
const { build } = await import(pathToFileURL(requireTsx.resolve('esbuild')).href)
const result = await build({
  absWorkingDir: root,
  entryPoints: {
    fixture: join(root, 'tests/monaco-worker/fixture.ts'),
    'yaml.worker': require.resolve('monaco-yaml/yaml.worker.js'),
  },
  outdir: output, bundle: true, format: 'esm', platform: 'browser', splitting: true,
  target: 'es2022', sourcemap: false, metafile: true, logLevel: 'silent',
  loader: { '.ttf': 'file' },
})
await writeFile(join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><script type="module" src="/fixture.js"></script></body></html>')
const files = new Set(await readdir(output))
const assets = []
for (const name of files) {
  const bytes = await readFile(join(output, name))
  assets.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const receipt = { mode: args[0], assets, inputCount: Object.keys(result.metafile.inputs).length, browserRun: false, cases: [] }

async function evaluateOwned(page, context, mode, entry) {
  delete entry.lastStage
  delete entry.failureStage
  let timer
  let timedOut = false
  try {
    const projection = await Promise.race([
      page.evaluate(async (selected) => {
        try { return { passed: true, result: await window.runMonacoWorkerRegression(selected) } }
        catch { return { passed: false, stage: window.monacoWorkerRegressionStage } }
      }, mode),
      new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('owned-evaluation-timeout')) }, 45_000) }),
    ])
    entry.lastStage = projectWorkerStage(projection.stage ?? 'complete')
    assert.equal(projection.passed, true)
    return projection.result
  } catch {
    entry.failureStage = timedOut ? 'host-evaluation-timeout' : entry.lastStage ?? 'host-evaluation-failed'
    // Closing the owned context terminates stalled worker RPC/evaluation as well.
    await context.close()
    throw new Error('owned-worker-evaluation-failed')
  } finally { clearTimeout(timer) }
}
if (args[0] === '--build-only') {
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ bundlePassed: true, assets: assets.length, browserRun: false }) + '\n')
} else {
  let browser
  let phase = 'server'
  let origin
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, origin)
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    if (request.method !== 'GET' || !files.has(name)) { response.writeHead(404).end(); return }
    const contentTypes = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.ttf': 'font/ttf' }
    response.setHeader('Content-Type', contentTypes[extname(name)] ?? 'application/octet-stream')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' data:")
    response.end(await readFile(join(output, name)))
  })
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    origin = `http://127.0.0.1:${server.address().port}`
    phase = 'browser'
    browser = await chromium.launch({ headless: true })
    receipt.browserRun = true
    for (const mode of ['legacy', 'repaired']) {
      phase = mode
      const context = await browser.newContext({ serviceWorkers: 'block' })
      const counts = { page: 0, console: 0, forbiddenRequests: 0, workers: 0, workersClosed: 0 }
      const entry = { mode, counts, passed: false }
      receipt.cases.push(entry)
      const page = await context.newPage()
      page.on('pageerror', () => counts.page++)
      page.on('console', (message) => { if (message.type() === 'error') counts.console++ })
      page.on('worker', (worker) => { counts.workers++; worker.on('close', () => counts.workersClosed++) })
      await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin !== origin) { counts.forbiddenRequests++; await route.abort(); return }
        await route.continue()
      })
      try {
        await page.goto(origin, { waitUntil: 'load' })
        await page.waitForFunction(() => typeof window.runMonacoWorkerRegression === 'function')
        const result = await evaluateOwned(page, context, mode, entry)
        if (mode === 'legacy') assert.equal(result.legacyRejected, true)
        else {
          assert.equal(result.realWorkerAcceptance, true)
          // Same page remount: no stale providers/models or disposed manager reuse.
          const reopened = await evaluateOwned(page, context, 'repaired', entry)
          assert.equal(reopened.realWorkerAcceptance, true)
          const deadline = Date.now() + 5000
          while (counts.workersClosed < counts.workers && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25))
          assert(counts.workers >= 4)
          assert.equal(counts.workersClosed, counts.workers)
          assert.equal(counts.page, 0)
          assert.equal(counts.console, 0)
        }
        assert.equal(counts.forbiddenRequests, 0)
        entry.result = result
        entry.passed = true
      } finally { await context.close() }
    }
    receipt.passed = true
  } catch {
    receipt.passed = false
    receipt.failurePhase = phase // Fixed trusted stage only; never raw Error/message/stack.
    process.exitCode = 1
  } finally {
    try { await browser?.close() } catch { receipt.passed = false; process.exitCode = 1 }
    finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    receipt.ownedBrowserClosed = browser === undefined || !browser.isConnected()
    receipt.ownedServerClosed = !server.listening
    await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
    process.stdout.write(JSON.stringify(receipt) + '\n')
  }
}
