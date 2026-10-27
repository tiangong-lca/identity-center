import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { emittedBrowserAssetPaths } from './browser-assets.mjs'

// Versioned Turbopack constructor contract; derive from this owned build, never
// hardcode local filenames or retain a live Worker URL/fragment.
export function emittedYamlWorker(app) {
  const assets = emittedBrowserAssetPaths(app)
  const contents = new Map(assets.map(asset => [asset, fs.readFileSync(path.join(app, '.next', asset.slice('/_next/'.length)), 'utf8')]))
  const found = new Map()
  for (const source of contents.values()) {
    for (const match of source.matchAll(/\.f\(("static\/chunks\/turbopack-worker-[A-Za-z0-9_-]+\.js"),(\[[^\]\r\n]{1,8192}\])\)/g)) {
      const bootstrap = `/_next/${JSON.parse(match[1])}`
      const chunks = JSON.parse(match[2]).map(value => `/_next/${value}`)
      if (!contents.has(bootstrap) || chunks.length < 1 || chunks.length > 16 || chunks.some(value => !contents.has(value))) continue
      if (!chunks.some(value => contents.get(value).includes('getConvertToBooleanActions') && contents.get(value).includes('findLinks'))) continue
      const descriptor = { bootstrap, chunks: chunks.reverse(), digests: Object.fromEntries([bootstrap, ...chunks].map(asset => [asset, createHash('sha256').update(contents.get(asset)).digest('hex')])) }
      found.set(JSON.stringify(descriptor), descriptor)
    }
  }
  assert.equal(found.size, 1, 'Require one exact emitted YAML worker constructor')
  return [...found.values()][0]
}

export function classifyYamlWorker(value, origin, descriptor) {
  try {
    if (typeof value !== 'string' || value.length > 8192 || !descriptor || !Array.isArray(descriptor.chunks)) return 'unrecognized'
    const url = new URL(value)
    if (url.origin !== origin || url.username || url.password || url.search || url.pathname !== descriptor.bootstrap || !url.hash.startsWith('#params=')) return 'unrecognized'
    const tuple = JSON.parse(decodeURIComponent(url.hash.slice(8)))
    if (!Array.isArray(tuple) || tuple.length !== 5 || !Array.isArray(tuple[0]) || tuple[0].length > 16 || tuple[1] !== '' || tuple[2] !== '/_next/' || ![null, ''].includes(tuple[3]) || ![null, ''].includes(tuple[4])) return 'unrecognized'
    const chunks = tuple[0].map(value => {
      if (typeof value !== 'string') throw Error('Invalid emitted path')
      const chunk = new URL(value, origin)
      if (chunk.origin !== origin || chunk.username || chunk.password || chunk.search || chunk.hash || !/^\/_next\/static\/[A-Za-z0-9_./-]+\.js$/.test(chunk.pathname)) throw Error('Invalid emitted path')
      return chunk.pathname
    })
    return JSON.stringify(chunks) === JSON.stringify(descriptor.chunks) ? 'yaml' : 'other'
  } catch { return 'unrecognized' }
}
