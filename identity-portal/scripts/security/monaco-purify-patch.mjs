import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
export const digest = value => createHash('sha256').update(value).digest('hex')
export const upstreamHash = '60c5d5ccbb466de3de3ba863461a92bf134f8c156cef7992da43e0f659bc5cbd'
export const originals = {
 'esm/vs/base/browser/dompurify/dompurify.js': '9b2835fc7de5bd37faff156e83bf060067577a1f09c6620d9f37d5fa5e5970b1',
 'dev/vs/editor.api-CykLys8L.js': 'abdd0cc9b9e1c38e5ac610bd6ab98704994e0fd14b6318550e9dba6ed08fb1cf',
 'min/vs/editor.api-CalNCsUg.js': 'c10d0058fe0ee5d2c46c3b6cbb28474407be5d45ada35973f3230561f82c4de5',
}
function parsed(text) {
 const options = { allowJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.ESNext }
 const source = ts.createSourceFile('asset.js', text, options.target, true, ts.ScriptKind.JS)
 assert.equal(source.parseDiagnostics.length, 0, 'Asset parse failed')
 const host = ts.createCompilerHost(options)
 host.getSourceFile = name => name === 'asset.js' ? source : undefined
 host.fileExists = name => name === 'asset.js'
 host.readFile = name => name === 'asset.js' ? text : undefined
 const program = ts.createProgram(['asset.js'], options, host)
 return { source, checker: program.getTypeChecker() }
}
function names(name) {
 if (ts.isIdentifier(name)) return [name]
 if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) return name.elements.flatMap(x => ts.isBindingElement(x) ? names(x.name) : [])
 return []
}
function declarations(statements) {
 return statements.flatMap(s => ts.isFunctionDeclaration(s) && s.name ? [s.name] : ts.isVariableStatement(s) ? s.declarationList.declarations.flatMap(d => names(d.name)) : [])
}
function walk(node, visit) { visit(node); ts.forEachChild(node, n => walk(n, visit)) }
export function upstreamBody(upstream) {
 assert.equal(digest(upstream), upstreamHash, 'Untrusted upstream bytes')
 const { source, checker } = parsed(upstream)
 assert.equal(source.statements.filter(ts.isImportDeclaration).length, 0)
 const exports = source.statements.filter(ts.isExportDeclaration)
 assert.equal(exports.length, 1)
 assert.equal(exports[0].getText(source), 'export { purify_default as default };')
 const defaultBinding = exports[0].exportClause.elements[0].propertyName.text
 const freeGlobals = new Set()
 walk(source, node => {
  if (!ts.isIdentifier(node)) return
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === node || ts.isPropertyAssignment(parent) && parent.name === node || ts.isMethodDeclaration(parent) && parent.name === node || ts.isBindingElement(parent) && parent.propertyName === node || ts.isExportSpecifier(parent) || ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) return
  const symbol = ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node)
  if (!symbol) freeGlobals.add(node.text)
 })
 const maps = upstream.match(/^\/\/# sourceMappingURL=.*$/gm) ?? []
 assert.equal(maps.length, 1, 'Expected explicit upstream map policy')
 const body = (upstream.slice(0, exports[0].getStart(source)) + upstream.slice(exports[0].end)).replace(/^\/\/# sourceMappingURL=.*\n?$/gm, '')
 assert.ok(!body.includes('sourceMappingURL'))
 return { body, defaultBinding, freeGlobals: [...freeGlobals].sort(), withoutMap: upstream.replace(/^\/\/# sourceMappingURL=.*\n?$/gm, ''), removedMapDirectives: maps }
}
export function analyzeAmd(original, freeGlobals = ['window','document','Object','Array','Set']) {
 let start, end, bridge
 assert.equal((original.match(/DOMPurify 3\.2\.7/g) ?? []).length, 1)
  const { source, checker } = parsed(original)
  const at = original.indexOf('/*! @license DOMPurify 3.2.7')
  const wrappers = []
  walk(source, node => {
   if (ts.isFunctionExpression(node) && ts.isBlock(node.body) && node.body.statements.some(s => s.getFullStart() <= at && s.getStart(source) > at)) wrappers.push(node)
  })
  assert.equal(wrappers.length, 1, 'Expected one parsed AMD library container')
  const statements = [...wrappers[0].body.statements]
  const first = statements.findIndex(s => s.getFullStart() <= at && s.getStart(source) > at)
  const factories = statements.slice(first).filter(s => ts.isFunctionDeclaration(s) && /["']3\.2\.7["']/.test(s.getText(source)))
  assert.equal(factories.length, 1, 'Expected one sanitizer factory')
  const factory = factories[0].name.text
  const ends = statements.slice(first).filter(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.initializer && ts.isCallExpression(d.initializer) && ts.isIdentifier(d.initializer.expression) && d.initializer.expression.text === factory))
  assert.equal(ends.length, 1)
  assert.equal(ends[0].declarationList.declarations.length, 1, 'Do not replace unrelated declarators')
  const declaration = ends[0].declarationList.declarations[0]
  assert.ok(ts.isIdentifier(declaration.name)); bridge = declaration.name.text
  start = at; end = ends[0].end
  const libraryStatements = statements.filter(s => s.getStart(source) >= statements[first].getStart(source) && s.end <= end)
  const bound = declarations(libraryStatements)
  const symbols = new Set(bound.filter(n => n.text !== bridge).map(n => checker.getSymbolAtLocation(n)).filter(Boolean))
  let escaped = 0
  walk(source, node => {
   if (!ts.isIdentifier(node) || node.getStart(source) >= start && node.end <= end) return
   const symbol = node.parent && ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node)
   if (symbol && symbols.has(symbol)) escaped++
  })
  assert.equal(escaped, 0, 'Private library binding escapes replacement span')
  // All new private bindings live inside this IIFE; preserve only the parsed old bridge.
  // Free built-in/global names must not resolve to an outer AMD declaration.
  const outer = new Set(declarations(statements.filter(s => !libraryStatements.includes(s))).map(n => n.text))
  for (const name of freeGlobals) assert.ok(!outer.has(name), `Outer global collision: ${name}`)
 return { start, end, bridge }
}
export function replaceAsset(relative, original, upstream) {
 assert.equal(digest(original), originals[relative], 'Unexpected original Monaco asset')
 assert.equal((original.match(/DOMPurify 3\.2\.7/g) ?? []).length, 1)
 assert.ok(!original.includes('sourceMappingURL'), 'Original map needs separate reviewed policy')
 const replacement = upstreamBody(upstream)
 let start = 0, end = original.length, bridge = null, output
 if (relative.startsWith('esm/')) output = replacement.withoutMap
 else {
  ;({ start, end, bridge } = analyzeAmd(original, replacement.freeGlobals))
  const value = `var ${bridge} = (() => {\n${replacement.body}\nreturn ${replacement.defaultBinding};\n})();`
  output = original.slice(0,start) + value + original.slice(end)
  parsed(output)
  assert.equal(digest(original.slice(0,start)), digest(output.slice(0,start)))
  assert.equal(digest(original.slice(end)), digest(output.slice(start+value.length)))
 }
 assert.ok(!output.includes('DOMPurify 3.2.7'))
 assert.equal((output.match(/DOMPurify 3\.4\.17/g) ?? []).length, 1)
 return { output, proof: { path: relative, originalSha256: digest(original), patchedSha256: digest(output), librarySpan: [start,end], spanUnit: 'UTF-16 code units', libraryByteSpan: [Buffer.byteLength(original.slice(0,start)),Buffer.byteLength(original.slice(0,end))], preservedBridge: bridge, prefixSha256: digest(original.slice(0,start)), suffixSha256: digest(original.slice(end)), upstreamSha256: upstreamHash, strippedUpstreamSourceMappingURL: replacement.removedMapDirectives, originalSourceMappingURL: false, privateBindingEscapes: 0, trustedUpstreamFreeGlobals: replacement.freeGlobals } }
}
export function generate(monaco, upstream, outputDirectory) {
 assert.ok(!fs.existsSync(outputDirectory), 'Fresh owned output required')
 fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
 const proofs=[]
 for (const relative of Object.keys(originals)) {
  const original=fs.readFileSync(path.join(monaco,relative),'utf8')
  const result=replaceAsset(relative,original,upstream);proofs.push(result.proof)
  for (const [directory,bytes] of [['old',original],['new',result.output]]) { const dest=path.join(outputDirectory,directory,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes) }
 }
 const diff=spawnSync('git',['diff','--no-index','--no-ext-diff','--','old','new'],{cwd:outputDirectory,encoding:'utf8',maxBuffer:32*1024**2})
 assert.equal(diff.status,1);assert.equal(diff.stderr,'')
 const patch=diff.stdout.split('\n').map(line => /^(diff --git |--- |\+\+\+ )/.test(line) ? line.replaceAll('a/old/','a/').replaceAll('b/new/','b/') : line).join('\n')
 return { patch, provenance: { monacoVersion:'0.55.1', upstreamVersion:'3.4.17', upstreamSha256:upstreamHash, patchSha256:digest(patch), maps:'Explicitly stripped upstream sourceMappingURL; no original Monaco maps/directives existed on these three files. No stale map added.', assets:proofs } }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const [monaco,upstreamFile,outputDirectory]=process.argv.slice(2);assert.ok(monaco&&upstreamFile&&outputDirectory)
 const result=generate(monaco,fs.readFileSync(upstreamFile,'utf8'),outputDirectory)
 fs.writeFileSync(path.join(outputDirectory,'monaco-editor@0.55.1.patch'),result.patch)
 fs.writeFileSync(path.join(outputDirectory,'monaco-editor@0.55.1.provenance.json'),JSON.stringify(result.provenance,null,2)+'\n')
 console.log(JSON.stringify({assets:result.provenance.assets.map(a=>({path:a.path,original:a.originalSha256,patched:a.patchedSha256,bridge:a.preservedBridge})),patchSha256:result.provenance.patchSha256}))
}
