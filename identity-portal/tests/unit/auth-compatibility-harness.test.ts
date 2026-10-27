import { describe, expect, it } from 'vitest'
import { generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { assertFixture, assertHostedContext, assertLocalOrigin, cleanEnvironment, composeDocument, IMAGE_TAGS, ownedLifecycle, redactor, lineRedactor, attemptCleanup, assertProductDelta, assertProductDeltaFromGit } from '../auth-compatibility/contract.mjs'
import { timeNegatives } from '../auth-compatibility/time-claims'

it('signs distinct stale-iat and past-exp inputs, with an otherwise accepted fresh-iat control', async () => {
  const now = 1_792_224_000
  const issuer = 'http://localhost:21001/realms/synthetic'
  const base = (sub: string): JWTPayload => ({ iss: issuer, aud: 'user-portal', sub, iat: now })
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const sign = (claims: JWTPayload) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).sign(privateKey)
  // The real handler's verification options, with a fixed clock only for this unit control.
  const options = { algorithms: ['RS256'], issuer, maxTokenAge: '2m', currentDate: new Date(now * 1000) }
  const cases = timeNegatives(base, now)
  expect(cases.map(([name]) => name)).toEqual(['stale-iat', 'expired-exp'])
  expect(cases[0][1]).not.toHaveProperty('exp')
  expect(cases[1][1]).toMatchObject({ iat: now, exp: now - 600 })
  for (const [name, claims] of cases) {
    await expect(jwtVerify(await sign(claims), publicKey, options), name).rejects.toMatchObject({
      code: 'ERR_JWT_EXPIRED', claim: name === 'stale-iat' ? 'iat' : 'exp', reason: 'check_failed',
    })
  }
  const fresh = { ...cases[1][1] }
  delete fresh.exp
  await expect(jwtVerify(await sign(fresh), publicKey, options)).resolves.toMatchObject({ payload: fresh })
})

function fixture() {
  const nonce = 'a'.repeat(20)
  return {
    variant: 'baseline', nonce, project: `identity34-baseline-${nonce}`, realm: `identity34-baseline-${nonce}`,
    keycloakOrigin: 'http://localhost:21001', portalOrigin: 'http://localhost:21002',
    redisOrigin: 'http://localhost:21003', postgresOrigin: 'http://localhost:21004',
    masterPassword: 'm'.repeat(40), redisPassword: 'r'.repeat(40), postgresPassword: 'p'.repeat(40),
    authSecret: 'a'.repeat(40), userPassword: 'u'.repeat(40), email: `identity34-baseline-${nonce}@test.local`,
  }
}

describe('hosted auth proof isolation', () => {
  it('refuses local/self-hosted execution and substituted checkout identities before Docker', () => {
    const head = 'a'.repeat(40)
    const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'tiangong-lca/identity-center', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', AUTH_PROOF_HEAD: head, RUNNER_TEMP: '/tmp/runner' }
    expect(() => assertHostedContext(env, 'linux', head)).not.toThrow()
    for (const changed of [{ GITHUB_ACTIONS: '' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { AUTH_PROOF_HEAD: 'b'.repeat(40) }, { GITHUB_REPOSITORY: 'foreign/repo' }]) {
      expect(() => assertHostedContext({ ...env, ...changed }, 'linux', head)).toThrow()
    }
    expect(() => assertHostedContext(env, 'darwin', head)).toThrow()
  })

  it('rejects external/default/reused endpoints and foreign realm ownership', () => {
    for (const raw of ['https://localhost:21001', 'http://example.com:21001', 'http://u:p@localhost:21001', 'http://localhost:21001/path', 'http://localhost:21001?q=1']) expect(() => assertLocalOrigin(raw)).toThrow()
    expect(() => assertFixture({ ...fixture(), realm: 'company-dev' })).toThrow()
    expect(() => assertFixture({ ...fixture(), portalOrigin: fixture().keycloakOrigin })).toThrow()
  })

  it('renders only owned three services, loopback ports, digest pins and project storage', () => {
    const images = Object.fromEntries(Object.entries(IMAGE_TAGS).map(([name, tag]) => [name, `${tag}@sha256:${'a'.repeat(64)}`]))
    const c = composeDocument(fixture(), images, '/owned/theme')
    expect(Object.keys(c.services)).toEqual(['postgres', 'keycloak', 'redis'])
    expect(JSON.stringify(c)).not.toContain('external')
    expect(c.services.keycloak.volumes).toEqual(['/owned/theme:/opt/keycloak/themes:ro'])
    expect(Object.values(c.services).every(s => s.ports.every(p => p.startsWith('127.0.0.1:')))).toBe(true)
    expect(() => composeDocument(fixture(), { ...images, redis: 'redis:latest' }, '/owned/theme')).toThrow()
  })

  it('never inherits deployment, GitHub or dotenv credentials', () => {
    const env = cleanEnvironment({ PATH: '/bin', HOME: '/owned/home', GITHUB_TOKEN: 'secret', DATABASE_URL: 'prod', DOTENV_CONFIG_PATH: '/production.env', AWS_SECRET_ACCESS_KEY: 'secret' }, fixture(), '/owned/config.json')
    expect(env).not.toHaveProperty('GITHUB_TOKEN')
    expect(env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY')
    expect(env.DOTENV_CONFIG_PATH).toBe('/owned/config.json.env')
    expect(env.KEYCLOAK_REALM).toBe(fixture().realm)
    expect(env.DATABASE_URL).not.toContain('prod')
  })

  it('cleans partial startup and surfaces cleanup failure alongside the original error', async () => {
    const called: string[] = []
    await expect(ownedLifecycle(async () => { called.push('setup'); throw Error('readiness') }, async () => { called.push('run') }, async () => { called.push('cleanup') })).rejects.toThrow('readiness')
    expect(called).toEqual(['setup', 'cleanup'])
    await expect(ownedLifecycle(async () => {}, async () => { throw Error('test failure') }, async () => { throw Error('cleanup') })).rejects.toThrow('Owned fixture cleanup failed')
  })

  it('redacts generated secrets and JWTs before evidence publication', () => {
    expect(redactor(['synthetic-secret'])('synthetic-secret eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln')).toBe('[REDACTED] [REDACTED_JWT]')
    expect(redactor([])('cookie: encrypted-value')).toBe('cookie: [REDACTED]')
    expect(redactor([])('eyJhbGciOiJkaXIifQ..aW52ZW50b3J5.Y2lwaGVy.dGFn')).toBe('[REDACTED_JWT]')
  })
})

// These checks protect the concrete published workflow, not a parallel template.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { load } from 'js-yaml'

it('keeps hosted auth proof secretless, PR-head bound and absent from unrelated feature changes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/auth-compatibility.yml'), 'utf8')
  const workflow = load(source) as {
    on: Record<string, { paths: string[] }>
    permissions: Record<string, string>
    jobs: Record<string, { 'runs-on': string; steps: Array<{ uses?: string; with?: Record<string, unknown>; env?: Record<string, string> }> }>
  }
  expect(Object.keys(workflow.on)).toEqual(['pull_request'])
  expect(workflow.on.pull_request.paths).not.toContain('identity-portal/**')
  expect(workflow.on.pull_request.paths).not.toContain('**')
  expect(workflow.permissions).toEqual({ contents: 'read' })
  const job = workflow.jobs['auth-compatibility']
  expect(job['runs-on']).toBe('ubuntu-24.04')
  expect(job.steps.find(step => step.env?.AUTH_PROOF_CASE)?.env?.AUTH_PROOF_CASE).toBe('react19.3-catalog-fixed')
  expect(job.steps.find(step => step.uses?.startsWith('actions/setup-node@'))?.with?.['node-version']).toBe('24.22.1')
  expect(job.steps[0].with?.ref).toBe('${{ github.event.pull_request.head.sha }}')
  expect(job.steps[0].with?.['persist-credentials']).toBe(false)
  expect(source).not.toMatch(/secrets\.|pull_request_target|workflow_dispatch/)
  expect(fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/ci.yml'), 'utf8')).not.toContain('auth-compatibility')
})

