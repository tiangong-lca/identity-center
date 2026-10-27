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
import { assertSecurityBehavior, assertSecurityBehaviorReceipts, securitySanitizerModules, securityZodIdentity, securityParsedSource } from '../auth-compatibility/security-behavior-source.mjs'
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

it('rejects malformed actual JavaScript through public syntax diagnostics without emission',()=>{
  const source=securityParsedSource(ts,'const actual = (() => 1)(); export default actual;')
  expect(source.statements).toHaveLength(2)
  expect(()=>securityParsedSource(ts,'const actual = (() => ;')).toThrow('Actual asset must parse through public diagnostics')
})

function withPlaywrightStage(control:(staged:string,temporary:string,app:string)=>void){
  const app=path.resolve(__dirname,'../..')
  // Playwright excludes node_modules from its TS loader. Use an owned ignored
  // output subdirectory so this exercises the same transform as hosted sources.
  const cache=path.join(app,'.next');fs.mkdirSync(cache,{recursive:true})
  const temporary=fs.mkdtempSync(path.join(cache,'identity48-collection-'))
  const staged=path.join(temporary,'app');fs.mkdirSync(staged)
  const copied=new Set<string>()
  const copy=(relative:string)=>{
    if(copied.has(relative))return
    copied.add(relative)
    const bytes=fs.readFileSync(path.join(app,relative));const target=path.join(staged,relative)
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes)
    if(!/\.(?:[cm]?ts|tsx|[cm]?js)$/.test(relative))return
    const tree=ts.createSourceFile(relative,bytes.toString(),ts.ScriptTarget.ESNext,true)
    for(const statement of tree.statements){
      if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier))continue
      const specifier=statement.moduleSpecifier.text
      if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))continue
      const base=specifier.startsWith('@/')?specifier.slice(2):path.join(path.dirname(relative),specifier)
      const resolved=[base,...['.ts','.tsx','.mjs','.js'].map(extension=>base+extension)].find(file=>fs.existsSync(path.join(app,file))&&fs.statSync(path.join(app,file)).isFile())
      expect(resolved,`actual import closure: ${relative}`).toBeDefined();copy(resolved!)
    }
  }
  try{
    copy('package.json');copy('tsconfig.json');copy('tests/auth-compatibility/playwright.config.ts');copy('tests/auth-compatibility/browser.proof.spec.ts')
    for(const relative of copied)expect(fs.readFileSync(path.join(staged,relative))).toEqual(fs.readFileSync(path.join(app,relative)))
    const fixtureFile=path.join(staged,'tests/auth-compatibility/fixture.ts')
    let adapter=fs.readFileSync(fixtureFile,'utf8')
    const tree=ts.createSourceFile('fixture.ts',adapter,ts.ScriptTarget.ESNext,true)
    const replacements=tree.statements.filter(ts.isFunctionDeclaration).filter(node=>['fixture','receipt'].includes(node.name?.text??'')).map(node=>({start:node.body!.getStart(tree),end:node.body!.end,text:node.name!.text==='fixture'?`{ return ${JSON.stringify({qualificationCase:'security-audit',variant:'candidate',portalOrigin:'http://localhost:21002',directory:temporary,evidenceDirectory:path.join(temporary,'never-written')})} as Fixture }`:`{ throw new Error('Collection-only adapter cannot write a runtime receipt') }`}))
    expect(replacements).toHaveLength(2)
    for(const replacement of replacements.sort((a,b)=>b.start-a.start))adapter=adapter.slice(0,replacement.start)+replacement.text+adapter.slice(replacement.end)
    fs.writeFileSync(fixtureFile,'// Explicit synthetic collection adapter; never a hosted fixture.\n'+adapter)
    control(staged,temporary,app)
  }finally{fs.rmSync(temporary,{recursive:true,force:true})}
}

