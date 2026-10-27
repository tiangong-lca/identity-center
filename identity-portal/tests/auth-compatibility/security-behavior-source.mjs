import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { SECURITY_BASELINE, SECURITY_ORIGINAL_ASSETS, SECURITY_UPSTREAM } from './security-case.mjs'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function securitySanitizerModules(app, variant, binding, parserFile) {
  assert.ok(['baseline','candidate'].includes(variant))
  const { default: ts } = await import('typescript')
  const parserBytes = fs.readFileSync(parserFile)
  assert.equal(hash(parserBytes), binding.parserSha256, 'Exact source-bound parser required')
  const parser = await import(pathToFileURL(parserFile).href)
  const root = fs.realpathSync(path.join(app,'node_modules/monaco-editor'))
  let provenance = null
  if (variant === 'candidate') {
    const bytes = fs.readFileSync(path.join(app,'patches/monaco-editor@0.55.1.provenance.json'))
    assert.equal(hash(bytes),binding.assets.provenanceSha256,'Behavior provenance must match exact committed bytes')
    provenance = JSON.parse(bytes)
  }
  assert.deepEqual(binding.assets.assets.map(x=>x.path).sort(), Object.keys(SECURITY_ORIGINAL_ASSETS).sort())
  return Object.entries(SECURITY_ORIGINAL_ASSETS).map(([relative,oldHash]) => {
    const bytes = fs.readFileSync(path.join(root,relative)); const observed = hash(bytes)
    const expected = binding.assets.assets.find(x=>x.path===relative)
    assert.equal(observed, expected.sha256, 'Actual behavior asset must match installed-byte receipt')
    if (variant === 'baseline') assert.equal(observed,oldHash)
    const text=bytes.toString()
    if (relative.startsWith('esm/')) return { path:relative,sha256:observed,execution:'actual-esm-default',module:text }
    let libraryModule
    if (variant==='baseline') {
      const span=parser.analyzeAmd(text)
      libraryModule=`const sanitizer=(()=>{${text.slice(span.start,span.end)};return ${span.bridge};})();export default sanitizer;`
    } else {
      const proof=provenance.assets.find(x=>x.path===relative)
      assert.equal(proof.patchedSha256,observed);assert.equal(proof.upstreamSha256,SECURITY_UPSTREAM)
      const source=ts.createSourceFile('actual-installed.js',text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS)
      assert.equal(source.parseDiagnostics.length,0)
      const matches=[]
      const visit=node=>{if(ts.isVariableStatement(node)&&node.getStart(source)===proof.librarySpan[0])matches.push(node);ts.forEachChild(node,visit)};visit(source)
      assert.equal(matches.length,1,'Require exactly one parsed patched library statement')
      const statement=matches[0];assert.equal(statement.declarationList.declarations.length,1)
      const declaration=statement.declarationList.declarations[0]
      assert.ok(ts.isIdentifier(declaration.name));assert.equal(declaration.name.text,proof.preservedBridge)
      const call=declaration.initializer;assert.ok(call&&ts.isCallExpression(call)&&call.arguments.length===0)
      const expression=ts.isParenthesizedExpression(call.expression)?call.expression.expression:call.expression
      assert.ok(ts.isArrowFunction(expression)&&ts.isBlock(expression.body),'Require actual patched library IIFE')
      assert.equal(hash(text.slice(0,statement.getStart(source))),proof.prefixSha256)
      assert.equal(hash(text.slice(statement.end)),proof.suffixSha256)
      libraryModule=`const sanitizer=${call.getText(source)};export default sanitizer;`
    }
    return {path:relative,sha256:observed,execution:'embedded-library-extraction',module:libraryModule}
  })
}

