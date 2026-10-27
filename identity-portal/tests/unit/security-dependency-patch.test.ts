import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { analyzeAmd, digest, originals, replaceAsset, upstreamBody, upstreamHash } from '../../scripts/security/monaco-purify-patch.mjs'

const root = path.resolve(__dirname, '../..')
const upstream = fs.readFileSync(path.join(root, 'patches/upstream/dompurify-3.4.17.purify.es.mjs'), 'utf8')
const fixture = (before = '', after = '', bridge = 'var purify = make();') => `define('fixture',['exports'],function(exports){${before}\n/*! @license DOMPurify 3.2.7 */\nconst hidden = 1; function make(){ return {version:'3.2.7', hidden}; } ${bridge}\n${after}\nexports.sanitize=purify;});`

describe('security patch provenance and parsed spans', () => {
 it('rejects oversized constrained collections before element work using public Zod APIs', () => {
  let calls = 0
  const value = z.string().refine(() => { calls++; return true })
  for (const schema of [z.array(value).max(2), z.array(value).length(2)]) {
   const result = schema.safeParse(['a','b','c'])
   expect(result.success).toBe(false)
   if (!result.success) expect(result.error.issues).toHaveLength(1)
   expect(calls).toBe(0)
  }
  const set = z.set(value).max(1).safeParse(new Set(['a','b']))
  const map = z.map(value,value).max(1).safeParse(new Map([['a','a'],['b','b']]))
  expect(set.success).toBe(false); expect(map.success).toBe(false); expect(calls).toBe(0)
  expect(z.array(value).max(2).parse(['a'])).toEqual(['a'])
  expect(calls).toBe(1)
 })
 it('binds trusted upstream and explicitly removes its unrelocated source map directive', () => {
  expect(digest(upstream)).toBe(upstreamHash)
  const parsed = upstreamBody(upstream)
  expect(parsed.defaultBinding).toBe('purify_default')
  expect(parsed.removedMapDirectives).toEqual(['//# sourceMappingURL=purify.es.mjs.map'])
  expect(parsed.body).not.toContain('sourceMappingURL')
  expect(parsed.withoutMap).toContain('export { purify_default as default };')
  expect(() => upstreamBody(upstream.replace('3.4.17','3.4.16'))).toThrow(/Untrusted/)
 })
 it('executes parsed library/bridge analysis and rejects escaping bindings, collisions and unrelated declarators', () => {
  expect(analyzeAmd(fixture()).bridge).toBe('purify')
  expect(() => analyzeAmd(fixture('', 'exports.bad = hidden;'))).toThrow(/escapes/)
  expect(() => analyzeAmd(fixture('const window = {};'))).toThrow(/collision/)
  expect(() => analyzeAmd(fixture('', '', 'var purify = make(), unrelated = 1;'))).toThrow(/unrelated/)
  expect(() => analyzeAmd(fixture().replace('DOMPurify 3.2.7','DOMPurify 3.2.8'))).toThrow()
 })
 it('verifies all three actually installed patched copies and immutable patch bytes', () => {
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'patches/monaco-editor@0.55.1.provenance.json'),'utf8'))
  expect(digest(fs.readFileSync(path.join(root,'patches/monaco-editor@0.55.1.patch')))).toBe(proof.patchSha256)
  expect(proof.assets.map((a: {path: string}) => a.path).sort()).toEqual(Object.keys(originals).sort())
  for (const asset of proof.assets) {
   const bytes = fs.readFileSync(path.join(root,'node_modules/monaco-editor',asset.path))
   expect(digest(bytes)).toBe(asset.patchedSha256)
   expect(bytes.toString()).toContain('DOMPurify 3.4.17')
   expect(bytes.toString()).not.toContain('DOMPurify 3.2.7')
   expect(bytes.toString()).not.toContain('sourceMappingURL')
   expect(asset.privateBindingEscapes).toBe(0)
   expect(() => replaceAsset(asset.path, 'unexpected source', upstream)).toThrow(/Unexpected original/)
  }
 })
 it('retains exact worker APIs and necessary pre-install Docker patch packaging', () => {
  const docker=fs.readFileSync(path.join(root,'deploy/docker/Dockerfile'),'utf8')
  expect(docker.indexOf('COPY patches ./patches')).toBeGreaterThan(docker.indexOf('COPY package.json'))
  expect(docker.indexOf('COPY patches ./patches')).toBeLessThan(docker.indexOf('RUN pnpm install --frozen-lockfile'))
  expect(fs.readFileSync(path.join(root,'.dockerignore'),'utf8').split('\n')).not.toContain('patches')
 })
})
