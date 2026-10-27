export const workerStages = Object.freeze([
  'configure', 'legacy-links', 'schema-marker', 'links', 'code-action',
  'repair-validation', 'schema-update', 'schema-restore', 'model-disposal', 'complete',
])

export function projectWorkerStage(value) {
  return typeof value === 'string' && workerStages.includes(value) ? value : 'projection-failed'
}
