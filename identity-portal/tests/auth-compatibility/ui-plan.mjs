import assert from 'node:assert/strict'
import { qualificationCase } from './qualification-case.mjs'

export function qualificationUiPlan(name, variant) {
  qualificationCase(name)
  assert.ok(['baseline', 'candidate'].includes(variant))
  const fixed = name === 'react19.3-catalog-fixed'
  return { broad: fixed || name === 'react19.3', catalog: fixed || name === 'catalog-yaml' && variant === 'candidate',
    knownDefectiveSkip: name === 'catalog-yaml' && variant === 'baseline' }
}

export function combinedReactUi(name, variant, broad, catalog, errors) {
  assert.equal(name, 'react19.3-catalog-fixed')
  assert.deepEqual(qualificationUiPlan(name, variant), { broad: true, catalog: true, knownDefectiveSkip: false })
  assert.deepEqual(errors, { page: 0, console: 0 })
  assert.equal(broad?.passed, true, 'Broad UI must pass')
  for (const field of ['firstRenderHydration', 'clientNavigation', 'realFormAndReadback', 'radixFocusTrapAndRestore', 'monacoEditAndApply', 'localesAndThemes', 'syntheticDataOnly']) assert.equal(broad[field], true, 'Every broad surface must pass')
  assert.deepEqual(broad.errors, errors)
  assert.equal(catalog?.executed, true, 'Catalog UI must execute in both variants')
  assert.equal(catalog?.passed, true, 'Catalog UI must pass in both variants')
  assert.deepEqual(catalog.errors, errors)
  for (const field of ['schemaWorker', 'keyboardApplyReadback', 'spaDisposalReopen', 'exactBufferRestored', 'syntheticDataOnly']) assert.equal(catalog[field], true)
  assert.equal(catalog.yamlWorkers, 2); assert.equal(catalog.yamlWorkersClosed, 2); assert.equal(catalog.unrecognizedWorkers, 0)
  assert.ok(Array.isArray(catalog.undoSteps) && catalog.undoSteps.length === 2 && catalog.undoSteps.every(value => Number.isInteger(value) && value >= 1 && value <= 8))
  return { qualificationCase: name, variant, executed: true, passed: true, broad, catalog, errors }
}

export function assertFixedReactUiReceipts(baseline, candidate) {
  for (const [variant, summary] of [['baseline', baseline], ['candidate', candidate]]) {
    assert.equal(summary.ui?.executed, true, 'New fixed baseline cannot skip UI')
    const value = combinedReactUi('react19.3-catalog-fixed', variant, summary.ui?.broad, summary.ui?.catalog, summary.ui?.errors)
    assert.deepEqual(summary.ui, value)
  }
}
