import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'

export const SECURITY_BASELINE = '68e1fafce35e7e931ee0e7c65b5c6e0b4ccf8e8b'
export const SECURITY_PATCH = 'identity-portal/patches/monaco-editor@0.55.1.patch'
export const SECURITY_PROVENANCE = 'identity-portal/patches/monaco-editor@0.55.1.provenance.json'
export const SECURITY_UPSTREAM = '60c5d5ccbb466de3de3ba863461a92bf134f8c156cef7992da43e0f659bc5cbd'
export const SECURITY_ORIGINAL_ASSETS = Object.freeze({
  'esm/vs/base/browser/dompurify/dompurify.js': '9b2835fc7de5bd37faff156e83bf060067577a1f09c6620d9f37d5fa5e5970b1',
  'dev/vs/editor.api-CykLys8L.js': 'abdd0cc9b9e1c38e5ac610bd6ab98704994e0fd14b6318550e9dba6ed08fb1cf',
  'min/vs/editor.api-CalNCsUg.js': 'c10d0058fe0ee5d2c46c3b6cbb28474407be5d45ada35973f3230561f82c4de5',
})
export const SECURITY_INPUTS = 'identity-portal/tests/auth-compatibility/security-inputs.json'
const baselineHashes = Object.freeze({
  'identity-portal/package.json': '28ef5478336bb5ec9eab09625cd0f76c9677eb07c4777ce65ba1df7ecec58097',
  'identity-portal/pnpm-lock.yaml': '0c12f17edeb59c30e0b1eab6dd0418f12bb28b2681f6c99e9ff2524b7122f802',
  'identity-portal/pnpm-workspace.yaml': '17a80ef0f49fe9ffebb6aac8aed9376ef0dba533c3480f4d67cb78d4f2e748b5',
})
export const SECURITY_CANDIDATE_PATHS = Object.freeze([...Object.keys(baselineHashes), SECURITY_PATCH, SECURITY_PROVENANCE,
  'identity-portal/scripts/security/monaco-purify-patch.mjs',
  'identity-portal/patches/upstream/dompurify-3.4.17.purify.es.mjs',
  'identity-portal/patches/upstream/dompurify-3.4.17.LICENSE',
  'identity-portal/patches/upstream/dompurify-3.4.17.npm-provenance.json'])
export const securityCase = () => ({ name: 'security-audit', baseline: SECURITY_BASELINE, manifestSha256: baselineHashes['identity-portal/package.json'] })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (args, options) => execFileSync('git', args, { ...options, env: { ...options?.env, GIT_NO_LAZY_FETCH: '1' } })
const show = (ref, file, options) => git(['show', `${ref}:${file}`], options)
const keys = (value, expected, message) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...expected].sort(), message)

export function assertSecurityManifest(baselineContent, candidate) {
  assert.equal(hash(baselineContent), baselineHashes['identity-portal/package.json'], 'Security baseline manifest bytes must be immutable')
  const expected = JSON.parse(baselineContent)
  expected.dependencies.shadcn = '^4.23.0'
  expected.dependencies.zod = '^4.6.7'
  expected.devDependencies.vitest = '^4.1.12'
  expected.devDependencies['@vitest/coverage-v8'] = '^4.1.12'
  assert.deepEqual(candidate, expected, 'Only the four reviewed security manifest changes are admitted')
}

export function assertSecurityVersions(variant, versions) {
  assert.ok(['baseline', 'candidate'].includes(variant))
  const fixed = { next: '16.4.2', react: '19.3.1', 'react-dom': '19.3.1', '@types/react': '19.3.0', '@types/react-dom': '19.3.0', jose: '6.2.12', '@keycloak/keycloak-admin-client': '26.8.1', 'monaco-editor': '0.55.1', 'monaco-yaml': '5.5.1' }
  const selected = variant === 'baseline'
    ? { shadcn: '4.21.0', zod: '4.4.3', vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11' }
    : { shadcn: '4.23.0', zod: '4.6.7', vitest: '4.1.12', '@vitest/coverage-v8': '4.1.12' }
  for (const [name, value] of Object.entries({ ...fixed, ...selected })) assert.equal(versions[name], value, `Exact security ${variant} version required: ${name}`)
}

const metadataPaths = new Set([
  '.docpact/config.yaml', 'AGENTS.md', 'GOAL.md', 'identity-portal/AGENTS.md', 'docs/README.md', 'docs/design/README.md',
  'docs/design/03-governance/02-deployment-operations-design/README.md', 'docs/implementation/README.md', 'docs/implementation/definition-of-done.md', 'identity-portal/deploy/runbooks/README.md',
])
const supportPaths = new Set([
  'identity-portal/scripts/security/monaco-purify-patch.mjs',
  'identity-portal/patches/monaco-editor@0.55.1.provenance.json',
  'identity-portal/patches/upstream/dompurify-3.4.17.purify.es.mjs',
  'identity-portal/patches/upstream/dompurify-3.4.17.LICENSE',
  'identity-portal/patches/upstream/dompurify-3.4.17.npm-provenance.json',
  'identity-portal/tests/unit/security-dependency-patch.test.ts',
  '.github/workflows/auth-compatibility.yml', 'identity-portal/tests/unit/auth-compatibility-harness.test.ts',
  'identity-portal/tests/unit/catalog-qualification.test.ts', 'identity-portal/tests/unit/security-qualification.test.ts', 'identity-portal/tests/unit/security-behavior.test.ts',
])
const docPaths = new Set(['docs/guides/dependency-maintenance.md', 'docs/references/2026-07-02-l0-dependency-versions.md', 'docs/references/2026-10-28-dependency-security.md'])
const stripReview = value => value.replace(/^(?:lastReviewedAt|lastReviewedCommit|lastReviewedNote):[^\r\n]*(?:\r?\n|$)/gm, '')
function reviewBody(file, value) { return file.endsWith('.md') ? value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, stripReview) : stripReview(value) }
export function securityChangedPathPolicy(file) {
  if (Object.hasOwn(baselineHashes, file) || file === SECURITY_PATCH) return 'bound-input'
  if (file === 'identity-portal/deploy/docker/Dockerfile') return 'patch-packaging'
  if (file.startsWith('identity-portal/tests/auth-compatibility/') || supportPaths.has(file)) return 'qualification-support'
  if (metadataPaths.has(file)) return 'review-metadata'
  if (docPaths.has(file)) return 'qualification-doc'
  assert.fail(`Unreviewed security qualification path: ${file}`)
}

