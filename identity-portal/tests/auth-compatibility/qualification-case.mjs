import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { BASELINE, assertProductDelta } from './contract.mjs'
import { proofCase, assertCatalogVersions } from './catalog-case.mjs'

// Separate reviewed experiments. Never widen one experiment to admit another.
const cases = Object.freeze({
  'auth-client': Object.freeze({
    baseline: BASELINE,
    manifestSha256: '7df3d205d1d3d4773f77315153d0cde689956e819c9394144e3672198d513547',
  }),
  'react19.3': Object.freeze({
    baseline: '64055a2cd05fa4056ea36fd9ab1b780a77e1690e',
    manifestSha256: 'd9082c7ffa6e01869dbba0bcbe2c01ce1baeaece1a17fd964e7f7fac5d2df38d',
  }),
  'react19.3-catalog-fixed': Object.freeze({
    baseline: 'b0c5baa1e9119563dc2a8c0720390dd1ce3a5890',
    manifestSha256: 'd9082c7ffa6e01869dbba0bcbe2c01ce1baeaece1a17fd964e7f7fac5d2df38d',
  }),
})

export function qualificationCase(name = 'auth-client') {
  if (name === 'catalog-yaml') return proofCase(name)
  assert.ok(Object.hasOwn(cases, name), 'Unknown qualification case')
  return { name, ...cases[name] }
}

export function assertQualificationSources(name, { baseline, head, requestedHead, ancestor }) {
  assert.equal(baseline, qualificationCase(name).baseline, 'Use the immutable case baseline')
  assert.match(head, /^[a-f0-9]{40}$/)
  assert.equal(head, requestedHead, 'Candidate must be the requested exact head')
  assert.notEqual(head, baseline, 'Candidate must be a new source')
  assert.equal(ancestor, true, 'Candidate must descend from the case baseline')
}

export function assertQualificationManifest(name, baselineContent, candidate) {
  const selected = qualificationCase(name)
  assert.equal(createHash('sha256').update(baselineContent).digest('hex'), selected.manifestSha256, 'Baseline manifest must match its immutable source')
  const expected = JSON.parse(baselineContent)
  if (name === 'auth-client') {
    expected.dependencies['@keycloak/keycloak-admin-client'] = '^26.8.1'
    expected.dependencies.jose = '^6.2.12'
    expected.devDependencies['@types/node'] = '^24.19.2'
    expected.engines = { node: '>=24.22.1 <25' }
  } else {
    expected.dependencies.react = '19.3.1'
    expected.dependencies['react-dom'] = '19.3.1'
  }
  assert.deepEqual(candidate, expected, 'Only the exact case manifest delta is admitted')
}

export function assertQualificationVersions(name, variant, versions) {
  qualificationCase(name)
  assert.ok(['baseline', 'candidate'].includes(variant))
  if (name === 'catalog-yaml') return assertCatalogVersions(Object.fromEntries(['next', 'react', 'react-dom', 'jose', '@keycloak/keycloak-admin-client'].map(key => [key, versions[key]])))
  const historical = name === 'auth-client'
  const upgraded = !historical && variant === 'candidate'
  assert.equal(versions.next, '16.4.2')
  assert.equal(versions.react, upgraded ? '19.3.1' : '19.2.4')
  assert.equal(versions['react-dom'], upgraded ? '19.3.1' : '19.2.4')
  assert.equal(versions['@types/react'], upgraded ? '19.3.0' : '19.2.17')
  assert.equal(versions['@types/react-dom'], upgraded ? '19.3.0' : '19.2.3')
  assert.equal(versions.jose, historical && variant === 'baseline' ? '6.2.3' : '6.2.12')
  assert.equal(versions['@keycloak/keycloak-admin-client'], historical && variant === 'baseline' ? '26.6.4' : '26.8.1')
}

const reviewMetadataPaths = new Set([
  '.docpact/config.yaml', 'AGENTS.md', 'GOAL.md', 'identity-portal/AGENTS.md',
  'docs/README.md', 'docs/design/README.md',
  'docs/design/03-governance/02-deployment-operations-design/README.md',
  'docs/implementation/README.md', 'docs/implementation/definition-of-done.md',
  'identity-portal/deploy/runbooks/README.md',
])
const qualificationDocs = new Set([
  'docs/guides/dependency-maintenance.md',
  'docs/references/2026-07-02-l0-dependency-versions.md',
])

export function reactChangedPathPolicy(file) {
  if (file === 'identity-portal/package.json') return 'manifest'
  if (file === 'identity-portal/pnpm-lock.yaml') return 'lock'
  if (file.startsWith('identity-portal/tests/auth-compatibility/') ||
      file === 'identity-portal/tests/unit/auth-compatibility-harness.test.ts' ||
      file === '.github/workflows/auth-compatibility.yml') return 'qualification-support'
  if (qualificationDocs.has(file)) return 'qualification-doc'
  if (reviewMetadataPaths.has(file)) return 'review-metadata'
  assert.fail(`Unreviewed React qualification path: ${file}`)
}

function withoutReviewMetadata(file, content) {
  const strip = value => value.replace(/^(?:lastReviewedAt|lastReviewedCommit|lastReviewedNote):[^\r\n]*(?:\r?\n|$)/gm, '')
  return file.endsWith('.md')
    ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, strip)
    : strip(content)
}

export function assertQualificationProductDelta(name, file, before, after) {
  qualificationCase(name)
  if (name === 'auth-client') return assertProductDelta(file, before, after)
  const metadataOnly = reviewMetadataPaths.has(file)
  assert.equal(metadataOnly ? withoutReviewMetadata(file, after) : after,
    metadataOnly ? withoutReviewMetadata(file, before) : before,
    'React qualification cannot change product or deployment behavior')
}

export function assertReactSourcePathFromGit(file, beforeRef, afterRef, options, name = 'react19.3') {
  const policy = reactChangedPathPolicy(file)
  if (policy === 'review-metadata') assertQualificationProductDeltaFromGit(name, file, beforeRef, afterRef, options)
  return policy
}

export function assertQualificationProductDeltaFromGit(name, file, beforeRef, afterRef, options) {
  assert.equal(beforeRef, qualificationCase(name).baseline, 'Product comparison must use the case baseline')
  const blob = ref => execFileSync('git', ['show', `${ref}:${file}`], {
    ...options, encoding: 'utf8', env: { ...options?.env, GIT_NO_LAZY_FETCH: '1' },
  })
  assertQualificationProductDelta(name, file, blob(beforeRef), blob(afterRef))
}
