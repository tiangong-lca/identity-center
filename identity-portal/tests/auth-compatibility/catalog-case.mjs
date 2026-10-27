import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { BASELINE, assertFixture } from './contract.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
export const CATALOG_BASELINE = '64055a2cd05fa4056ea36fd9ab1b780a77e1690e'
const MANIFEST = 'd9082c7ffa6e01869dbba0bcbe2c01ce1baeaece1a17fd964e7f7fac5d2df38d'
const LOCK = '4ca8d32468ac50668f5e11bcb2cadb08e5532ce8523685f6dc76848b91a3a1aa'
const product = new Map([
  ['identity-portal/features/catalog/catalog-editor-impl.tsx', '4ef13b75f2784c92fb822f2be2730ccabd420f71256f5fdf8bd5434441632514'],
  ['identity-portal/features/catalog/yaml-worker-adapter.ts', '315cf6f9874fba4dd9aea5f6d6174a573dfad1e9f936f84b9a33ba0cd9c6a03a'],
])
const metadata = new Set(['AGENTS.md', 'GOAL.md', 'identity-portal/AGENTS.md', 'docs/README.md', 'docs/design/README.md',
  'docs/design/02-application/01-frontend-product-interaction-design/README.md',
  'docs/design/03-governance/02-deployment-operations-design/README.md',
  'docs/implementation/README.md', 'docs/implementation/definition-of-done.md', 'identity-portal/deploy/runbooks/README.md'])
export function proofCase(name = 'auth-client') {
  assert.ok(['auth-client', 'catalog-yaml'].includes(name), 'Unknown qualification case')
  return { name, baseline: name === 'catalog-yaml' ? CATALOG_BASELINE : BASELINE }
}
const strip = content => content.replace(/^(?:lastReviewedAt|lastReviewedCommit|lastReviewedNote):[^\r\n]*(?:\r?\n|$)/gm, '')
const withoutMetadata = (file, content) => file.endsWith('.md') ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, strip) : strip(content)

export function assertCatalogSources({ baseline, head, requestedHead, cwd, env }) {
  assert.equal(baseline, CATALOG_BASELINE, 'Use immutable catalog baseline')
  assert.match(head, /^[a-f0-9]{40}$/)
  assert.equal(head, requestedHead, 'Use requested exact source')
  assert.notEqual(head, baseline)
  const git = (...args) => execFileSync('git', ['-C', cwd, ...args], { env: { ...env, GIT_NO_LAZY_FETCH: '1' } }).toString()
  assert.equal(git('merge-base', baseline, head).trim(), baseline, 'Source must descend from immutable baseline')
  const blob = (ref, file) => git('show', `${ref}:${file}`)
  for (const [file, expected] of [['identity-portal/package.json', MANIFEST], ['identity-portal/pnpm-lock.yaml', LOCK]]) {
    assert.equal(digest(blob(baseline, file)), expected, 'Immutable baseline graph identity')
    assert.equal(blob(head, file), blob(baseline, file), 'Catalog repair preserves exact graph')
  }
  const changed = git('diff', '--name-only', '--no-renames', '-z', baseline, head).split('\0').filter(Boolean)
  for (const file of changed) {
    if (product.has(file)) { assert.equal(digest(blob(head, file)), product.get(file), 'Use reviewed exact catalog product source'); continue }
    if (file.startsWith('identity-portal/tests/auth-compatibility/') || file.startsWith('identity-portal/tests/monaco-worker/') ||
      ['identity-portal/tests/unit/auth-compatibility-harness.test.ts', 'identity-portal/tests/unit/catalog-qualification.test.ts',
        'identity-portal/tests/unit/yaml-worker-adapter.test.ts', 'identity-portal/tests/unit/monaco-worker-stages.test.ts',
        'identity-portal/scripts/monaco-worker-regression.mjs', '.github/workflows/auth-compatibility.yml',
        'docs/implementation/decisions.md', 'docs/references/2026-10-27-catalog-yaml-worker.md'].includes(file)) continue
    if (file === '.docpact/config.yaml') {
      assert.equal(digest(strip(blob(head, file))), '5f4c54626a614fdab486db7c41c7020a11405343cead816f25f3a51f1d08b1ba', 'Only reviewed governance routing'); continue
    }
    if (metadata.has(file)) { assert.equal(withoutMetadata(file, blob(head, file)), withoutMetadata(file, blob(baseline, file)), 'Review metadata only'); continue }
    assert.fail(`Unreviewed catalog qualification path: ${file}`)
  }
  for (const [file, expected] of product) assert.equal(digest(blob(head, file)), expected, 'Required reviewed catalog source')
  return { qualificationCase: 'catalog-yaml', baseline, head, manifestSha256: MANIFEST, lockSha256: LOCK }
}

export function assertCatalogVersions(versions) {
  assert.deepEqual(versions, { next: '16.4.2', react: '19.2.4', 'react-dom': '19.2.4',
    jose: '6.2.12', '@keycloak/keycloak-admin-client': '26.8.1' })
}

export function assertCatalogUiReceipts(baseline, candidate) {
  assert.equal(baseline.ui?.executed, false, 'Broken baseline UI is not executed')
  assert.equal(baseline.ui?.passed, false, 'Broken baseline UI is never passed')
  assert.equal(baseline.ui?.reason, 'known-baseline-yaml-worker-defect')
  assert.equal(candidate.ui?.executed, true, 'Candidate Registry UI must execute')
  assert.equal(candidate.ui?.passed, true, 'Candidate Registry UI must pass')
  assert.deepEqual(candidate.ui?.errors, { page: 0, console: 0 })
  assert.equal(candidate.ui?.schemaWorker, true)
  assert.equal(candidate.ui?.keyboardApplyReadback, true)
  assert.equal(candidate.ui?.spaDisposalReopen, true)
  assert.equal(candidate.ui?.yamlWorkers, 2)
  assert.equal(candidate.ui?.yamlWorkersClosed, 2)
  assert.equal(candidate.ui?.unrecognizedWorkers, 0)
}

export function syntheticCatalogDocument(c) {
  assertFixture(c)
  return { version: 1, applications: [{ code: `yaml-${c.nonce}`, name: `Synthetic YAML ${c.nonce}`, status: 'disabled',
    keycloak: { clientId: `yaml-${c.nonce}`, accessRole: `yaml-access-${c.nonce}` }, roles: [] }] }
}