export function assertSecuritySources({ baseline, head, requestedHead, cwd, env }) {
  const options = { cwd, env }
  assert.equal(baseline, SECURITY_BASELINE, 'Use the immutable security baseline')
  assert.match(head, /^[a-f0-9]{40}$/)
  assert.equal(head, requestedHead, 'Candidate must be the requested exact head')
  assert.notEqual(head, baseline)
  assert.equal(git(['merge-base', baseline, head], options).toString().trim(), baseline, 'Candidate must descend from the security baseline')
  const inputs = JSON.parse(show(head, SECURITY_INPUTS, options))
  keys(inputs, ['schema', 'baseline', 'baselineHashes', 'candidateHashes'], 'Unknown security input contract fields')
  assert.equal(inputs.schema, 1)
  assert.equal(inputs.baseline, baseline)
  assert.deepEqual(inputs.baselineHashes, baselineHashes, 'Security baseline hashes are immutable')
  keys(inputs.candidateHashes, SECURITY_CANDIDATE_PATHS, 'Bind every exact security input, with no extra path')
  for (const [file, digest] of Object.entries(baselineHashes)) assert.equal(hash(show(baseline, file, options)), digest, `Immutable baseline input mismatch: ${file}`)
  for (const [file, digest] of Object.entries(inputs.candidateHashes)) {
    assert.match(digest, /^[a-f0-9]{64}$/, `Unqualified candidate input: ${file}`)
    assert.equal(hash(show(head, file, options)), digest, `Security candidate input mismatch: ${file}`)
  }
  assertSecurityProvenance(JSON.parse(show(head, SECURITY_PROVENANCE, options)), inputs)
  assert.equal(hash(show(head, 'identity-portal/patches/upstream/dompurify-3.4.17.purify.es.mjs', options)), SECURITY_UPSTREAM, 'Require trusted upstream sanitizer bytes')
  assertSecurityManifest(show(baseline, 'identity-portal/package.json', options), JSON.parse(show(head, 'identity-portal/package.json', options)))
  const dockerPath = 'identity-portal/deploy/docker/Dockerfile'
  const dockerBefore = show(baseline, dockerPath, options).toString()
  assert.equal(dockerBefore.split('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\n').length, 2, 'Require the single baseline manifest COPY anchor')
  assert.equal(show(head, dockerPath, options).toString(), dockerBefore.replace('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\n', 'COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nCOPY patches ./patches\n'), 'Security patch must be copied before the unchanged frozen install')
  const changed = git(['diff', '--name-only', '--no-renames', '-z', baseline, head], options).toString().split('\0').filter(Boolean)
  for (const file of changed) {
    const policy = securityChangedPathPolicy(file)
    if (policy === 'review-metadata') {
      let expected = reviewBody(file, show(baseline, file, options).toString())
      if (file === '.docpact/config.yaml') expected = expected.replace('      - path: identity-portal/scripts/monaco-worker-regression.mjs\n', '      - path: identity-portal/scripts/security/monaco-purify-patch.mjs\n        kind: security-patch-provenance\n      - path: docs/references/2026-10-28-dependency-security.md\n        kind: security-qualification-record\n      - path: identity-portal/scripts/monaco-worker-regression.mjs\n')
      assert.equal(expected, reviewBody(file, show(head, file, options).toString()), 'Security review metadata cannot change product policy')
    }
    if (policy === 'patch-packaging') {
      const before = show(baseline, file, options).toString()
      const after = show(head, file, options).toString()
      assert.equal(after, before.replace('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\n', 'COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nCOPY patches ./patches\n'), 'Only the required patch COPY before frozen install is admitted')
    }
  }
  return { baselineHashes: inputs.baselineHashes, candidateHashes: inputs.candidateHashes }
}

