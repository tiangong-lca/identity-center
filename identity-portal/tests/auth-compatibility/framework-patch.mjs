import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// The original security-audit case keeps its own manifest and lock bindings.
export const frameworkPatchCase = 'next-16.4.6'
export const frameworkVersion = '16.4.6'
export const frameworkParent = '742b6e1325f37dac2605bb1e482851258326b234'

// For the new case, bind the entire prior input contract before substituting
// the two independently reviewed inputs. The other seven bindings stay exact.
export function securityInputsForCase(sourceCase, retainedBytes) {
  const inputs = JSON.parse(retainedBytes.toString())
  if (sourceCase === 'security-audit') return inputs
  assert.equal(sourceCase, frameworkPatchCase, 'Unknown security qualification source case')
  assert.equal(createHash('sha256').update(retainedBytes).digest('hex'), '3194f3839993cd48ff38ea94345813336da38c05c37186d11e08a609ae04bb74', 'Retain the reviewed security input contract')
  return {
    ...inputs,
    candidateHashes: {
      ...inputs.candidateHashes,
      'identity-portal/package.json': '24bea394241e4544bd1d59c5269b4d3b44daa77519575aa3b763f8851d68c6df',
      'identity-portal/pnpm-lock.yaml': 'fb9fe8e39078055fc36fed089f410bb73045a7ac705298d6b1b79971c80e5730',
    },
  }
}