it('collects the actual Playwright config/spec/import closure and rejects the old CommonJS wrapper, without a browser',()=>withPlaywrightStage((staged,temporary)=>{
    const cli=createRequire(import.meta.url).resolve('@playwright/test/cli')
    const args=[cli,'test','--config',path.join(staged,'tests/auth-compatibility/playwright.config.ts'),'--list','--reporter=json']
    const env={NODE_ENV:'test' as const,PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:temporary}
    const result=JSON.parse(execFileSync(process.execPath,args,{cwd:staged,env,encoding:'utf8',timeout:4000,maxBuffer:128*1024}))
    expect(result.errors).toEqual([])
    const titles:string[]=[];const visit=(suite:{specs?:Array<{title:string}>;suites?:unknown[]})=>{for(const spec of suite.specs??[])titles.push(spec.title);for(const child of suite.suites??[])visit(child as typeof suite)}
    for(const suite of result.suites)visit(suite)
    expect(titles).toEqual(['real Keycloak PKCE/Auth.js session is denied after actual signed backchannel logout'])
    expect(fs.existsSync(path.join(temporary,'never-written'))).toBe(false)
    const wrapper=path.join(staged,'tests/auth-compatibility/security-behavior.ts')
    const fixed=fs.readFileSync(wrapper,'utf8')
    fs.writeFileSync(wrapper,"import { fileURLToPath } from 'node:url'\n"+fixed.replace("path.resolve(__dirname,'../..')","path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')"))
    let failure:unknown
    try{execFileSync(process.execPath,args,{cwd:staged,env,encoding:'utf8',timeout:4000,maxBuffer:128*1024,stdio:'pipe'})}catch(error){failure=error}
    expect(failure).toBeDefined()
    const output=String((failure as {stdout?:string}).stdout??'')+String((failure as {stderr?:string}).stderr??'')
    expect(output).toMatch(/Cannot use 'import.meta' outside a module/)
    expect(fs.existsSync(path.join(temporary,'never-written'))).toBe(false)
}))

it('executes both public Zod formats and the dynamic parser under actual Playwright Node-only loading',()=>withPlaywrightStage((staged,temporary,app)=>{
  const directory=path.join(staged,'tests/auth-compatibility')
  const config=fs.readFileSync(path.join(directory,'playwright.config.ts'),'utf8')
  expect(config).toContain("testMatch: 'browser.proof.spec.ts'")
  fs.writeFileSync(path.join(directory,'node-only.config.ts'),config.replace("testMatch: 'browser.proof.spec.ts'","testMatch: 'node-only.proof.spec.ts'"))
  fs.writeFileSync(path.join(directory,'node-only.proof.spec.ts'),`import {test,expect} from '@playwright/test';import{pathToFileURL}from'node:url';import{securityZodIdentity,securityZodBothFormats}from'./security-behavior-source.mjs';
test('owned Node-only format control',async()=>{
 const app=${JSON.stringify(app)};const identity=securityZodIdentity(app);const result=securityZodBothFormats(app,identity);
 expect(result.formats.map(x=>x.format)).toEqual(['commonjs','module']);
 for(const format of result.formats){expect(format.version).toBe('4.6.7');expect(format.modes.map(x=>x.jitless)).toEqual([true,false]);for(const mode of format.modes){expect(mode.restored).toBe(true);for(const kind of ['array','set','map']){expect(mode[kind]).toEqual({parsed:0,issues:[{origin:kind,code:'too_big',maximum:2,inclusive:true,path:['payload'],message:'owned-size-bound'}],valid:true})}}}
 const parser=await import(pathToFileURL(app+'/scripts/security/monaco-purify-patch.mjs').href);expect(typeof parser.analyzeAmd).toBe('function');
});`)
  const cli=createRequire(import.meta.url).resolve('@playwright/test/cli')
  const output=execFileSync(process.execPath,[cli,'test','--config',path.join(directory,'node-only.config.ts'),'--reporter=json'],{cwd:staged,env:{NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:temporary},encoding:'utf8',timeout:4000,maxBuffer:128*1024})
  const result=JSON.parse(output)
  expect(result.errors).toEqual([]);expect(result.stats).toMatchObject({expected:1,unexpected:0,skipped:0})
  expect(fs.existsSync(path.join(temporary,'never-written'))).toBe(false)
}))

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
