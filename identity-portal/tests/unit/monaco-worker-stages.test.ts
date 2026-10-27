import { expect, it } from 'vitest'
import { projectWorkerStage, workerStages } from '../monaco-worker/stages.mjs'

it('retains only the fixed bounded worker substage vocabulary', () => {
  expect(workerStages.length).toBe(10)
  for (const stage of workerStages) expect(projectWorkerStage(stage)).toBe(stage)
})

it('never exports unknown, URL-like, oversized or object diagnostic input', () => {
  for (const value of ['https://user:synthetic-secret@invalid/?token=synthetic-secret', 'x'.repeat(10_000), undefined, null, 3, {
    toString() { throw new Error('must not coerce') },
  }]) {
    expect(projectWorkerStage(value)).toBe('projection-failed')
  }
})
