import { createHash } from 'node:crypto'
import { redactor } from './contract.mjs'

const STAGES = ['unknown', 'login', 'hydration', 'navigation', 'radix', 'organization', 'catalog', 'monaco-load', 'monaco-edit-apply', 'locale-theme'] as const
export type BrowserStage = (typeof STAGES)[number]
const NAMES = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError', 'AbortError', 'SecurityError', 'NetworkError', 'InvalidStateError', 'NotSupportedError', 'DataCloneError', 'Canceled', 'CancellationError'])
const REACT_CODES = new Set([418, 419, 421, 422, 423, 424, 425, 426])
const MAX_SAMPLES = 8
const MAX_BYTES = 8192
const METADATA_RESERVE = 512

type Category = 'unclassified' | 'react-minified' | 'module-syntax' | 'module-load' | 'worker-start' | 'null-property' | 'not-callable' | 'unexpected-usage' | 'cancelled' | 'disposed' | 'projection-failed'
type Frame = { asset: string; line: number; column: number }
type Projection = { observedDuring: BrowserStage; name: string; category: Category; reactCode?: number; frames: Frame[] }
type Sample = Projection & { fingerprint: string }

function category(message: string): { category: Category; reactCode?: number } {
  const react = /^Minified React error #([1-9][0-9]{0,4});/.exec(message)
  if (react) return { category: 'react-minified', ...(REACT_CODES.has(Number(react[1])) ? { reactCode: Number(react[1]) } : {}) }
  if (message === 'Unexpected usage') return { category: 'unexpected-usage' }
  if (/^Cannot use import statement outside a module$|^Unexpected token ['"](?:export|import|<)['"]$/.test(message)) return { category: 'module-syntax' }
  if (/^Failed to fetch dynamically imported module:|^Importing a module script failed|^Loading chunk [0-9]+ failed/.test(message)) return { category: 'module-load' }
  if (/^Failed to construct 'Worker':|^Worker initialization failed/.test(message)) return { category: 'worker-start' }
  if (/^Cannot (?:read|set) properties of (?:null|undefined)(?: |$)/.test(message)) return { category: 'null-property' }
  if (/ is not a function$/.test(message)) return { category: 'not-callable' }
  if (/^(?:Canceled|Cancelled|CancellationError)$/.test(message)) return { category: 'cancelled' }
  if (/^(?:Model|Editor|Worker) is disposed$/.test(message)) return { category: 'disposed' }
  return { category: 'unclassified' }
}

function trustedAsset(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 240 && path.startsWith('/_next/static/') &&
    /^\/[A-Za-z0-9_./\[\]()@+-]+\.js$/.test(path) && !path.split('/').includes('..')
}

export function createBrowserDiagnostics(context: { portalOrigin: string; builtAssetPaths: string[]; secrets: string[] }) {
  const secrets = context.secrets.filter(value => typeof value === 'string' && value.length > 0)
  const scrub = redactor([...secrets, ...secrets.map(value => encodeURIComponent(value))])
  const assets = new Set(context.builtAssetPaths.slice(0, 2048).filter(path => trustedAsset(path) && scrub(path) === path))
  let origin = ''
  try {
    const url = new URL(context.portalOrigin)
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/') origin = url.origin
  } catch { /* Invalid configuration permits no frame locations. */ }
  let observedDuring: BrowserStage = 'login'
  let totalObserved = 0
  let projectionFailures = 0
  let droppedSamples = 0
  let retainedBytes = 0
  const samples: Sample[] = []

  const frames = (stack: string): Frame[] => {
    const result: Frame[] = []
    const seen = new Set<string>()
    for (const text of stack.split(/\r?\n/).slice(0, 16)) {
      if (!text.trimStart().startsWith('at ') || /\b(?:blob|data|file):|\beval\b/.test(text)) continue
      const match = /(https?:\/\/[^\s)]+):([0-9]{1,9}):([0-9]{1,9})(?:\)|\s|$)/.exec(text)
      if (!match) continue
      try {
        const url = new URL(match[1])
        const asset = decodeURIComponent(url.pathname)
        const line = Number(match[2]); const column = Number(match[3])
        if (!origin || url.origin !== origin || url.username || url.password || url.search || url.hash || !assets.has(asset) || line < 1 || column < 1 || line > 10_000_000 || column > 10_000_000) continue
        const frame = { asset, line, column }; const key = JSON.stringify(frame)
        if (!seen.has(key)) { result.push(frame); seen.add(key) }
        if (result.length === 3) break
      } catch { /* Unrecognized locations are discarded, never persisted. */ }
    }
    return result
  }

  const retain = (sample: Sample) => {
    const bytes = Buffer.byteLength(JSON.stringify(sample), 'utf8')
    if (samples.length === MAX_SAMPLES || retainedBytes + bytes > MAX_BYTES - METADATA_RESERVE) { droppedSamples++; return }
    retainedBytes += bytes
    samples.push(sample)
  }

  return {
    setStage(stage: BrowserStage) { observedDuring = STAGES.includes(stage) ? stage : 'unknown' },
    record(error: unknown) {
      totalObserved++
      try {
        const input = error && typeof error === 'object' ? error as Record<string, unknown> : {}
        const rawName = input.name; const rawMessage = input.message; const rawStack = input.stack
        const name = typeof rawName === 'string' ? scrub(rawName.slice(0, 128)) : ''
        const message = typeof rawMessage === 'string' ? scrub(rawMessage.slice(0, 8192)) : ''
        const stack = typeof rawStack === 'string' ? scrub(rawStack.slice(0, 16_384)) : ''
        // No residual message, function name, URL or stack prose enters a receipt.
        // Unrecognized opaque/short/encoded values are discarded structurally.
        const projection: Projection = { observedDuring, name: NAMES.has(name) ? name : 'OtherError', ...category(message), frames: frames(stack) }
        retain({ ...projection, fingerprint: createHash('sha256').update(JSON.stringify(projection)).digest('hex') })
      } catch {
        projectionFailures++
        retain({ observedDuring, name: 'OtherError', category: 'projection-failed', frames: [], fingerprint: 'unavailable' })
      }
    },
    snapshot() {
      return { totalObserved, projectionFailures, droppedSamples, retainedBytes, maxSamples: MAX_SAMPLES, maxBytes: MAX_BYTES,
        samples: samples.map(sample => ({ ...sample, frames: sample.frames.map(frame => ({ ...frame })) })) }
    },
  }
}

export type BrowserDiagnostics = ReturnType<typeof createBrowserDiagnostics>
