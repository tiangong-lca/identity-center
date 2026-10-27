import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { createRequire } from 'node:module'
const z=createRequire(import.meta.url)('zod') as typeof import('zod')
import { zodControl, executeSecurityBehavior } from '../auth-compatibility/security-behavior'
import { SECURITY_BASELINE, SECURITY_ORIGINAL_ASSETS } from '../auth-compatibility/security-case.mjs'
import { assertSecurityBehavior, assertSecurityBehaviorReceipts, securitySanitizerModules, securityZodIdentity } from '../auth-compatibility/security-behavior-source.mjs'
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')

function summary(variant:'baseline'|'candidate') {
  const assets=Object.entries(SECURITY_ORIGINAL_ASSETS).map(([p,h])=>({path:p,sha256:variant==='baseline'?h:'a'.repeat(64)}))
  const source=variant==='baseline'?SECURITY_BASELINE:'b'.repeat(40)
  const work=(kind:string)=>({parsed:variant==='baseline'?(kind==='map'?6:3):0,issues:[{origin:kind,code:'too_big',maximum:2,inclusive:true,path:['payload'],message:'owned-size-bound'}],valid:true})
  const identity={format:'commonjs',version:variant==='baseline'?'4.4.3':'4.6.7',entryPath:'index.cjs',esmEntryPath:'index.js',packageSha256:'e'.repeat(64),entrySha256:'f'.repeat(64),esmEntrySha256:'b'.repeat(64),runtimeTreeSha256:'a'.repeat(64)}
  const modes=[true,false].map(jitless=>({jitless,restored:true,array:work('array'),set:work('set'),map:work('map')}))
  const zod={...identity,modes,formats:[{...identity,modes:structuredClone(modes)},{...identity,format:'module',entryPath:'index.js',entrySha256:'b'.repeat(64),modes:structuredClone(modes)}]}
  return {source,manifestSha256:'c'.repeat(64),lockSha256:'d'.repeat(64),securityAssets:{assets},securityParserSha256:'e'.repeat(64),securityZod:identity,securityBehavior:{qualificationCase:'security-audit',variant,source,parserSha256:'e'.repeat(64),manifestSha256:'c'.repeat(64),lockSha256:'d'.repeat(64),stage:'complete',passed:true,contextsCreated:3,contextsClosed:3,errors:{page:0,console:0,forbiddenRequests:0},sanitizers:assets.map(a=>({...a,execution:a.path.startsWith('esm/')?'actual-esm-default':'embedded-library-extraction',controls:{hookRan:true,handlerSurvives:variant==='baseline',otherHandlerRemoved:true,validMarkup:true}})),zod}}

}

it('requires complete exact-source behavior from both variants, preserving expected vulnerable controls separately',()=>{
  expect(()=>assertSecurityBehaviorReceipts(summary('baseline'),summary('candidate'))).not.toThrow()
  const mutations=[
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.passed=false},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.source='e'.repeat(40)},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.variant='baseline'},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.lockSha256='f'.repeat(64)},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.parserSha256='0'.repeat(64)},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.contextsClosed=2},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.sanitizers.pop()},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.sanitizers[1].path=s.securityBehavior.sanitizers[0].path},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.sanitizers[0].sha256='f'.repeat(64)},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.sanitizers[1].execution='actual-esm-default'},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.sanitizers[0].controls.handlerSurvives=true},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.modes[0].array.parsed=3},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.runtimeTreeSha256='0'.repeat(64)},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.formats.pop()},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.formats[1].format='commonjs'},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.formats[1].entrySha256='0'.repeat(64)},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.formats[1].modes[0].array.parsed=3},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.modes[1].map.issues=[]},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.zod.modes[1].restored=false},
    (s:ReturnType<typeof summary>)=>{s.securityBehavior.errors.forbiddenRequests=1},
  ]
  for(const mutate of mutations){const candidate=summary('candidate');mutate(candidate);expect(()=>assertSecurityBehaviorReceipts(summary('baseline'),candidate)).toThrow()}
  const baseline=summary('baseline');baseline.securityBehavior.sanitizers[0].controls.handlerSurvives=false
  expect(()=>assertSecurityBehavior(baseline,'baseline')).toThrow()
  expect(()=>assertSecurityBehaviorReceipts({},summary('candidate'))).toThrow()
})

