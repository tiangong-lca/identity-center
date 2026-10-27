import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { load } from 'js-yaml'
import { IMAGE_TAGS, composeDocument, ownedLifecycle, attemptCleanup } from '../auth-compatibility/contract.mjs'
import { proofCase, CATALOG_BASELINE, assertCatalogVersions, assertCatalogUiReceipts, syntheticCatalogDocument } from '../auth-compatibility/catalog-case.mjs'
import { emittedYamlWorker, classifyYamlWorker } from '../auth-compatibility/catalog-worker-identity.mjs'
import { qualificationCase, assertQualificationManifest } from '../auth-compatibility/qualification-case.mjs'
import { combinedReactUi, assertFixedReactUiReceipts } from '../auth-compatibility/ui-plan.mjs'
import { nativeInputState } from '../auth-compatibility/native-input-state'

it('compares only a complete nonempty native selection and never returns buffer data', () => {
  const text = 'controlled-private-buffer\n'
  try {
    for (const [start, end] of [[0, text.length], [text.length, 0]]) {
      vi.stubGlobal('document', { activeElement: { editContext: { text, selectionStart: start, selectionEnd: end } } })
      const state = nativeInputState(text)
      expect(state).toEqual({ available: true, wholeSelection: true, exact: true })
      expect(Object.keys(state)).toEqual(['available', 'wholeSelection', 'exact'])
      expect(JSON.stringify(state)).not.toMatch(/controlled|private|buffer|text|length|hash/)
      expect(nativeInputState('wrong expected bytes').exact).toBe(false)
    }
  } finally { vi.unstubAllGlobals() }
})

it('cannot report exact from partial, collapsed, empty or malformed native selection', () => {
  const text = 'controlled-private-buffer'
  try {
    for (const [selectionStart, selectionEnd] of [[0, 0], [0, text.length - 1], [1, text.length], [-1, text.length], [0.5, text.length], [0, text.length + 1]]) {
      vi.stubGlobal('document', { activeElement: { editContext: { text, selectionStart, selectionEnd } } })
      expect(nativeInputState(text)).toEqual({ available: true, wholeSelection: false, exact: false })
    }
    vi.stubGlobal('document', { activeElement: { editContext: { text: '', selectionStart: 0, selectionEnd: 0 } } })
    expect(nativeInputState('')).toEqual({ available: true, wholeSelection: false, exact: false })
  } finally { vi.unstubAllGlobals() }
})

it('fails closed without a supported active public EditContext, without coercion', () => {
  try {
    for (const activeElement of [null, {}, { editContext: null }, { editContext: { text: { toString() { throw Error('must not coerce') } }, selectionStart: 0, selectionEnd: 1 } }]) {
      vi.stubGlobal('document', { activeElement })
      expect(nativeInputState('controlled')).toEqual({ available: false, wholeSelection: false, exact: false })
    }
  } finally { vi.unstubAllGlobals() }
})

function fixture() {
 const nonce = 'a'.repeat(20)
 return { variant: 'baseline', nonce, project: `identity34-baseline-${nonce}`, realm: `identity34-baseline-${nonce}`,
 keycloakOrigin: 'http://localhost:21001', portalOrigin: 'http://localhost:21002', redisOrigin: 'http://localhost:21003', postgresOrigin: 'http://localhost:21004',
 masterPassword: 'm'.repeat(40), redisPassword: 'r'.repeat(40), postgresPassword: 'p'.repeat(40), authSecret: 'a'.repeat(40), userPassword: 'u'.repeat(40), email: `identity34-baseline-${nonce}@test.local` }
}

it('keeps historical and catalog graph/receipt contracts independent and exact', () => {
  expect(proofCase().baseline).toBe('d9b4827c961967fe16ef31c365025049c7ff8802')
  expect(proofCase('catalog-yaml').baseline).toBe(CATALOG_BASELINE)
  expect(() => proofCase('react19.3')).toThrow('Unknown')
  const versions = { next: '16.4.2', react: '19.2.4', 'react-dom': '19.2.4', jose: '6.2.12', '@keycloak/keycloak-admin-client': '26.8.1' }
  expect(() => assertCatalogVersions(versions)).not.toThrow()
  for (const drift of [{ react: '19.3.1' }, { 'react-dom': '19.3.1' }, { jose: '6.2.3' }]) expect(() => assertCatalogVersions({ ...versions, ...drift })).toThrow()
  const baseline = { ui: { executed: false, passed: false, reason: 'known-baseline-yaml-worker-defect' } }
  const candidate = { ui: { executed: true, passed: true, errors: { page: 0, console: 0 }, schemaWorker: true, keyboardApplyReadback: true, spaDisposalReopen: true, yamlWorkers: 2, yamlWorkersClosed: 2, unrecognizedWorkers: 0 } }
  expect(() => assertCatalogUiReceipts(baseline, candidate)).not.toThrow()
  for (const changed of [{ executed: false }, { passed: false }, { errors: { page: 1, console: 0 } }, { schemaWorker: false }, { keyboardApplyReadback: false }, { spaDisposalReopen: false }, { yamlWorkersClosed: 1 }]) expect(() => assertCatalogUiReceipts(baseline, { ui: { ...candidate.ui, ...changed } })).toThrow()
  expect(() => assertCatalogUiReceipts({ ui: { ...baseline.ui, passed: true } }, candidate)).toThrow()
  expect(syntheticCatalogDocument(fixture()).applications[0]).toMatchObject({ code: `yaml-${fixture().nonce}`, status: 'disabled' })
})