it('attempts Docker removal and every inventory even if process shutdown and down fail', async () => {
  const calls: string[] = []
  const actions: Array<[string, () => Promise<unknown>]> = [
    ['relay', async () => { calls.push('relay'); throw Error('close failed') }],
    ['portal', async () => { calls.push('portal'); throw Error('termination failed') }],
    ['docker', async () => { calls.push('docker'); throw Error('down failed') }],
    ...['containers', 'volumes', 'networks'].map(kind => [kind, async () => { calls.push(kind); return [] }] as [string, () => Promise<unknown>]),
  ]
  const result = await attemptCleanup(actions)
  expect(calls).toEqual(['relay', 'portal', 'docker', 'containers', 'volumes', 'networks'])
  expect(result.failures.map(f => f.name)).toEqual(['relay', 'portal', 'docker'])
  expect(result.results.networks).toEqual([])
})

it('redacts secrets split across process output chunks before any disk append', () => {
  const written: string[] = []
  const capture = lineRedactor(['synthetic-secret'], (value: string) => written.push(value))
  capture.data('prefix synthetic-')
  capture.data('secret\nlast cookie: a-private-cookie')
  capture.flush()
  expect(written.join('')).toBe('prefix [REDACTED]\nlast cookie: [REDACTED]')
})

it('the actual orchestrator rejects local invocation before a Docker transport can run', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity34-local-refusal-'))
  const marker = path.join(tmp, 'docker-called')
  fs.writeFileSync(path.join(tmp, 'docker'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 })
  try {
    expect(() => execFileSync(process.execPath, [path.resolve(__dirname, '../auth-compatibility/run.mjs')], {
      env: { PATH: `${tmp}:${process.env.PATH}`, RUNNER_TEMP: tmp, NODE_ENV: 'test' }, stdio: 'pipe', timeout: 10_000,
    })).toThrow()
    expect(fs.existsSync(marker)).toBe(false)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})


it('allows governed review metadata without admitting product or deployment-policy rewrites', () => {
  expect(() => assertProductDelta('deploy/runbooks/README.md', '---\nreview: old\n---\nmanual deployment', '---\nreview: new\n---\nmanual deployment')).not.toThrow()
  expect(() => assertProductDelta('deploy/runbooks/README.md', '---\nreview: old\n---\nmanual deployment', '---\nreview: new\n---\nautomatic deployment')).toThrow()
  expect(() => assertProductDelta('lib/auth/auth-config.ts', 'old', 'new')).toThrow()
})


it('admits only the exact reviewed runbook CI correction, never deployment config or another document', () => {
  const file = 'identity-portal/deploy/runbooks/README.md'
  const root = path.resolve(__dirname, '../../..')
  // The ordinary quality checkout is shallow; test data must not require ancestors.
  const fixtureSource = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/runbook-before-ci-proof.json'), 'utf8')
  expect(Buffer.byteLength(fixtureSource, 'utf8')).toBeLessThan(16 * 1024)
  const original = JSON.parse(fixtureSource) as { sourceCommit: string; sourcePath: string; content: string }
  expect(original.sourceCommit).toBe('d9b4827c961967fe16ef31c365025049c7ff8802')
  expect(original.sourcePath).toBe(file)
  const before = original.content
  const after = fs.readFileSync(path.join(root, file), 'utf8')
  expect(() => assertProductDelta(file, before, after)).not.toThrow()
  expect(() => assertProductDelta(file, before, `${after}\nAllow production deployment.`)).toThrow()
  expect(() => assertProductDelta('identity-portal/deploy/runbooks/deployment.md', before, after)).toThrow()
  expect(() => assertProductDelta('identity-portal/deploy/docker/docker-compose.prod.yml', before, after)).toThrow()
  expect(() => assertProductDelta(file, before.replace('Identity #26', 'Identity #99'), after)).toThrow()
})

it('admits the exact reviewed Node24 Dockerfile, rejects other image or build-policy changes', () => {
  const file = 'identity-portal/deploy/docker/Dockerfile'
  const original = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/dockerfile-before-node24.json'), 'utf8')) as { sourceCommit: string; sourcePath: string; content: string }
  expect(original.sourceCommit).toBe('104135f3aae4d39cebef13a9f12abfc53daed376')
  expect(original.sourcePath).toBe(file)
  const after = fs.readFileSync(path.resolve(__dirname, '../../../', file), 'utf8')
  expect(() => assertProductDelta(file, original.content, after)).not.toThrow()
  for (const changed of [after.replace('24.22.1-alpine', '25-alpine'), after.replace(' pnpm-workspace.yaml', ''), `${after}\nRUN echo unreviewed\n`]) {
    expect(() => assertProductDelta(file, original.content, changed)).toThrow()
  }
  expect(() => assertProductDelta(file, original.content.replace('22-alpine', '22-slim'), after)).toThrow()
  expect(() => assertProductDelta('identity-portal/deploy/docker/docker-compose.prod.yml', original.content, after)).toThrow()
})


it('preserves real Git blob newlines at the orchestrator extraction boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity41-git-blobs-'))
  const file = 'identity-portal/deploy/docker/Dockerfile'
  const before = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/dockerfile-before-node24.json'), 'utf8')).content as string
  const after = fs.readFileSync(path.resolve(__dirname, '../../../', file), 'utf8')
  const env = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', NODE_ENV: 'test' as const }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim()
  try {
    git('init', '--quiet')
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), before)
    const oldBlob = git('hash-object', '-w', file)
    // Git trees avoid requiring ancestor commits, hooks, or a user identity.
    git('update-index', '--add', '--cacheinfo', `100644,${oldBlob},${file}`)
    const oldRef = git('write-tree')
    fs.writeFileSync(path.join(root, file), after)
    git('add', '--', file)
    const newRef = git('write-tree')
    expect(() => assertProductDeltaFromGit(file, oldRef, newRef, { cwd: root, env })).not.toThrow()
    expect(() => assertProductDelta(file, before.trim(), after.trim())).toThrow('Unexpected original Dockerfile')
    fs.writeFileSync(path.join(root, file), after.trimEnd())
    git('add', '--', file)
    expect(() => assertProductDeltaFromGit(file, oldRef, git('write-tree'), { cwd: root, env })).toThrow('Only the exact reviewed Node24 Dockerfile')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

import { qualificationCase, assertQualificationSources, assertQualificationManifest, assertQualificationVersions, assertQualificationProductDelta, reactChangedPathPolicy } from '../auth-compatibility/qualification-case.mjs'
import { qualificationUiPlan, qualificationBrowserTimeout, combinedReactUi, assertFixedReactUiReceipts } from '../auth-compatibility/ui-plan.mjs'
import ts from 'typescript'

const fixedName = 'react19.3-catalog-fixed'
const fixedBase = 'b0c5baa1e9119563dc2a8c0720390dd1ce3a5890'
const broadReceipt = () => ({ passed: true, errors: { page: 0, console: 0 }, firstRenderHydration: true, clientNavigation: true, realFormAndReadback: true, radixFocusTrapAndRestore: true, monacoEditAndApply: true, localesAndThemes: true, syntheticDataOnly: true })
const catalogReceipt = () => ({ executed: true, passed: true, errors: { page: 0, console: 0 }, schemaWorker: true, keyboardApplyReadback: true, spaDisposalReopen: true, exactBufferRestored: true, syntheticDataOnly: true, yamlWorkers: 2, yamlWorkersClosed: 2, unrecognizedWorkers: 0, undoSteps: [5, 5] })