it('extracts every actual installed candidate library through parsed source-bound module boundaries, without a browser',async()=>{
  const app=path.resolve(__dirname,'../..');const provenance=JSON.parse(fs.readFileSync(path.join(app,'patches/monaco-editor@0.55.1.provenance.json'),'utf8'))
  const parser=path.join(app,'scripts/security/monaco-purify-patch.mjs');const binding={parserSha256:hash(fs.readFileSync(parser)),assets:{provenanceSha256:hash(fs.readFileSync(path.join(app,'patches/monaco-editor@0.55.1.provenance.json'))),assets:provenance.assets.map((a:{path:string;patchedSha256:string})=>({path:a.path,sha256:a.patchedSha256}))}}
  const modules=await securitySanitizerModules(app,'candidate',binding,parser)
  expect(modules).toHaveLength(3)
  for(const libraryModule of modules){const source=ts.createSourceFile('trusted-fixture.mjs',libraryModule.module,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);expect(ts.transpileModule(libraryModule.module,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).diagnostics??[]).toHaveLength(0);expect(source.statements.some(ts.isExportAssignment)||source.statements.some(ts.isExportDeclaration)).toBe(true);expect(libraryModule.execution).toBe(libraryModule.path.startsWith('esm/')?'actual-esm-default':'embedded-library-extraction')}
  await expect(securitySanitizerModules(app,'candidate',{...binding,parserSha256:'0'.repeat(64)},parser)).rejects.toThrow('Exact source-bound parser')
  const changed=structuredClone(binding);changed.assets.assets[0].sha256='0'.repeat(64)
  await expect(securitySanitizerModules(app,'candidate',changed,parser)).rejects.toThrow('Actual behavior asset')
})