it('derives a unique owned YAML descriptor and classifies only bounded source-bound Worker URLs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity46-worker-descriptor-'))
  try {
    const dir = path.join(root, '.next/static/chunks'); fs.mkdirSync(dir, { recursive: true })
    const bootstrap = 'turbopack-worker-owned.js'
    fs.writeFileSync(path.join(dir, bootstrap), 'owned bootstrap')
    fs.writeFileSync(path.join(dir, 'yaml.js'), 'getConvertToBooleanActions findLinks')
    fs.writeFileSync(path.join(dir, 'runtime.js'), 'owned runtime')
    fs.writeFileSync(path.join(dir, 'app.js'), `.f("static/chunks/${bootstrap}",["static/chunks/yaml.js","static/chunks/runtime.js"])`)
    const descriptor = emittedYamlWorker(root)
    expect(descriptor.chunks).toEqual(['/_next/static/chunks/runtime.js', '/_next/static/chunks/yaml.js'])
    const origin = fixture().portalOrigin
    const url = (tuple: unknown) => `${origin}${descriptor.bootstrap}#params=${encodeURIComponent(JSON.stringify(tuple))}`
    const tuple = [descriptor.chunks, '', '/_next/', null, null]
    expect(classifyYamlWorker(url(tuple), origin, descriptor)).toBe('yaml')
    expect(classifyYamlWorker(url([['/_next/static/chunks/editor.js'], '', '/_next/', null, null]), origin, descriptor)).toBe('other')
    for (const value of [url(tuple).replace(origin, 'https://external.test'), url(tuple).replace('localhost:', 'user:synthetic-secret@localhost:'), url(tuple).replace('#params=', '?token=synthetic-secret#params='), 'x'.repeat(9000), url([descriptor.chunks, 'unexpected', '/_next/', null, null]), url([['https://external.test/private.js'], '', '/_next/', null, null])]) expect(classifyYamlWorker(value, origin, descriptor)).toBe('unrecognized')
    fs.unlinkSync(path.join(dir, 'yaml.js'))
    expect(() => emittedYamlWorker(root)).toThrow('Require one exact')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

it('the actual entrypoint validates a real Git tree and rejects unrelated paths, source changes and hidden rename deletions before Docker', { skip: process.platform === 'win32', timeout: 20_000 }, () => {
  const sourceRoot = path.resolve(__dirname, '../../..')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity46-entrypoint-'))
  try {
    const checkout = path.join(temp, 'git-source')
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    fs.mkdirSync(checkout)
    const git = (...args: string[]) => execFileSync(realGit, ['-C', checkout, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: temp, NODE_ENV: 'test', GIT_CONFIG_NOSYSTEM: '1' }, stdio: 'pipe' }).trim()
    git('init', '--quiet'); git('config', 'diff.renames', 'true')
    const snapshots = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/catalog-source.json'), 'utf8')) as {
      immutableBaseline: string; reviewedProduct: string
      files: Record<string, { sourceCommit: string; sourcePath: string; sha256: string; byteLength: number; encoding: string; content: string }>
    }
    expect(snapshots.immutableBaseline).toBe(CATALOG_BASELINE)
    expect(snapshots.reviewedProduct).toBe('a463281239bde6e24ad962bc7333c76a1a1782f8')
    const bytes = (name: string) => {
      const entry = snapshots.files[name]
      expect(['utf8', 'gzip-base64']).toContain(entry.encoding)
      expect(entry.sourceCommit).toBe(['afterEditor', 'adapter'].includes(name) ? snapshots.reviewedProduct : CATALOG_BASELINE)
      const value = entry.encoding === 'gzip-base64' ? gunzipSync(Buffer.from(entry.content, 'base64')) : Buffer.from(entry.content)
      expect(value.length).toBe(entry.byteLength)
      expect(createHash('sha256').update(value).digest('hex')).toBe(entry.sha256)
      return value
    }
    const write = (file: string, value: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true }); fs.writeFileSync(path.join(checkout, file), value) }
    const commit = () => { git('add', '--all'); git('-c', 'user.name=Inert test', '-c', 'user.email=test@invalid', 'commit', '--quiet', '-m', 'inert fixture delta'); return git('rev-parse', 'HEAD') }
    write('identity-portal/package.json', bytes('manifest'))
    write('identity-portal/pnpm-lock.yaml', bytes('lock'))
    write('identity-portal/features/catalog/catalog-editor-impl.tsx', bytes('beforeEditor'))
    write('identity-portal/lib/catalog/diff.ts', 'export const syntheticRenameControl = true\n')
    write('docs/README.md', '---\nlastReviewedAt: old\n---\nSynthetic unchanged policy\n')
    const fixtureBaseline = commit()
    write('identity-portal/features/catalog/catalog-editor-impl.tsx', bytes('afterEditor'))
    write('identity-portal/features/catalog/yaml-worker-adapter.ts', bytes('adapter'))
    write('docs/README.md', '---\nlastReviewedAt: new\n---\nSynthetic unchanged policy\n')
    const accepted = commit()
    const calls = path.join(temp, 'git-calls'); const state = path.join(temp, 'state'); const marker = path.join(temp, 'docker-called')
    const bin = path.join(temp, 'bin'); fs.mkdirSync(bin)
    // Only the immutable baseline reference is mapped to the owned synthetic
    // commit. All tree/diff/rename/ancestry operations still run real Git. This
    // unit seam is not the real clean-source hosted qualification preflight.
    fs.writeFileSync(path.join(bin, 'git'), `#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');const raw=process.argv.slice(2);let args=raw[0]==='-C'?raw.slice(2):raw;fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');if(fs.readFileSync(${JSON.stringify(state)},'utf8')==='old')args=args.filter(x=>x!=='--no-renames');const baseline=${JSON.stringify(CATALOG_BASELINE)},owned=${JSON.stringify(fixtureBaseline)};const mapped=args.map(x=>x===baseline?owned:x.startsWith(baseline+':')?owned+x.slice(baseline.length):x);const result=cp.execFileSync(${JSON.stringify(realGit)},['-C',${JSON.stringify(checkout)},...mapped]);if(args[0]==='merge-base'&&args.includes(baseline)){if(result.toString().trim()!==owned)process.exit(3);process.stdout.write(baseline+'\\n')}else process.stdout.write(result);\n`, { mode: 0o700 })
    fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh\n: > '${marker}'\n`, { mode: 0o700 })
    execFileSync(path.join(bin, 'docker')); expect(fs.existsSync(marker)).toBe(true); fs.unlinkSync(marker)
    const run = (head = git('rev-parse', 'HEAD'), extra: Record<string, string> = {}) => { fs.writeFileSync(state, extra.TEST_OLD_RENAME === '1' ? 'old' : 'new'); return execFileSync(process.execPath, [path.join(sourceRoot, 'identity-portal/tests/auth-compatibility/run.mjs'), '--validate-sources'], {
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: temp, NODE_ENV: 'test', AUTH_PROOF_CASE: 'catalog-yaml', AUTH_PROOF_HEAD: head, ...extra }, encoding: 'utf8', stdio: 'pipe',
    }) }
    expect(JSON.parse(run())).toMatchObject({ qualificationCase: 'catalog-yaml', baseline: CATALOG_BASELINE, head: accepted, dockerAccessed: false })
    for (const file of ['identity-portal/config/business-apps.yaml', 'identity-portal/drizzle.config.ts', 'identity-portal/new-product-surface.ts', 'identity-portal/features/catalog/catalog-editor-impl.tsx', 'identity-portal/package.json', 'docs/README.md']) {
      git('reset', '--hard', accepted)
      fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true })
      fs.appendFileSync(path.join(checkout, file), '\n// unexpected fixture mutation\n')
      const changed = commit()
      expect(() => run(changed), file).toThrow()
    }
    git('reset', '--hard', accepted)
    const before = 'identity-portal/lib/catalog/diff.ts'; const after = 'identity-portal/tests/auth-compatibility/moved-product.ts'
    fs.mkdirSync(path.dirname(path.join(checkout, after)), { recursive: true })
    git('mv', before, after); const renamed = commit()
    expect(git('diff', '--name-status', '-M', accepted, renamed)).toBe(`R100\t${before}\t${after}`)
    expect(JSON.parse(run(renamed, { TEST_OLD_RENAME: '1' }))).toMatchObject({ dockerAccessed: false })
    expect(() => run(renamed)).toThrow('Unreviewed catalog qualification path')
    git('reset', '--hard', accepted)
    expect(() => run('b'.repeat(40))).toThrow()
    expect(() => run(accepted, { AUTH_PROOF_CASE: 'unknown' })).toThrow()
    expect(() => run(accepted, { AUTH_PROOF_CASE: 'auth-client' })).toThrow()
    expect(fs.readFileSync(calls, 'utf8')).toContain(JSON.stringify(['diff', '--name-only', '--no-renames', '-z', CATALOG_BASELINE, accepted]))
    expect(fs.existsSync(marker)).toBe(false)
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}) // POSIX inert executable seam; no native Windows runtime proof is claimed.

it('activates only exact catalog owner paths on the secretless exact-head hosted workflow', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/auth-compatibility.yml'), 'utf8')
  const workflow = load(source) as { on: { pull_request: { paths: string[] } }; permissions: Record<string, string>; jobs: Record<string, { steps: Array<{ env?: Record<string, string>; with?: Record<string, unknown>; run?: string }> }> }
  expect(Object.keys(workflow.on)).toEqual(['pull_request'])
  expect(workflow.permissions).toEqual({ contents: 'read' })
  const paths = workflow.on.pull_request.paths
  expect(paths).toContain('identity-portal/features/catalog/yaml-worker-adapter.ts')
  expect(paths).toContain('identity-portal/features/catalog/catalog-editor-impl.tsx')
  expect(paths).not.toContain('identity-portal/**')
  const steps = workflow.jobs['auth-compatibility'].steps
  const runner = steps.find(step => step.env?.AUTH_PROOF_CASE)
  expect(runner?.env).toEqual({ AUTH_PROOF_HEAD: '${{ github.event.pull_request.head.sha }}', AUTH_PROOF_CASE: 'react19.3-catalog-fixed' })
  expect(runner?.run).toBe('node tests/auth-compatibility/run.mjs')
  expect(steps[0].with?.ref).toBe('${{ github.event.pull_request.head.sha }}')
  expect(steps[0].with?.['persist-credentials']).toBe(false)
  expect(source).not.toMatch(/secrets\.|pull_request_target|workflow_dispatch/)
})

it.each(['catalog-yaml', 'react19.3-catalog-fixed'])('invokes actual runner source selection and comparison with selected immutable baseline using inert dependencies: %s', async (caseName) => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/run.mjs'), 'utf8')
  const selectedCase = qualificationCase(caseName)
  const fixed = caseName === 'react19.3-catalog-fixed'
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/catalog-source.json'), 'utf8')).files.manifest.content as string
  const targetManifest = JSON.parse(manifest); targetManifest.dependencies.react = targetManifest.dependencies['react-dom'] = '19.3.1'
  const broad = { passed: true, errors: { page: 0, console: 0 }, firstRenderHydration: true, clientNavigation: true, realFormAndReadback: true, radixFocusTrapAndRestore: true, monacoEditAndApply: true, localesAndThemes: true, syntheticDataOnly: true }
  const catalogUi = { executed: true, passed: true, errors: { page: 0, console: 0 }, schemaWorker: true, keyboardApplyReadback: true, spaDisposalReopen: true, exactBufferRestored: true, syntheticDataOnly: true, yamlWorkers: 2, yamlWorkersClosed: 2, unrecognizedWorkers: 0, undoSteps: [5,5] }
  const head = 'f'.repeat(40)
  const events: unknown[] = []
  const saved = new Map<string, string>()
  const baseline = { source: selectedCase.baseline, ui: fixed ? combinedReactUi(caseName, 'baseline', broad, catalogUi, { page: 0, console: 0 }) : { executed: false, passed: false, reason: 'known-baseline-yaml-worker-defect' } }
  const candidate = { source: head, ui: fixed ? combinedReactUi(caseName, 'candidate', broad, catalogUi, { page: 0, console: 0 }) : catalogUi }
  const start = source.indexOf('async function main()'); const end = source.indexOf('\nmain().catch', start)
  const dependencies = {
    git: (...args: string[]) => args.join(' ') === 'rev-parse HEAD' ? head : args.join(' ') === 'status --porcelain' ? '' : args[0] === 'merge-base' ? selectedCase.baseline : args[0] === 'show' ? JSON.stringify(targetManifest) : args[0] === 'diff' ? 'identity-portal/tests/auth-compatibility/ui-plan.mjs\0' : (() => { throw Error('Unexpected real Git seam') })(),
    assert: nodeAssert, selectedCase, BASELINE: selectedCase.baseline, sourceRoot: '/inert/source', infraEnv: {},
    process: { argv: ['node', 'run.mjs'], version: 'v24.22.1', platform: 'linux', env: { AUTH_PROOF_HEAD: head, RUNNER_TEMP: '/inert', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' } },
    assertQualificationSources: (name: string, binding: { baseline: string; head: string; ancestor: boolean }) => { expect(name).toBe(caseName); expect(binding).toMatchObject({ baseline: selectedCase.baseline, head, ancestor: true }); events.push(['source-validation', binding.baseline]) },
    assertQualificationManifest,
    assertReactSourcePathFromGit: (_file: string, before: string, after: string, _options: unknown, name: string) => { expect(before).toBe(selectedCase.baseline); expect(after).toBe(head); expect(name).toBe(caseName) },
    execFileSync: (command: string, args: string[]) => { expect(command).toBe('git'); expect(args.at(-1)).toBe(selectedCase.baseline+':identity-portal/package.json'); return Buffer.from(manifest) },
    assertCatalogSources: (binding: { baseline: string; head: string }) => { expect(binding).toMatchObject({ baseline: CATALOG_BASELINE, head }); events.push(['source-validation', binding.baseline]) },
    assertHostedContext: () => events.push('hosted-guard'), path,
    fs: { mkdirSync: () => {}, mkdtempSync: () => '/inert/owned', writeFileSync: (file: string, data: string) => saved.set(file, data), rmSync: () => events.push('owned-cleanup') },
    execute: async (command: string, args: string[], options: { name: string }) => {
      events.push(['inert-command', command, options.name])
      if (command === 'pnpm') return '11.9.0'
      if (options.name.startsWith('image-')) return JSON.stringify([`owned@sha256:${'a'.repeat(64)}`])
      if (options.name.startsWith('platform-')) return 'owned linux/amd64'
      expect(command).toBe('docker'); expect(['docker-preflight', 'compose-preflight'].includes(options.name) || options.name.startsWith('pull-')).toBe(true)
      return ''
    },
    IMAGE_TAGS, readinessFailureControl: async () => ({ controlled: true }), cancelled: false,
    variant: async (name: string, _root: string, _images: unknown, requested: string) => { expect(requested).toBe(head); events.push(['runner', name]); return name === 'baseline' ? baseline : candidate },
    assertCatalogUiReceipts, assertFixedReactUiReceipts,
    compareReceipts: (before: unknown, after: unknown) => { expect(before).toBe(baseline); expect(after).toBe(candidate); events.push(['comparison', selectedCase.baseline]); return { passed: true } },
    console: { log: () => {} }, redact: () => 'fixed-error',
  }
  // Trusted actual function source; every transport/fs/process dependency is inert.
  const main = new Function(...Object.keys(dependencies), `let output;${source.slice(start, end)};return main`)(...Object.values(dependencies))
  await main()
  expect(events).toContainEqual(['source-validation', selectedCase.baseline])
  expect(events).toContainEqual(['runner', 'baseline'])
  expect(events).toContainEqual(['runner', 'candidate'])
  expect(events).toContainEqual(['comparison', selectedCase.baseline])
  expect(JSON.parse(saved.get('/inert/identity34-evidence-1-1/qualification.json')!)).toMatchObject({ qualificationCase: caseName, baseline: selectedCase.baseline, head })
  expect(events.at(-1)).toBe('owned-cleanup')

  // Exercise the actual archive-selection prefix as well: baseline/candidate
  // source binding must reach git archive, not merely a validation receipt.
  const variantStart = source.indexOf('async function variant(')
  const prefixEnd = source.indexOf('\n  const app = ', variantStart)
  const archives: string[] = []
  const prefixDependencies = { BASELINE: selectedCase.baseline, sourceRoot: '/inert/source', infraEnv: {}, path,
    newFixture: async () => ({ directory: '/inert/owned' }), fs: { mkdirSync: () => {} },
    execFileSync: (command: string, args: string[]) => { if (command === 'git') { archives.push(args.at(-1)!); return Buffer.from('inert archive') } expect(command).toBe('tar'); return Buffer.alloc(0) },
  }
  const runVariant = new Function(...Object.keys(prefixDependencies), `${source.slice(variantStart, prefixEnd)}\nreturn archive; } return variant`)(...Object.values(prefixDependencies))
  await runVariant('baseline', '/inert', {}, head)
  await runVariant('candidate', '/inert', {}, head)
  expect(archives).toEqual([selectedCase.baseline, head])
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