it('binds the new immutable fixed baseline without repointing any historical case', () => {
  expect(qualificationCase(fixedName).baseline).toBe(fixedBase)
  expect(qualificationCase('react19.3').baseline).toBe('64055a2cd05fa4056ea36fd9ab1b780a77e1690e')
  expect(qualificationCase('catalog-yaml').baseline).toBe('64055a2cd05fa4056ea36fd9ab1b780a77e1690e')
  expect(qualificationCase().baseline).toBe('d9b4827c961967fe16ef31c365025049c7ff8802')
  const head = 'a'.repeat(40)
  expect(() => assertQualificationSources(fixedName, { baseline: fixedBase, head, requestedHead: head, ancestor: true })).not.toThrow()
  for (const baseline of ['main', '64055a2cd05fa4056ea36fd9ab1b780a77e1690e']) expect(() => assertQualificationSources(fixedName, { baseline, head, requestedHead: head, ancestor: true })).toThrow()
  const before = { next: '16.4.2', react: '19.2.4', 'react-dom': '19.2.4', '@types/react': '19.2.17', '@types/react-dom': '19.2.3', jose: '6.2.12', '@keycloak/keycloak-admin-client': '26.8.1' }
  const after = { ...before, react: '19.3.1', 'react-dom': '19.3.1', '@types/react': '19.3.0', '@types/react-dom': '19.3.0' }
  expect(() => assertQualificationVersions(fixedName, 'baseline', before)).not.toThrow()
  expect(() => assertQualificationVersions(fixedName, 'candidate', after)).not.toThrow()
  for (const delta of [{ 'react-dom': '19.2.4' }, { react: '19.3.0' }, { '@types/react-dom': '19.2.3' }, { next: '16.4.3' }]) expect(() => assertQualificationVersions(fixedName, 'candidate', { ...after, ...delta })).toThrow()
})

it('requires both broad and Catalog suites in both fixed variants, never the known-defective skip', () => {
  for (const variant of ['baseline', 'candidate']) expect(qualificationUiPlan(fixedName, variant)).toEqual({ broad: true, catalog: true, knownDefectiveSkip: false })
  expect(qualificationUiPlan('catalog-yaml', 'baseline').knownDefectiveSkip).toBe(true)
  expect(qualificationUiPlan('react19.3', 'baseline').broad).toBe(true)
  const before = { ui: combinedReactUi(fixedName, 'baseline', broadReceipt(), catalogReceipt(), { page: 0, console: 0 }) }
  const after = { ui: combinedReactUi(fixedName, 'candidate', broadReceipt(), catalogReceipt(), { page: 0, console: 0 }) }
  expect(() => assertFixedReactUiReceipts(before, after)).not.toThrow()
  for (const variant of ['baseline', 'candidate']) {
    expect(() => combinedReactUi(fixedName, variant, undefined, catalogReceipt(), { page: 0, console: 0 })).toThrow()
    expect(() => combinedReactUi(fixedName, variant, broadReceipt(), undefined, { page: 0, console: 0 })).toThrow()
    expect(() => combinedReactUi(fixedName, variant, broadReceipt(), { ...catalogReceipt(), executed: false }, { page: 0, console: 0 })).toThrow()
    expect(() => combinedReactUi(fixedName, variant, { ...broadReceipt(), radixFocusTrapAndRestore: false }, catalogReceipt(), { page: 0, console: 0 })).toThrow()
    expect(() => combinedReactUi(fixedName, variant, broadReceipt(), { ...catalogReceipt(), yamlWorkersClosed: 1 }, { page: 0, console: 0 })).toThrow()
    expect(() => combinedReactUi(fixedName, variant, broadReceipt(), catalogReceipt(), { page: 1, console: 0 })).toThrow()
  }
  expect(() => assertFixedReactUiReceipts({ ui: { executed: false, passed: false } }, after)).toThrow()
  expect(() => assertFixedReactUiReceipts(before, { ui: { ...after.ui, broad: undefined } })).toThrow()
})

it('rejects the actual silent-merge duplicate YAML selector and selects exactly the fixed case', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/auth-compatibility.yml'), 'utf8')
  const key = 'AUTH_PROOF_CASE: react19.3-catalog-fixed'
  expect(source.split(key).length - 1).toBe(1)
  expect(() => load(source.replace(key, key + '\n          AUTH_PROOF_CASE: catalog-yaml'))).toThrow(/duplicat/i)
})

it('executes the actual Playwright timeout routing without changing historical auth/catalog budgets', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/playwright.config.ts'), 'utf8')
  const body = source.replace(/^import .*\n/gm, '').replace('export default', 'return')
  for (const [name, timeout] of [['auth-client', 90_000], ['catalog-yaml', 90_000], ['react19.3', 150_000], [fixedName, 150_000]] as const) {
    expect(qualificationBrowserTimeout(name)).toBe(timeout)
    const config = new Function('fixture', 'defineConfig', 'devices', 'qualificationBrowserTimeout', '__dirname', body)(() => ({ qualificationCase: name, directory: '/inert', portalOrigin: 'http://localhost:21002' }), (value: unknown) => value, { 'Desktop Chrome': {} }, qualificationBrowserTimeout, '/inert')
    expect(config.timeout).toBe(timeout)
    expect(config.retries).toBe(0)
    expect(config.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
  }
})