it('executes the actual browser source hook before listener detachment and logout using inert async controls',async()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../auth-compatibility/browser.proof.spec.ts'),'utf8')
  const start=source.indexOf("      if (c.qualificationCase === 'security-audit') {")
  const end=source.indexOf("    const callbackFile",start)
  expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start)
  const code=source.slice(start,end).replace(/    } else if \(plan\.knownDefectiveSkip\)[\s\S]*?\n    await admin/,'\n    await admin')
  const events:string[]=[];const errors={page:0,console:0};const deps={expect,errors,c:{qualificationCase:'security-audit',userId:'synthetic'},page:{off:()=>events.push('detach')},pageError:()=>{},consoleError:()=>{},qualifySecurityBehavior:async()=>{await Promise.resolve();events.push('behavior')},admin:{logoutUserSessions:async()=>events.push('logout')}}
  const emitted=ts.transpileModule(`async function invoke(){${code}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
  await new Function(...Object.keys(deps),emitted+';return invoke()')(...Object.values(deps))
  expect(events).toEqual(['behavior','detach','detach','logout'])
  events.length=0
  deps.qualifySecurityBehavior=async()=>{events.push('behavior');errors.page++}
  await expect(new Function(...Object.keys(deps),emitted+';return invoke()')(...Object.values(deps))).rejects.toThrow()
  expect(events).toEqual(['behavior'])
})

it('executes actual final security runner comparison in an inert subprocess and rejects missing or wrong-source receipt',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../auth-compatibility/run.mjs'),'utf8')
  const start=source.indexOf("    if (selectedCase.name === 'security-audit') {\n      assertSecurityUiReceipts")
  const end=source.indexOf('    const comparison',start)
  expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start)
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'identity48-behavior-wiring-'))
  try{
    const script=path.join(root,'inert.mjs');const moduleUrl=new URL('../auth-compatibility/security-behavior-source.mjs',import.meta.url).href
    fs.writeFileSync(script,`import {assertSecurityBehaviorReceipts} from ${JSON.stringify(moduleUrl)};const selectedCase={name:'security-audit'};const assertSecurityUiReceipts=()=>{};const baseline=${JSON.stringify(summary('baseline'))};const candidate=${JSON.stringify(summary('candidate'))};if(process.argv[2]==='missing')delete candidate.securityBehavior;if(process.argv[2]==='wrong')candidate.securityBehavior.source='f'.repeat(40);${source.slice(start,end)};console.log('inert-security-comparison-passed');`)
    expect(execFileSync(process.execPath,[script],{encoding:'utf8'}).trim()).toBe('inert-security-comparison-passed')
    for(const control of ['missing','wrong'])expect(()=>execFileSync(process.execPath,[script,control],{encoding:'utf8',stdio:'pipe'})).toThrow()
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})

it('uses the actual own frozen Zod public object schemas in both jitless modes and restores config',()=>{
  const app=path.resolve(__dirname,'../..');const before={...z.config(),jitless:z.config().jitless};const identity=securityZodIdentity(app)
  expect(identity.version).toBe('4.6.7')
  const actual=zodControl(app,identity)
  expect(actual.modes.map(mode=>mode.jitless)).toEqual([true,false])
  for(const mode of actual.modes){
    expect(mode.restored).toBe(true)
    for(const kind of ['array','set','map'] as const)expect(mode[kind]).toEqual({parsed:0,issues:[{origin:kind,code:'too_big',maximum:2,inclusive:true,path:['payload'],message:'owned-size-bound'}],valid:true})
  }
  for(const key of new Set([...Object.keys(before),...Object.keys(z.config())]))expect(z.config()[key as keyof ReturnType<typeof z.config>]).toBe(before[key as keyof typeof before])
  expect(()=>zodControl(app,{...identity,entrySha256:'0'.repeat(64)})).toThrow('Zod must execute the source-bound frozen package')
  for(const key of new Set([...Object.keys(before),...Object.keys(z.config())]))expect(z.config()[key as keyof ReturnType<typeof z.config>]).toBe(before[key as keyof typeof before])
})

it('actual assembly validates and writes the SAME receipt snapshot with inert contexts and real Node controls',async()=>{
  const app=path.resolve(__dirname,'../..');const source=summary('candidate');const identity=securityZodIdentity(app)
  const c={qualificationCase:'security-audit',variant:'candidate',portalOrigin:'http://localhost:21002',nonce:'a'.repeat(20),securityBinding:{source:source.source,manifestSha256:source.manifestSha256,lockSha256:source.lockSha256,parserSha256:source.securityParserSha256,assets:source.securityAssets,zod:identity}} as unknown as ReturnType<typeof import('../auth-compatibility/fixture').fixture>
  let created=0;let closed=0;let validated:unknown;let written:unknown
  const portal={context:()=>({browser:()=>({newContext:async()=>{created++;return {route:async()=>{},newPage:async()=>({on:()=>{},goto:async()=>{},evaluate:async()=>({hookRan:true,handlerSurvives:false,otherHandlerRemoved:true,validMarkup:true})}),close:async()=>{closed++}}}})})} as unknown as Parameters<typeof executeSecurityBehavior>[0]
  const deps={modules:async()=>source.securityBehavior.sanitizers.map(a=>({...a,module:'export default {}'})),zod:zodControl,validate:(s:Parameters<typeof assertSecurityBehavior>[0],v:string)=>{assertSecurityBehavior(s,v);validated=s.securityBehavior},write:(_name:string,data:unknown)=>{written=data}}
  await executeSecurityBehavior(portal,c,app,deps)
  expect(created).toBe(3);expect(closed).toBe(3);expect(written).toBe(validated)
  expect((written as {parserSha256:string}).parserSha256).toBe(source.securityParserSha256)
  expect((written as {zod:{formats:unknown[]}}).zod.formats).toHaveLength(2)
  created=0;closed=0
  const missing=structuredClone(c);delete (missing.securityBinding as unknown as Record<string,unknown>).parserSha256
  await expect(executeSecurityBehavior(portal,missing,app,deps)).rejects.toThrow('Required exact behavior source binding')
  expect(created).toBe(0);expect(closed).toBe(0)
})