export function assertSecurityArchive(app, variant, bindings) {
  assert.ok(['baseline', 'candidate'].includes(variant))
  const expected = variant === 'baseline' ? bindings?.baselineHashes : bindings?.candidateHashes
  keys(expected, variant === 'candidate' ? SECURITY_CANDIDATE_PATHS : Object.keys(baselineHashes), 'Require source-bound archived security inputs')
  for (const [file, digest] of Object.entries(expected)) {
    assert.match(digest, /^[a-f0-9]{64}$/)
    assert.equal(hash(readFileSync(path.join(app, file.slice('identity-portal/'.length)))), digest, `Archived security input mismatch: ${file}`)
  }
}

export function assertSecurityProvenance(provenance, bindings) {
  keys(provenance, ['monacoVersion', 'upstreamVersion', 'upstreamSha256', 'patchSha256', 'maps', 'assets'], 'Unknown sanitizer provenance fields')
  assert.equal(provenance.monacoVersion, '0.55.1')
  assert.equal(provenance.upstreamVersion, '3.4.17')
  assert.equal(provenance.upstreamSha256, SECURITY_UPSTREAM, 'Require trusted upstream sanitizer provenance')
  assert.equal(provenance.patchSha256, bindings?.candidateHashes?.[SECURITY_PATCH], 'Sanitizer provenance must bind the exact candidate patch')
  assert.ok(typeof provenance.maps === 'string' && provenance.maps.length < 1000)
  assert.ok(Array.isArray(provenance.assets) && provenance.assets.length === 3, 'Require every sanitizer asset')
  const paths = provenance.assets.map(asset => asset.path)
  assert.equal(new Set(paths).size, 3, 'Duplicate sanitizer asset path')
  assert.deepEqual([...paths].sort(), Object.keys(SECURITY_ORIGINAL_ASSETS).sort(), 'Unknown or omitted sanitizer asset path')
  for (const asset of provenance.assets) {
    assert.equal(asset.originalSha256, SECURITY_ORIGINAL_ASSETS[asset.path], 'Immutable original sanitizer asset mismatch')
    assert.equal(asset.upstreamSha256, SECURITY_UPSTREAM, 'Per-asset upstream sanitizer mismatch')
    assert.match(asset.patchedSha256, /^[a-f0-9]{64}$/, 'Require exact patched sanitizer hash')
  }
  return provenance.assets
}

export function securityInstalledAssets(app, variant, bindings) {
  assert.ok(['baseline', 'candidate'].includes(variant))
  const expected = { ...SECURITY_ORIGINAL_ASSETS }
  if (variant === 'candidate') {
    const file = path.join(app, SECURITY_PROVENANCE.slice('identity-portal/'.length))
    const bytes = readFileSync(file)
    assert.equal(hash(bytes), bindings?.candidateHashes?.[SECURITY_PROVENANCE], 'Candidate provenance bytes must match the source binding')
    assert.equal(hash(readFileSync(path.join(app, SECURITY_PATCH.slice('identity-portal/'.length)))), bindings.candidateHashes[SECURITY_PATCH], 'Installed sanitizer patch must match the source binding')
    for (const asset of assertSecurityProvenance(JSON.parse(bytes), bindings)) expected[asset.path] = asset.patchedSha256
  }
  const root = realpathSync(path.join(app, 'node_modules/monaco-editor'))
  let files = 0; let bytes = 0
  const copies = []
  const visit = (directory, depth = 0) => {
    assert.ok(depth <= 32, 'Sanitizer inventory depth exceeded')
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      assert.equal(entry.isSymbolicLink(), false, 'Refuse a shadow sanitizer symlink')
      if (entry.isDirectory()) visit(file, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        files++; bytes += lstatSync(file).size
        assert.ok(files <= 10000 && bytes <= 128 * 1024 * 1024, 'Sanitizer inventory exceeds bounded package size')
        const content = readFileSync(file)
        if (/\/\*!\s*@license DOMPurify \d+\.\d+\.\d+/.test(content.toString())) copies.push(path.relative(root, file).split(path.sep).join('/'))
      }
    }
  }
  visit(root)
  assert.deepEqual(copies.sort(), Object.keys(expected).sort(), 'Unexpected or missing embedded sanitizer copy')
  const assets = Object.entries(expected).map(([relative, digest]) => {
    const observed = hash(readFileSync(path.join(root, relative)))
    assert.equal(observed, digest, 'Installed sanitizer asset hash mismatch')
    return { path: relative, sha256: observed }
  })
  return { qualificationCase: 'security-audit', variant, monacoVersion: '0.55.1', sanitizerVersion: variant === 'baseline' ? '3.2.7' : '3.4.17', assets, ...(variant === 'candidate' ? { patchSha256: bindings.candidateHashes[SECURITY_PATCH], provenanceSha256: bindings.candidateHashes[SECURITY_PROVENANCE], upstreamSha256: SECURITY_UPSTREAM } : {}) }
}
