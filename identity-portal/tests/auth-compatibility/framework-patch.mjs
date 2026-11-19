import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { databaseCase, databaseSource } from './database-case.mjs'

export const frameworkPatchCase = 'next-16.4.6'
export const eslintConfigCase = 'eslint-config-next-16.4.6'
export const frameworkVersion = '16.4.6'

const sources = new Map([
  [frameworkPatchCase, {
    parent: '742b6e1325f37dac2605bb1e482851258326b234',
    manifest: '24bea394241e4544bd1d59c5269b4d3b44daa77519575aa3b763f8851d68c6df',
    lock: 'fb9fe8e39078055fc36fed089f410bb73045a7ac705298d6b1b79971c80e5730',
  }],
  [eslintConfigCase, {
    parent: '1b6e888ec981c786b69556fae8151cbe0348dd65',
    manifest: '27ee774f620581f531bcf95f149e5695c6d37115a4eae0ad64abd556f5902ea9',
    lock: '08ed7d0cfc959d227f23b2e787db4c96e2f3b354b058ef7c052c4960341cfb50',
  }],
])

export function frameworkSource(name) {
  return sources.get(name) ?? (name === databaseCase ? databaseSource : undefined)
}

// Both framework cases inherit the seven original source inputs byte for byte.
export function securityInputsForCase(sourceCase, retainedBytes) {
  const inputs = JSON.parse(retainedBytes.toString())
  if (sourceCase === 'security-audit') return inputs
  const source = frameworkSource(sourceCase)
  assert.ok(source, 'Unknown security qualification source case')
  assert.equal(createHash('sha256').update(retainedBytes).digest('hex'), '3194f3839993cd48ff38ea94345813336da38c05c37186d11e08a609ae04bb74', 'Retain the reviewed security input contract')
  return {
    ...inputs,
    candidateHashes: {
      ...inputs.candidateHashes,
      'identity-portal/package.json': source.manifest,
      'identity-portal/pnpm-lock.yaml': source.lock,
    },
  }
}