it('executes actual browser orchestration for both variants with distinct awaited suite receipts', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/browser.proof.spec.ts'), 'utf8')
  const start = source.indexOf('    if (ui) {'); const end = source.indexOf('\n    await admin.logoutUserSessions', start)
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start)
  for (const variant of ['baseline', 'candidate']) {
    const files = new Map<string, string>(); const events: string[] = []; let combined: unknown
    const c = { ...fixture(), qualificationCase: fixedName, variant, browserAssets: ['owned.js'], evidenceDirectory: '/inert' }
    const dependencies = { c, ui: true, plan: qualificationUiPlan(fixedName, variant), page: { off: () => events.push('listener-detach') }, errors: { page: 0, console: 0 }, diagnostics: {}, expect, pageError: () => {}, consoleError: () => {}, path,
      qualifyStandaloneUi: async (_page: unknown, _errors: unknown, _diagnostics: unknown, name: string) => { await Promise.resolve(); expect(name).toBe('ui-broad.json'); events.push('broad'); files.set('/inert/'+name, JSON.stringify(broadReceipt())) },
      qualifyCatalogUi: async (_page: unknown, _errors: unknown, _diagnostics: unknown, name: string) => { await Promise.resolve(); expect(name).toBe('ui-catalog.json'); events.push('catalog'); files.set('/inert/'+name, JSON.stringify(catalogReceipt())) },
      readFileSync: (name: string) => { expect(files.has(name)).toBe(true); return files.get(name) }, combinedReactUi,
      receipt: (name: string, value: unknown) => { expect(name).toBe('ui.json'); combined = value },
    }
    const emitted = ts.transpileModule(`async function invokeUi(){${source.slice(start,end)}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
    await new Function(...Object.keys(dependencies), `${emitted};return invokeUi()`)(...Object.values(dependencies))
    expect(events.slice(0,2)).toEqual(['broad','catalog'])
    expect(combined).toMatchObject({ qualificationCase: fixedName, variant, executed: true, passed: true })
  }
})

it('executes actual Catalog semantic navigation and awaits each route before the next click', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/catalog-ui.ts'), 'utf8')
  const start = source.indexOf("    diagnostics.setStage('navigation')")
  const end = source.indexOf('    const snapshot = ', start)
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start)
  const body = source.slice(start, end)
  const invoke = async (code: string) => {
    let route = '/admin/apps/registry'; let pending = ''; let sentinel = false
    const events: string[] = []
    const links = [
      { name: 'Overview', href: '/admin' }, { name: 'Applications', href: '/admin/apps' },
      { name: 'Application list', href: '/admin/apps' }, { name: 'Registry', href: '/admin/apps/registry' },
    ]
    const locator = (matches: typeof links) => ({ matches, click: async () => {
      expect(matches).toHaveLength(1)
      expect(pending).toBe('')
      pending = matches[0].href; events.push(`click:${matches[0].name}`)
    } })
    const page = {
      evaluate: async () => { sentinel = true },
      locator: (selector: string) => locator(links.filter(link => selector === `a[href="${link.href}"]`)),
      getByRole: (role: string) => {
        expect(role).toBe('navigation')
        return { getByRole: (kind: string, options: { name: string; exact: boolean }) => {
          expect(kind).toBe('link'); expect(options.exact).toBe(true)
          return locator(links.filter(link => link.name === options.name))
        } }
      },
    }
    const assertions = (subject: unknown) => ({
      toHaveCount: async (count: number) => expect((subject as ReturnType<typeof locator>).matches).toHaveLength(count),
      toHaveURL: async (url: string) => {
        expect(subject).toBe(page)
        expect(pending).toBe(new URL(url).pathname)
        route = pending; pending = ''; events.push(`url:${route}`)
      },
    })
    await new Function('page', 'expect', 'c', 'diagnostics', `return (async()=>{${code}})()`)(page, assertions, { portalOrigin: 'http://localhost:21002' }, { setStage: () => {} })
    expect(sentinel).toBe(true)
    return { route, events }
  }
  expect(await invoke(body)).toEqual({ route: '/admin/apps/registry', events: ['click:Overview', 'url:/admin', 'click:Applications', 'url:/admin/apps', 'click:Registry', 'url:/admin/apps/registry'] })
  await expect(invoke(body.replace(/    await expect\(page\)\.toHaveURL\(`\$\{c.portalOrigin\}\/admin`\)\n/, ''))).rejects.toThrow()
  await expect(invoke(body.replace("page.getByRole('navigation').getByRole('link', { name: 'Applications', exact: true })", "page.locator('a[href=\"/admin/apps\"]')"))).rejects.toThrow()
})

it('executes actual broad-only and Catalog asset selection, persisting each actual source binding', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/run.mjs'), 'utf8')
  const start = source.indexOf('      const uiPlan = qualificationUiPlan(')
  const end = source.indexOf('\n      stopPortal = ', start)
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start)
  for (const name of ['react19.3', fixedName, 'catalog-yaml', 'auth-client']) for (const variant of ['baseline', 'candidate']) {
    const files = new Map<string, string>()
    const c: { evidenceDirectory: string; browserAssets?: string[]; yamlWorker?: unknown } = { evidenceDirectory: '/inert' }
    let descriptors = 0
    const deps = { selectedCase: qualificationCase(name), variant, BASELINE: qualificationCase(name).baseline, head: 'a'.repeat(40), c, assert: nodeAssert, Buffer, path, app: '/inert/app', configFile: '/inert/config.json', qualificationUiPlan,
      emittedBrowserAssetPaths: () => ['/owned.js'], emittedYamlWorker: () => { descriptors++; return { bootstrap: '/owned-worker.js', chunks: [], digests: {} } },
      fs: { writeFileSync: (file: string, data: string) => files.set(file, data) } }
    new Function(...Object.keys(deps), source.slice(start,end))(...Object.values(deps))
    const hasAssets = name === 'react19.3' || name === fixedName || name === 'catalog-yaml' && variant === 'candidate'
    const hasDescriptor = name === fixedName || name === 'catalog-yaml' && variant === 'candidate'
    expect(c.browserAssets).toEqual(hasAssets ? ['/owned.js'] : undefined)
    expect(files.has('/inert/config.json')).toBe(hasAssets)
    expect(descriptors).toBe(hasDescriptor ? 1 : 0)
    expect(files.has('/inert/yaml-worker-assets.json')).toBe(hasDescriptor)
    if (hasDescriptor) expect(JSON.parse(files.get('/inert/yaml-worker-assets.json')!)).toMatchObject({ qualificationCase: name, source: variant === 'baseline' ? qualificationCase(name).baseline : 'a'.repeat(40) })
    if (name === 'react19.3') expect(JSON.parse(files.get('/inert/config.json')!).browserAssets.length).toBeGreaterThan(0)
  }
})

describe('independent source-bound React qualification', () => {
  const baselineFixture = (name: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../auth-compatibility/fixtures/manifest-${name}.json`), 'utf8')) as { sourceCommit: string; sourcePath: string; content: string }
  const manifest = (name: string) => {
    const original = baselineFixture(name)
    const candidate = JSON.parse(original.content)
    if (name === 'auth-client') {
      candidate.dependencies['@keycloak/keycloak-admin-client'] = '^26.8.1'
      candidate.dependencies.jose = '^6.2.12'
      candidate.devDependencies['@types/node'] = '^24.19.2'
      candidate.engines = { node: '>=24.22.1 <25' }
    } else {
      candidate.dependencies.react = candidate.dependencies['react-dom'] = '19.3.1'
    }
    return { original, candidate }
  }
  const versions = (react = '19.3.1') => ({ next: '16.4.2', react, 'react-dom': react, '@types/react': '19.3.0', '@types/react-dom': '19.3.0', jose: '6.2.12', '@keycloak/keycloak-admin-client': '26.8.1' })

  it('retains the historical auth case and admits only each case exact manifest delta', () => {
    expect(qualificationCase().name).toBe('auth-client')
    expect(() => qualificationCase('unknown')).toThrow()
    for (const name of ['auth-client', 'react19.3']) {
      const { original, candidate } = manifest(name)
      expect(original.sourceCommit).toBe(qualificationCase(name).baseline)
      expect(original.sourcePath).toBe('identity-portal/package.json')
      expect(() => assertQualificationManifest(name, original.content, candidate)).not.toThrow()
      expect(() => assertQualificationManifest(name, `${original.content} `, candidate)).toThrow()
      for (const mutation of [
        (m: typeof candidate) => { m.version = '0.2.0' },
        (m: typeof candidate) => { m.dependencies.next = '16.4.3' },
        (m: typeof candidate) => { m.devDependencies['@types/node'] = '^25.0.0' },
        (m: typeof candidate) => { m.dependencies.react = '19.3.0' },
        (m: typeof candidate) => { m.dependencies['react-dom'] = name === 'auth-client' ? '19.3.1' : '19.2.4' },
      ]) {
        const changed = structuredClone(candidate); mutation(changed)
        expect(() => assertQualificationManifest(name, original.content, changed)).toThrow()
      }
    }
    const historical = manifest('auth-client')
    historical.candidate.dependencies.react = historical.candidate.dependencies['react-dom'] = '19.3.1'
    expect(() => assertQualificationManifest('auth-client', historical.original.content, historical.candidate)).toThrow()
  })

  it('rejects substituted baseline, candidate, self-comparison and unrelated history', () => {
    const baseline = qualificationCase('react19.3').baseline
    const input = { baseline, head: 'a'.repeat(40), requestedHead: 'a'.repeat(40), ancestor: true }
    expect(() => assertQualificationSources('react19.3', input)).not.toThrow()
    for (const changed of [{ baseline: qualificationCase('auth-client').baseline }, { requestedHead: 'b'.repeat(40) }, { head: baseline, requestedHead: baseline }, { ancestor: false }]) {
      expect(() => assertQualificationSources('react19.3', { ...input, ...changed })).toThrow()
    }
  })

  it('enforces old and new renderer/type pairs and unchanged accepted auth/framework versions', () => {
    expect(() => assertQualificationVersions('react19.3', 'candidate', versions())).not.toThrow()
    const old = { ...versions('19.2.4'), '@types/react': '19.2.17', '@types/react-dom': '19.2.3' }
    expect(() => assertQualificationVersions('react19.3', 'baseline', old)).not.toThrow()
    expect(() => assertQualificationVersions('auth-client', 'candidate', old)).not.toThrow()
    expect(() => assertQualificationVersions('auth-client', 'baseline', { ...old, jose: '6.2.3', '@keycloak/keycloak-admin-client': '26.6.4' })).not.toThrow()
    expect(() => assertQualificationVersions('auth-client', 'candidate', versions())).toThrow()
    expect(() => assertQualificationVersions('react19.3', 'baseline', versions())).toThrow()
    for (const changed of [{ 'react-dom': '19.2.4' }, { react: '19.3.0', 'react-dom': '19.3.0' }, { '@types/react': '19.2.17' }, { next: '16.4.3' }, { jose: '6.2.3' }]) {
      expect(() => assertQualificationVersions('react19.3', 'candidate', { ...versions(), ...changed })).toThrow()
    }
  })

  it('refuses executable, image and documentation behavior drift in the React experiment', () => {
    for (const file of ['identity-portal/lib/auth/auth-config.ts', 'identity-portal/deploy/docker/Dockerfile', 'identity-portal/deploy/runbooks/README.md']) {
      expect(() => assertQualificationProductDelta('react19.3', file, 'old', 'new')).toThrow()
    }
    expect(() => assertQualificationProductDelta('react19.3', 'identity-portal/deploy/runbooks/README.md', '---\nlastReviewedAt: old\n---\nmanual deployment', '---\nlastReviewedAt: new\n---\nmanual deployment')).not.toThrow()
  })
})

