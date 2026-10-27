import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { BASELINE, assertProductDelta } from './contract.mjs'

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
})

export function qualificationCase(name = 'auth-client') {
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

export function assertQualificationProductDelta(name, file, before, after) {
  qualificationCase(name)
  if (name === 'auth-client') return assertProductDelta(file, before, after)
  // React qualification admits no executable/product change, including Node images.
  const body = value => value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  assert.equal(file.endsWith('.md') ? body(after) : after, file.endsWith('.md') ? body(before) : before, 'React qualification cannot change product or deployment behavior')
}

export function assertQualificationProductDeltaFromGit(name, file, beforeRef, afterRef, options) {
  assert.equal(beforeRef, qualificationCase(name).baseline, 'Product comparison must use the case baseline')
  const blob = ref => execFileSync('git', ['show', `${ref}:${file}`], {
    ...options, encoding: 'utf8', env: { ...options?.env, GIT_NO_LAZY_FETCH: '1' },
  })
  assertQualificationProductDelta(name, file, blob(beforeRef), blob(afterRef))
}
