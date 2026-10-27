import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { SECURITY_BASELINE, SECURITY_ORIGINAL_ASSETS, SECURITY_UPSTREAM } from './security-case.mjs'
function nodeEval(app,code){try{return execFileSync(process.execPath,['--input-type=module','--eval',code],{cwd:app,encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe'],env:nodeEnvironment()})}catch{throw new Error('Owned Zod source operation failed')}}
const nodeEnvironment=()=>Object.fromEntries(['PATH','LANG','TZ'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]))
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
      assert.deepEqual(ts.transpileModule(text,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).diagnostics??[],[],'Actual asset must parse through public diagnostics')
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
  assert.ok(Array.isArray(value.zod.formats)&&value.zod.formats.length===2,'Both public Zod formats must execute')
  assert.deepEqual(value.zod.formats.map(x=>x.format),['commonjs','module'])
  for(const format of value.zod.formats){
    for(const field of ['version','packageSha256','runtimeTreeSha256'])assert.equal(format[field],summary.securityZod[field])
    assert.equal(format.entryPath,format.format==='commonjs'?summary.securityZod.entryPath:summary.securityZod.esmEntryPath,'Actual executed format entry path required')
    assert.equal(format.entrySha256,format.format==='commonjs'?summary.securityZod.entrySha256:summary.securityZod.esmEntrySha256,'Actual executed format entry must match source-bound resolution')
    assert.deepEqual(format.modes,value.zod.modes,'Both formats require identical exact controls')
  }
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

export function securityZodIdentity(app,format='commonjs',resolvedEntry) {
  const require=createRequire(path.join(app,'package.json'))
  const entry=format==='module'?fileURLToPath(resolvedEntry):require.resolve('zod');const packageFile=require.resolve('zod/package.json');const root=path.dirname(packageFile)
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
  const esmEntry=format==='commonjs'?fileURLToPath(nodeEval(app,"process.stdout.write(import.meta.resolve('zod'))").trim()):null
  assert.ok(fs.realpathSync(entry).startsWith(fs.realpathSync(root)+path.sep),'Zod entry must belong to selected package')
  return {format,...(esmEntry?{esmEntryPath:path.relative(root,esmEntry).split(path.sep).join('/'),esmEntrySha256:hash(fs.readFileSync(esmEntry))}:{}),entryPath:path.relative(root,entry).split(path.sep).join('/'),version:JSON.parse(fs.readFileSync(packageFile,'utf8')).version,packageSha256:hash(fs.readFileSync(packageFile)),entrySha256:hash(fs.readFileSync(entry)),runtimeTreeSha256:hash(JSON.stringify(files))}
}

/** @typedef {{parsed:number,issues:object[],valid:boolean}} SecurityCollectionResult */
/** @typedef {{jitless:boolean,restored:boolean,array:SecurityCollectionResult,set:SecurityCollectionResult,map:SecurityCollectionResult}} SecurityModeResult */
/** @returns {SecurityModeResult[]} */
export function securityZodModes(z) {
  const modes=[]
  for(const jitless of [true,false]){
    const previous={...z.config(),jitless:z.config().jitless};/** @type {Record<string, unknown>} */ const result={jitless}
    try{
      z.config({jitless})
      for(const kind of ['array','set','map']){
        let parsed=0;const item=z.string().superRefine(()=>{parsed++})
        const schema=kind==='array'?z.array(item).max(2,'owned-size-bound'):kind==='set'?z.set(item).max(2,'owned-size-bound'):z.map(item,item).max(2,'owned-size-bound')
        const values=['a','b','c'];const input=kind==='array'?values:kind==='set'?new Set(values):new Map(values.map(v=>[v,v]))
        const container=z.object({payload:schema});const invalid=container.safeParse({payload:input});assert.equal(invalid.success,false)
        const issues=invalid.error.issues;const work=parsed
        const valid=container.safeParse({payload:kind==='array'?['ok']:kind==='set'?new Set(['ok']):new Map([['ok','ok']])});const data=valid.success?valid.data.payload:null
        result[kind]={parsed:work,issues,valid:kind==='array'?Array.isArray(data)&&data.length===1&&data[0]==='ok':kind==='set'?data instanceof Set&&data.size===1&&data.has('ok'):data instanceof Map&&data.size===1&&data.get('ok')==='ok'}
      }
    }finally{
      const keys=new Set([...Object.keys(previous),...Object.keys(z.config())]);z.config(Object.fromEntries([...keys].map(key=>[key,previous[key]])))
      for(const key of keys)assert.equal(z.config()[key],previous[key]);result.restored=true
    }
    modes.push(result)
  }
  return modes
}
export function securityZodBothFormats(app,expected) {
  const identity=securityZodIdentity(app);assert.deepEqual(identity,expected,'Zod must execute the source-bound frozen package')
  const require=createRequire(path.join(app,'package.json'));const cjs={...identity,modes:securityZodModes(require('zod'))}
  const code=`import {securityZodIdentity,securityZodModes} from ${JSON.stringify(import.meta.url)};const z=await import('zod');const entry=import.meta.resolve('zod');process.stdout.write(JSON.stringify({...securityZodIdentity(process.cwd(),'module',entry),modes:securityZodModes(z)}));`
  let moduleResult
  try{moduleResult=JSON.parse(execFileSync(process.execPath,['--input-type=module','--eval',code],{cwd:app,encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe'],env:nodeEnvironment()}))}catch{throw new Error('Owned ESM Zod behavior failed')}
  assert.equal(moduleResult.format,'module');assert.equal(moduleResult.entrySha256,identity.esmEntrySha256)
  return {...cjs,formats:[cjs,moduleResult]}
}
export function assertSecurityBehaviorBinding(c) {
  assert.equal(c.qualificationCase,'security-audit');assert.ok(['baseline','candidate'].includes(c.variant));const b=c.securityBinding
  assert.ok(b,'Security behavior source binding required');assert.match(b.source,/^[a-f0-9]{40}$/)
  if(c.variant==='baseline')assert.equal(b.source,SECURITY_BASELINE)
  for(const key of ['manifestSha256','lockSha256','parserSha256'])assert.match(b[key],/^[a-f0-9]{64}$/,'Required exact behavior source binding')
  for(const key of ['packageSha256','entrySha256','esmEntrySha256','runtimeTreeSha256'])assert.match(b.zod?.[key],/^[a-f0-9]{64}$/,'Required both-format Zod source binding')
  assert.deepEqual(b.assets.assets.map(x=>x.path).sort(),Object.keys(SECURITY_ORIGINAL_ASSETS).sort())
  return b
}
export function securityBehaviorSnapshot(c,state) {
  const binding=assertSecurityBehaviorBinding(c)
  return JSON.parse(JSON.stringify({qualificationCase:'security-audit',variant:c.variant,source:binding.source,manifestSha256:binding.manifestSha256,lockSha256:binding.lockSha256,parserSha256:binding.parserSha256,...state}))
}