// The inert executable doubles use POSIX shebangs; hosted execution is Linux.
const sourceWiringIt = process.platform === 'win32' ? it.skip : it
sourceWiringIt.each(['react19.3', 'react19.3-catalog-fixed'])('actual validate-only entrypoint rejects unrelated configuration and real Git product renames without Docker: %s', (caseName) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity44-source-wiring-'))
  try {
  const selected = qualificationCase(caseName)
  const head = 'a'.repeat(40)
  const original = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/manifest-react19.3.json'), 'utf8')).content as string
  const candidate = JSON.parse(original)
  candidate.dependencies.react = candidate.dependencies['react-dom'] = '19.3.1'
  const file = 'docs/README.md'
  const calls = path.join(tmp, 'git-calls.jsonl')
  const state = path.join(tmp, 'state.json')
  const marker = path.join(tmp, 'docker-called')
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  const renameRoot = path.join(tmp, 'real-rename-repo')
  fs.mkdirSync(renameRoot)
  const realEnv = { PATH: process.env.PATH, HOME: tmp, GIT_CONFIG_NOSYSTEM: '1', NODE_ENV: 'test' as const }
  const git = (...args: string[]) => execFileSync(realGit, args, { cwd: renameRoot, env: realEnv, encoding: 'utf8' })
  git('init', '--quiet')
  git('config', 'diff.renames', 'true')
  const source = 'identity-portal/lib/qualification-product.ts'
  const destination = 'identity-portal/tests/auth-compatibility/renamed-product.ts'
  fs.mkdirSync(path.dirname(path.join(renameRoot, source)), { recursive: true })
  fs.mkdirSync(path.dirname(path.join(renameRoot, destination)), { recursive: true })
  fs.writeFileSync(path.join(renameRoot, source), 'export const unchangedProduct = true\n')
  git('add', '--', source)
  const renameBefore = git('write-tree').trim()
  fs.renameSync(path.join(renameRoot, source), path.join(renameRoot, destination))
  git('add', '--all')
  const renameAfter = git('write-tree').trim()
  expect(git('diff', '--name-status', renameBefore, renameAfter).trim()).toBe(`R100\t${source}\t${destination}`)
  expect(git('diff', '--name-only', '-z', renameBefore, renameAfter).split('\0').filter(Boolean)).toEqual([destination])
  expect(git('diff', '--name-only', '--no-renames', '-z', renameBefore, renameAfter).split('\0').filter(Boolean).sort()).toEqual([source, destination].sort())
  expect(reactChangedPathPolicy(destination)).toBe('qualification-support')
  expect(() => reactChangedPathPolicy(source)).toThrow('Unreviewed React qualification path')
  const gitDouble = `#!${process.execPath}
const fs = require('node:fs'); const raw = process.argv.slice(2); const args = raw[0] === '-C' ? raw.slice(2) : raw;
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const drift = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'));
const baseline = ${JSON.stringify(selected.baseline)}; const head = ${JSON.stringify(head)}; const file = ${JSON.stringify(file)};
const fail = () => process.exit(3);
if (args.join(' ') === 'rev-parse HEAD') console.log(head);
else if (args.join(' ') === 'merge-base ' + baseline + ' ' + head) console.log(baseline);
else if (args.join(' ') === 'status --porcelain') {}
else if (args[0] === 'diff' && args[1] === '--name-only' && args.at(-2) === baseline && args.at(-1) === head) {
  if (drift.TEST_REAL_RENAME) {
    const flags = args.slice(1, -2).filter(flag => !drift.TEST_OLD_RENAME_DETECTION || flag !== '--no-renames');
    const result = require('node:child_process').execFileSync(${JSON.stringify(realGit)}, ['-C', ${JSON.stringify(renameRoot)}, 'diff', ...flags, ${JSON.stringify(renameBefore)}, ${JSON.stringify(renameAfter)}]);
    process.stdout.write(result);
    process.exit(0);
  }
  const changed = drift.TEST_CHANGED_PATH || (drift.TEST_PRODUCT_DRIFT ? 'identity-portal/lib/auth/auth-config.ts' : file);
  process.stdout.write(['identity-portal/package.json', 'identity-portal/tests/auth-compatibility/qualification-case.mjs', changed].join(String.fromCharCode(0)) + String.fromCharCode(0));
}
else if (args[0] === 'show') {
  const source = args[1];
  if (source === baseline + ':identity-portal/package.json') process.stdout.write(${JSON.stringify(original)});
  else if (source === head + ':identity-portal/package.json') {
    const candidate = ${JSON.stringify(candidate)};
    if (drift.TEST_MANIFEST_DRIFT) candidate.version = '0.2.0';
    console.log(JSON.stringify(candidate));
  } else if (source === baseline + ':' + file) process.stdout.write('accepted\\n');
  else if (source === head + ':' + file) process.stdout.write(drift.TEST_DOCS_BODY_DRIFT ? 'mutated\\n' : 'accepted\\n');
  else fail();
} else fail();
`
  fs.writeFileSync(path.join(tmp, 'git'), gitDouble, { mode: 0o700 })
  fs.writeFileSync(path.join(tmp, 'docker'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 })
  // Verify the owned inert executable before relying on its no-call marker.
  execFileSync(path.join(tmp, 'docker'))
  expect(fs.existsSync(marker)).toBe(true)
  fs.unlinkSync(marker)
  const env = { NODE_ENV: 'test' as const, PATH: `${tmp}:${process.env.PATH}`, AUTH_PROOF_CASE: caseName, AUTH_PROOF_HEAD: head }
  const run = (changed = {}) => {
    fs.writeFileSync(state, JSON.stringify(changed))
    return execFileSync(process.execPath, [path.resolve(__dirname, '../auth-compatibility/run.mjs'), '--validate-sources'], { env: { ...env, ...changed }, encoding: 'utf8', stdio: 'pipe' })
  }
    expect(JSON.parse(run())).toEqual({ validationOnly: true, qualificationCase: caseName, baseline: selected.baseline, head, dockerAccessed: false })
    expect(JSON.parse(run({ TEST_CHANGED_PATH: 'identity-portal/tests/unit/catalog-qualification.test.ts' }))).toMatchObject({ validationOnly: true, dockerAccessed: false })
    expect(() => run({ TEST_CHANGED_PATH: 'identity-portal/tests/unit/catalog-qualification-unreviewed.test.ts' })).toThrow('Unreviewed React qualification path')
    const invoked = fs.readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[])
    expect(invoked).toContainEqual(['show', `${selected.baseline}:${file}`])
    expect(invoked).toContainEqual(['show', `${head}:${file}`])
    expect(invoked).toContainEqual(['diff', '--name-only', '--no-renames', '-z', selected.baseline, head])
    for (const changed of [{ TEST_PRODUCT_DRIFT: '1' }, { TEST_MANIFEST_DRIFT: '1' }, { TEST_DOCS_BODY_DRIFT: '1' }, { TEST_CHANGED_PATH: 'identity-portal/config/business-apps.yaml' }, { TEST_CHANGED_PATH: 'identity-portal/drizzle.config.ts' }, { TEST_CHANGED_PATH: 'identity-portal/new-product-surface/runtime.ts' }, { AUTH_PROOF_HEAD: 'b'.repeat(40) }, { AUTH_PROOF_CASE: 'auth-client' }]) expect(() => run(changed)).toThrow()
    // Exposure control: Git's old rename projection hides the product source and passes.
    expect(JSON.parse(run({ TEST_REAL_RENAME: '1', TEST_OLD_RENAME_DETECTION: '1' }))).toMatchObject({ validationOnly: true, dockerAccessed: false })
    // The actual entrypoint must forward --no-renames to real Git and reject the deletion.
    expect(() => run({ TEST_REAL_RENAME: '1' })).toThrow('Unreviewed React qualification path')
    expect(fs.existsSync(marker)).toBe(false)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

it('classifies the entire React changed tree with explicit allowances and review metadata only', () => {
  for (const file of ['identity-portal/config/business-apps.yaml', 'identity-portal/drizzle.config.ts', 'identity-portal/new-product-surface/runtime.ts', '.github/workflows/ci.yml', 'docs/unreviewed-policy.md']) {
    expect(() => reactChangedPathPolicy(file)).toThrow('Unreviewed React qualification path')
  }
  expect(reactChangedPathPolicy('identity-portal/package.json')).toBe('manifest')
  expect(reactChangedPathPolicy('identity-portal/pnpm-lock.yaml')).toBe('lock')
  expect(reactChangedPathPolicy('identity-portal/tests/auth-compatibility/new-control.ts')).toBe('qualification-support')
  expect(reactChangedPathPolicy('identity-portal/tests/unit/catalog-qualification.test.ts')).toBe('qualification-support')
  expect(() => reactChangedPathPolicy('identity-portal/tests/unit/catalog-qualification-unreviewed.test.ts')).toThrow('Unreviewed React qualification path')
  expect(reactChangedPathPolicy('docs/guides/dependency-maintenance.md')).toBe('qualification-doc')
  expect(reactChangedPathPolicy('.docpact/config.yaml')).toBe('review-metadata')
  expect(() => assertQualificationProductDelta('react19.3', '.docpact/config.yaml', 'lastReviewedAt: old\nrules: strict\n', 'lastReviewedAt: new\nrules: strict\n')).not.toThrow()
  expect(() => assertQualificationProductDelta('react19.3', '.docpact/config.yaml', 'lastReviewedAt: old\nrules: strict\n', 'lastReviewedAt: new\nrules: relaxed\n')).toThrow()
  const before = '---\nlastReviewedAt: old\nauthoritative: true\n---\npolicy unchanged\n'
  const metadata = '---\nlastReviewedAt: new\nauthoritative: true\n---\npolicy unchanged\n'
  expect(() => assertQualificationProductDelta('react19.3', 'GOAL.md', before, metadata)).not.toThrow()
  expect(() => assertQualificationProductDelta('react19.3', 'GOAL.md', before, metadata.replace('authoritative: true', 'authoritative: false'))).toThrow()
  expect(() => assertQualificationProductDelta('react19.3', 'GOAL.md', before, metadata.replace('policy unchanged', 'policy relaxed'))).toThrow()
})

import { createBrowserDiagnostics, type BrowserStage } from '../auth-compatibility/browser-diagnostics'
import { emittedBrowserAssetPaths } from '../auth-compatibility/browser-assets.mjs'

const diagnosticOrigin = 'http://localhost:21002'
const diagnosticAsset = '/_next/static/chunks/owned.js'
const diagnosticContext = () => ({ portalOrigin: diagnosticOrigin, builtAssetPaths: [diagnosticAsset], secrets: ['known-short-private', 'p@ss word/x', 'opaque-fixture-password-XYZ987654321'] })

it('binds diagnostic frame inventory to emitted owned JS files without following links or maps', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity44-browser-assets-'))
  try {
    fs.mkdirSync(path.join(root, '.next/static/chunks'), { recursive: true })
    fs.mkdirSync(path.join(root, '.next/static/media'), { recursive: true })
    fs.writeFileSync(path.join(root, '.next/static/chunks/owned.js'), 'export const owned = true\n')
    fs.writeFileSync(path.join(root, '.next/static/media/yaml.worker.js'), 'export const worker = true\n')
    fs.writeFileSync(path.join(root, '.next/static/chunks/owned.js.map'), 'private source map')
    fs.writeFileSync(path.join(root, 'outside.js'), 'not an emitted asset')
    if (process.platform !== 'win32') fs.symlinkSync(path.join(root, 'outside.js'), path.join(root, '.next/static/chunks/linked.js'))
    expect(emittedBrowserAssetPaths(root)).toEqual([diagnosticAsset, '/_next/static/media/yaml.worker.js'])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

it('retains only a known error category and exact emitted asset location with a safe fingerprint', () => {
  const diagnostics = createBrowserDiagnostics(diagnosticContext())
  diagnostics.setStage('monaco-load')
  diagnostics.record({ name: 'Error', message: 'Unexpected usage', stack: `Error: Unexpected usage\n    at confidentialFunction (${diagnosticOrigin}${diagnosticAsset}:7:12)` })
  const sample = diagnostics.snapshot().samples[0]
  expect(sample).toMatchObject({ observedDuring: 'monaco-load', name: 'Error', category: 'unexpected-usage', frames: [{ asset: diagnosticAsset, line: 7, column: 12 }] })
  expect(sample.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(sample)).not.toMatch(/confidentialFunction|https?:|Unexpected usage|message|stack/)
})

it('discards secret-bearing prose, names, URLs and forged frames without secret-derived fingerprints', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature-private'
  const jwe = 'eyJhbGciOiJkaXIifQ.encryptedkey.privateiv.privateciphertext.privatetag'
  const privateValues = ['known-short-private', 'p@ss word/x', encodeURIComponent('p@ss word/x'), 'xyz', 'private@example.test', 'opaque-token-XYZ654321ABC987654321', jwt, jwe, 'callback-secret', 'fragment-secret', 'username-private', 'password-private', 'privateFunction']
  const make = (marker: string) => {
    const diagnostics = createBrowserDiagnostics(diagnosticContext())
    diagnostics.setStage('monaco-load')
    diagnostics.record({ name: `PrivateError-${marker}`, message: `${marker} ${privateValues.join(' ')}\nAuthorization: Bearer ${jwt}\nCookie: ${jwe}`,
      stack: [
        `Error: ${marker}`,
        `    at privateFunction (https://external.test${diagnosticAsset}:1:2)`,
        `    at privateFunction (${diagnosticOrigin}${diagnosticAsset}?code=callback-secret:1:2)`,
        `    at privateFunction (${diagnosticOrigin}${diagnosticAsset}#fragment-secret:1:2)`,
        `    at privateFunction (http://username-private:password-private@localhost:21002${diagnosticAsset}:1:2)`,
        `    at privateFunction (${diagnosticOrigin}/_next/static/chunks/forged-private.js:1:2)`,
        `    at privateFunction (blob:${diagnosticOrigin}${diagnosticAsset}:1:2)`,
        `    at privateFunction (file://${diagnosticAsset}:1:2)`,
        `    at privateFunction (data:text/javascript,opaque-token-XYZ654321ABC987654321:1:2)`,
        `    at eval (eval at privateFunction (${diagnosticOrigin}${diagnosticAsset}:1:2))`,
      ].join('\n') })
    return diagnostics.snapshot().samples[0]
  }
  const first = make('first-private-marker')
  const second = make('second-private-marker')
  expect(first).toEqual(second)
  expect(first).toMatchObject({ observedDuring: 'monaco-load', name: 'OtherError', category: 'unclassified', frames: [] })
  const serialized = JSON.stringify(first)
  for (const secret of [...privateValues, 'first-private-marker', 'second-private-marker', 'external.test', 'forged-private', 'PrivateError']) expect(serialized).not.toContain(secret)
})

it('keeps full error totals and safe failure fallback while bounding records, bytes and frame coordinates', () => {
  const diagnostics = createBrowserDiagnostics(diagnosticContext())
  const broken = Object.defineProperty({}, 'message', { get() { throw Error('never retain this private error') } })
  expect(() => diagnostics.record(broken)).not.toThrow()
  for (let index = 0; index < 100; index++) diagnostics.record({ name: 'Error', message: 'Unexpected usage', stack: `    at privateFunction (${diagnosticOrigin}${diagnosticAsset}:7:12)` })
  const snapshot = diagnostics.snapshot()
  expect(snapshot.totalObserved).toBe(101)
  expect(snapshot.projectionFailures).toBe(1)
  expect(snapshot.samples).toHaveLength(8)
  expect(snapshot.droppedSamples).toBe(93)
  expect(snapshot.samples[0]).toMatchObject({ name: 'OtherError', category: 'projection-failed', frames: [], fingerprint: 'unavailable' })
  expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThanOrEqual(8192)
  expect(JSON.stringify(snapshot)).not.toContain('never retain')
  const invalid = createBrowserDiagnostics(diagnosticContext())
  invalid.setStage('private-stage-value' as BrowserStage)
  invalid.record({ name: 'custom-private-name', message: 'private', stack: `    at privateFunction (${diagnosticOrigin}${diagnosticAsset}:0:1)\n    at privateFunction (${diagnosticOrigin}${diagnosticAsset}:1:10000001)` })
  expect(invalid.snapshot().samples[0]).toMatchObject({ observedDuring: 'unknown', name: 'OtherError', frames: [] })
})

it('allows only fixed React diagnostic codes and scrubs fixture secrets before classification', () => {
  const diagnostics = createBrowserDiagnostics(diagnosticContext())
  diagnostics.record({ name: 'Error', message: 'Minified React error #418; visit https://react.dev/errors/418?code=callback-secret', stack: '' })
  diagnostics.record({ name: 'Error', message: 'Minified React error #99999; private opaque value', stack: '' })
  expect(diagnostics.snapshot().samples[0]).toMatchObject({ category: 'react-minified', reactCode: 418 })
  expect(diagnostics.snapshot().samples[1]).not.toHaveProperty('reactCode')
  const secretCode = createBrowserDiagnostics({ ...diagnosticContext(), secrets: ['418', 'Error'] })
  secretCode.record({ name: 'Error', message: 'Minified React error #418; private', stack: '' })
  expect(secretCode.snapshot().samples[0]).toMatchObject({ name: 'OtherError', category: 'unclassified' })
})

it('enforces the total diagnostic byte budget before the sample cap for large trusted frames', () => {
  const assets = Array.from({ length: 4 }, (_, index) => `/_next/static/chunks/${'a'.repeat(200)}${index}.js`)
  const diagnostics = createBrowserDiagnostics({ ...diagnosticContext(), builtAssetPaths: assets })
  diagnostics.setStage('monaco-edit-apply')
  const stack = assets.map(asset => `    at ignoredPrivateFunction (${diagnosticOrigin}${asset}:9999999:9999999)`).join('\n')
  for (let index = 0; index < 1000; index++) diagnostics.record({ name: 'TypeError', message: 'unknown private payload', stack })
  const snapshot = diagnostics.snapshot()
  expect(snapshot.totalObserved).toBe(1000)
  expect(snapshot.samples.length).toBeLessThan(8)
  expect(snapshot.droppedSamples).toBe(1000 - snapshot.samples.length)
  expect(snapshot.samples.every(sample => sample.frames.length === 3)).toBe(true)
  expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThanOrEqual(8192)
  expect(JSON.stringify(snapshot)).not.toMatch(/ignoredPrivateFunction|unknown private payload|https?:/)
})

import { badReadinessDocument, observeBadKeycloakHealth, classifyBadReadinessRejection, ownedKeycloakId, ownedHealthProjection, assertBadReadinessResult, requireExpectedBadReadinessError, OWNED_HEALTH_FORMAT, READINESS_CONTROL_WAIT_SECONDS } from '../auth-compatibility/readiness-control.mjs'

it('makes only the bad health probe fail well before the unchanged readiness deadline', () => {
  const images = Object.fromEntries(Object.entries(IMAGE_TAGS).map(([name, tag]) => [name, `${tag}@sha256:${'a'.repeat(64)}`]))
  const normal = composeDocument(fixture(), images, '/owned/theme')
  const original = structuredClone(normal)
  const bad = badReadinessDocument(fixture(), images, '/owned/theme')
  const seconds = (value: string) => Number(/^([0-9]+)s$/.exec(value)![1])
  const probe = bad.services.keycloak.healthcheck
  const budget = seconds(probe.start_period) + probe.retries * (seconds(probe.interval) + seconds(probe.timeout))
  expect(READINESS_CONTROL_WAIT_SECONDS).toBe(20)
  expect(probe.test).toEqual(['CMD-SHELL', 'exit 1'])
  expect(probe.start_period).toBe('0s')
  expect(budget).toBeLessThan(READINESS_CONTROL_WAIT_SECONDS / 2)
  const prior = normal.services.keycloak.healthcheck
  expect(prior.retries * (seconds(prior.interval) + seconds(prior.timeout))).toBeGreaterThan(READINESS_CONTROL_WAIT_SECONDS)
  const expected = structuredClone(normal)
  expected.services.keycloak.healthcheck = probe
  expect(bad).toEqual(expected)
  expect(normal).toEqual(original)
})

it('selects a full owned Keycloak identity before inspecting only safe engine health enums', async () => {
  const c = fixture(); const id = 'a'.repeat(64)
  const calls: string[][] = []
  const health = await observeBadKeycloakHealth(c, async (args: string[]) => {
    calls.push(args)
    if (args[0] === 'ps') return id
    if (args[0] === 'inspect') return `${id} running unhealthy`
    throw Error('Unexpected Docker command')
  })
  expect(calls).toEqual([
    ['ps', '-a', '-q', '--no-trunc', '--filter', `label=com.docker.compose.project=${c.project}`, '--filter', 'label=com.docker.compose.service=keycloak'],
    ['inspect', '--type', 'container', '--format', OWNED_HEALTH_FORMAT, id],
  ])
  expect(OWNED_HEALTH_FORMAT).not.toMatch(/Env|Config|Log|Command|json/)
  expect(health).toEqual({ project: c.project, service: 'keycloak', containerId: id, status: 'running', health: 'unhealthy' })
  expect(JSON.stringify(health)).not.toMatch(/password|secret|log|Env/)
})

it('rejects absent, abbreviated, multiple, mismatched and unknown health projections without echoing them', async () => {
  const id = 'a'.repeat(64); const c = fixture()
  for (const text of ['', 'a'.repeat(12), `${id}\n${'b'.repeat(64)}`, 'private-credential-value']) expect(() => ownedKeycloakId(text)).toThrow('Expected exactly one full owned Keycloak container identity')
  for (const text of ['', `${id} running unknown-private`, `${'b'.repeat(64)} running unhealthy`, `${id} running unhealthy extra-private`, `${id} unknown-private unhealthy`]) {
    try { ownedHealthProjection(c.project, id, text); throw Error('Unexpected accepted projection') } catch (error) {
      expect((error as Error).message).toBe('Invalid owned health projection')
      expect((error as Error).message).not.toContain('private')
    }
  }
  let inspected = false
  await expect(observeBadKeycloakHealth(c, async (args: string[]) => {
    if (args[0] === 'inspect') inspected = true
    return ''
  })).rejects.toThrow('Expected exactly one full owned Keycloak container identity')
  expect(inspected).toBe(false)
})

it('requires observed owned unhealthy state, nonzero exit, health receipt and cleanup without hiding cancellation or unrelated errors', () => {
  const project = fixture().project; const containerId = 'a'.repeat(64)
  const health = { project, service: 'keycloak', containerId, status: 'running', health: 'unhealthy' }
  const good = { project, exitCode: 1, startupRejection: 'owned-keycloak-unhealthy', health, healthRecorded: true, cleaned: true, cancelled: false }
  expect(() => assertBadReadinessResult(good)).not.toThrow()
  for (const changed of [
    { exitCode: 0 }, { startupRejection: 'unclassified' }, { startupRejection: undefined }, { exitCode: undefined }, { exitCode: null }, { exitCode: '1' }, { exitCode: 256 },
    { health: undefined }, { healthRecorded: false }, { cleaned: false }, { cancelled: true },
    { health: { ...health, health: 'healthy' } }, { health: { ...health, health: 'starting' } },
    { health: { ...health, health: 'none' } }, { health: { ...health, status: 'exited' } },
    { health: { ...health, project: 'foreign' } }, { health: { ...health, containerId: 'short' } },
    { exitCode: 125, health: undefined },
  ]) expect(() => assertBadReadinessResult({ ...good, ...changed })).toThrow()
  const startup = Error('Expected controlled startup rejection')
  expect(() => requireExpectedBadReadinessError(startup, startup, good)).not.toThrow()
  const receiptFailure = Error('Health receipt write failed')
  let retained: unknown
  try { requireExpectedBadReadinessError(receiptFailure, startup, good) } catch (error) { retained = error }
  expect(retained).toBe(receiptFailure)
  const cleanupFailure = new AggregateError([startup, Error('Cleanup failed')])
  try { requireExpectedBadReadinessError(cleanupFailure, startup, good) } catch (error) { retained = error }
  expect(retained).toBe(cleanupFailure)
})

it('classifies only the exact owned terminal unhealthy rejection, without persisting CLI prose', () => {
  const project = fixture().project
  const expected = `container ${project}-keycloak-1 is unhealthy`
  for (const line of [expected, `dependency failed to start: ${expected}`, `\u001b[31m${expected}\u001b[0m\n`]) expect(classifyBadReadinessRejection(project, line)).toBe('owned-keycloak-unhealthy')
  for (const line of ['', 'unrelated transport rejection', `${expected}\nunrelated terminal rejection`, `container foreign-keycloak-1 is unhealthy`, `unexpected private prefix: ${expected}`]) expect(classifyBadReadinessRejection(project, line)).toBe('unclassified')
})

import nodeAssert from 'node:assert/strict'

it('executes the actual bad-readiness orchestration with inert transports and refuses unrelated or missing evidence', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/run.mjs'), 'utf8')
  const start = source.indexOf('async function readinessFailureControl(')
  const end = source.indexOf('\nasync function main()', start)
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start)
  const body = source.slice(start, end)
  const images = Object.fromEntries(Object.entries(IMAGE_TAGS).map(([name, tag]) => [name, `${tag}@sha256:${'a'.repeat(64)}`]))
  const modes = ['expected', 'dependency-wrapper', 'ansi', 'zero', 'unrelated-125', 'unrelated-1', 'missing-log', 'extra-terminal', 'wrong-project', 'missing-exit', 'missing-health', 'unknown-health', 'wrong-id', 'cancelled', 'health-receipt-failure', 'cleanup-failure', 'cleanup-receipt-failure']
  for (const mode of modes) {
    const c = { ...fixture(), directory: '/inert/group' }
    const id = 'a'.repeat(64)
    const files = new Map<string, string>()
    const events: string[] = []
    const memoryFs = {
      writeFileSync(file: string, data: string) {
        events.push(path.basename(file))
        if (mode === 'health-receipt-failure' && file.endsWith('readiness-control-health.json')) throw Error('Health receipt failure')
        if (mode === 'cleanup-receipt-failure' && file.endsWith('readiness-control-cleanup.json')) throw Error('Cleanup receipt failure')
        files.set(file, data)
      },
      readFileSync(file: string) { if (!files.has(file)) throw Error('Missing inert file'); return files.get(file) },
    }
    const startupError = Error('Inert startup rejection')
    const execute = async (_command: string, _args: string[], options: { name: string }) => {
      events.push(options.name)
      if (options.name === 'readiness-control-start') {
        expect(_command).toBe('docker')
        expect(_args[_args.indexOf('--wait-timeout') + 1]).toBe('20')
        const exitCode = mode === 'zero' ? 0 : mode === 'unrelated-125' ? 125 : 1
        if (mode !== 'missing-exit') files.set(path.join('/inert/output', 'readiness-control-start.receipt.json'), JSON.stringify({ exitCode }))
        const expected = `container ${c.project}-keycloak-1 is unhealthy`
        const terminal = mode.startsWith('unrelated-') ? 'Unrelated transport rejection' : mode === 'extra-terminal' ? `${expected}\nUnrelated final rejection` : mode === 'wrong-project' ? 'container foreign-keycloak-1 is unhealthy' : mode === 'dependency-wrapper' ? `dependency failed to start: ${expected}` : mode === 'ansi' ? `\u001b[31m${expected}\u001b[0m` : expected
        if (mode !== 'missing-log') files.set(path.join('/inert/output', 'readiness-control-start.log'), terminal)
        if (exitCode !== 0) throw startupError
        return ''
      }
      if (options.name === 'readiness-control-owned-keycloak') return mode === 'missing-health' ? '' : id
      if (options.name === 'readiness-control-owned-keycloak-health') return `${mode === 'wrong-id' ? 'b'.repeat(64) : id} running ${mode === 'unknown-health' ? 'private-unknown' : 'unhealthy'}`
      if (options.name === 'readiness-control-cleanup' && mode === 'cleanup-failure') throw Error('Cleanup failure')
      return ''
    }
    // Only the trusted function body is evaluated; every transport and fs effect
    // is injected. main(), Docker, browsers and the real filesystem never execute.
    const dependencies = { newFixture: async () => c, path, badReadinessDocument, sourceRoot: '/inert/source', fs: memoryFs, output: '/inert/output', ownedLifecycle, resources: async () => [], execute, assert: nodeAssert, attemptCleanup, observeBadKeycloakHealth, cancelled: mode === 'cancelled', classifyBadReadinessRejection, requireExpectedBadReadinessError, READINESS_CONTROL_WAIT_SECONDS }
    const control = new Function(...Object.keys(dependencies), `${body}\nreturn readinessFailureControl`)(...Object.values(dependencies)) as (root: string, images: Record<string, string>) => Promise<Record<string, unknown>>
    if (['expected', 'dependency-wrapper', 'ansi'].includes(mode)) {
      const result = await control('/inert', images)
      expect(result, mode).toMatchObject({ deliberateReadinessFailure: true, authOperationsStarted: false, cleanupPassed: true, exitCode: 1, startupRejection: 'owned-keycloak-unhealthy' })
      expect(events.indexOf('readiness-control-health.json'), mode).toBeLessThan(events.indexOf('readiness-control-cleanup'))
    } else await expect(control('/inert', images), mode).rejects.toBeDefined()
    expect(events, mode).toContain('readiness-control-cleanup')
    expect(events, mode).toContain('readiness-control-cleanup.json')
  }
})