export function assertSecurityBehavior(summary, variant) {
  const value=summary.securityBehavior
  assert.equal(value?.qualificationCase,'security-audit');assert.equal(value.variant,variant)
  assert.equal(value.source,summary.source,'Behavior source must match exact source variant')
  if(variant==='baseline')assert.equal(value.source,SECURITY_BASELINE)
  assert.equal(value.lockSha256,summary.lockSha256);assert.equal(value.manifestSha256,summary.manifestSha256)
  assert.equal(value.parserSha256,summary.securityParserSha256,'Behavior parser must match qualified source bytes')
  assert.match(value.parserSha256,/^[a-f0-9]{64}$/)
  assert.equal(value.stage,'complete');assert.equal(value.passed,true);assert.equal(value.contextsCreated,3);assert.equal(value.contextsClosed,3)
  assert.deepEqual(value.errors,{page:0,console:0,forbiddenRequests:0})
  assert.ok(Array.isArray(value.sanitizers)&&value.sanitizers.length===3)
  assert.deepEqual(value.sanitizers.map(x=>x.path).sort(),Object.keys(SECURITY_ORIGINAL_ASSETS).sort())
  for(const result of value.sanitizers){
    const actual=summary.securityAssets.assets.find(x=>x.path===result.path);assert.equal(result.sha256,actual.sha256)
    assert.equal(result.execution,result.path.startsWith('esm/')?'actual-esm-default':'embedded-library-extraction')
    assert.deepEqual(result.controls,{hookRan:true,handlerSurvives:variant==='baseline',otherHandlerRemoved:true,validMarkup:true})
  }
  assert.equal(value.zod.version,variant==='baseline'?'4.4.3':'4.6.7')
  for(const field of ['packageSha256','entrySha256','runtimeTreeSha256'])assert.match(value.zod[field],/^[a-f0-9]{64}$/)
  assert.equal(value.zod.format,'commonjs')
  for(const field of ['format','version','packageSha256','entrySha256','runtimeTreeSha256'])assert.equal(value.zod[field],summary.securityZod[field],'Zod behavior must bind actual frozen package bytes')
  assert.ok(Array.isArray(value.zod.modes)&&value.zod.modes.length===2)
  assert.deepEqual(value.zod.modes.map(x=>x.jitless),[true,false])
  for(const mode of value.zod.modes){
    assert.equal(mode.restored,true)
    for(const kind of ['array','set','map']){
      const control=mode[kind];assert.equal(control.valid,true)
      assert.equal(control.parsed,variant==='baseline'?(kind==='map'?6:3):0)
      assert.deepEqual(control.issues,[{origin:kind,code:'too_big',maximum:2,inclusive:true,path:['payload'],message:'owned-size-bound'}])
    }
  }
}
export function assertSecurityBehaviorReceipts(baseline,candidate){assertSecurityBehavior(baseline,'baseline');assertSecurityBehavior(candidate,'candidate')}

export function securityZodIdentity(app) {
  const require=createRequire(path.join(app,'package.json'))
  const entry=require.resolve('zod');const packageFile=require.resolve('zod/package.json');const root=path.dirname(packageFile)
  const files=[];let bytes=0
  const walk=(dir,depth=0)=>{
    assert.ok(depth<=32,'Zod inventory depth exceeded')
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      assert.equal(e.isSymbolicLink(),false,'Refuse Zod package shadow symlink')
      const file=path.join(dir,e.name)
      if(e.isDirectory())walk(file,depth+1)
      else if(e.isFile()&&/\.(?:c?js|mjs)$/.test(e.name)){
        const content=fs.readFileSync(file);bytes+=content.length
        assert.ok(files.length<10000&&bytes<32*1024*1024,'Zod package inventory exceeded')
        files.push([path.relative(root,file).split(path.sep).join('/'),hash(content)])
      }
    }
  }
  walk(root);files.sort(([a],[b])=>a.localeCompare(b))
  return {format:'commonjs',version:JSON.parse(fs.readFileSync(packageFile,'utf8')).version,packageSha256:hash(fs.readFileSync(packageFile)),entrySha256:hash(fs.readFileSync(entry)),runtimeTreeSha256:hash(JSON.stringify(files))}
}
