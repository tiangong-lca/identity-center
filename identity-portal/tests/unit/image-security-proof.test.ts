import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { load } from 'js-yaml'
import { inspectImageFilesystem, buildExpected, runImageInspection, EXPECTED_PACKAGE_VERSIONS } from '../auth-compatibility/image-security-proof.mjs'
import { SECURITY_CANDIDATE_PATHS, SECURITY_ORIGINAL_ASSETS, SECURITY_UPSTREAM, securityChangedPathPolicy } from '../auth-compatibility/security-case.mjs'
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
const source='c'.repeat(40)
const posixIt=process.platform==='win32'?it.skip:it

posixIt('host-only TERM joins the actual image supervisor before reporting cancellation',async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'identity48-image-join-'))
  let transportPid:number|undefined;let host:ReturnType<typeof spawn>|undefined
  let readiness:ReturnType<typeof setInterval>|undefined
  try{
    const helper=new URL('../auth-compatibility/image-security-proof.mjs',import.meta.url).href
    const supervisor=path.resolve(__dirname,'../auth-compatibility/bounded-command.mjs')
    const ready=path.join(temporary,'ready.json')
    const program=`process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)`
    const script=path.join(temporary,'host.mjs')
    fs.writeFileSync(script,`import{imageInspectionCommand}from${JSON.stringify(helper)};const result=await imageInspectionCommand(process.execPath,${JSON.stringify([supervisor,'60000','2000',process.execPath,'-e',program])},{timeout:65000,maxBuffer:128*1024});console.log(JSON.stringify(result));`)
    host=spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']})
    let output='';let signalled=false
    host.stdout!.on('data',buffer=>{output+=buffer})
    readiness=setInterval(()=>{if(fs.existsSync(ready)&&!signalled){transportPid=JSON.parse(fs.readFileSync(ready,'utf8')).pid;signalled=true;host!.kill('SIGTERM');clearInterval(readiness)}},10)
    host.stderr!.resume()
    const code=await new Promise((resolve,reject)=>{host!.on('error',reject);host!.on('close',resolve)})
    expect(code).toBe(0);expect(signalled).toBe(true)
    const result=JSON.parse(output.trim().split('\n').at(-1)!)
    expect(result).toMatchObject({status:143,cancelCode:143})
    expect(()=>process.kill(transportPid!,0)).toThrow()
  }finally{
    clearInterval(readiness)
    if(host&&host.exitCode===null)host.kill('SIGKILL')
    if(transportPid){try{process.kill(transportPid,'SIGKILL')}catch{}}
    fs.rmSync(temporary,{recursive:true,force:true})
  }
})

posixIt('the supervisor retains group escalation when its direct child exits before grace',async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'identity48-supervisor-join-'))
  let descendant:number|undefined;let supervisor:ReturnType<typeof spawn>|undefined
  try{
    const file=path.join(temporary,'ready.json')
    const child=`const{spawn}=require('node:child_process');const fs=require('node:fs');const worker=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});setTimeout(()=>fs.writeFileSync(${JSON.stringify(file)},JSON.stringify({child:process.pid,descendant:worker.pid})),100);process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`
    supervisor=spawn(process.execPath,[path.resolve(__dirname,'../auth-compatibility/bounded-command.mjs'),'500','100',process.execPath,'-e',child],{stdio:'ignore'})
    const code=await new Promise((resolve,reject)=>{supervisor!.on('error',reject);supervisor!.on('close',resolve)})
    const ids=JSON.parse(fs.readFileSync(file,'utf8'));descendant=ids.descendant
    expect(code).toBe(124);expect(()=>process.kill(ids.child,0)).toThrow();expect(()=>process.kill(ids.descendant,0)).toThrow()
  }finally{if(supervisor&&supervisor.exitCode===null)supervisor.kill('SIGKILL');if(descendant){try{process.kill(descendant,'SIGKILL')}catch{}}fs.rmSync(temporary,{recursive:true,force:true})}
})

function fixture(){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'identity48-image-proof-'));const root=path.join(temporary,'app');fs.mkdirSync(root)
  const write=(file:string,value:string)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);return target}
  const framework='owned-framework-vendor-namespace-49\n'
  const packageVersions=Object.fromEntries(Object.entries({next:'16.4.2',react:'19.3.1','react-dom':'19.3.1',zod:'4.6.7',dompurify:'3.4.17','monaco-editor':'0.55.1',shadcn:'4.23.0',vitest:'4.1.12','@vitest/coverage-v8':'4.1.12'}).map(([name,version])=>[name,[version]]))
  for(const [name,version] of Object.entries(packageVersions))write(`node_modules/${name}/package.json`,JSON.stringify({name,version:version[0],...(name==='zod'?{exports:{'.':{require:'./index.cjs',import:'./index.js'}}}:{})}))
  write('node_modules/zod/index.cjs','module.exports={synthetic:true};\n');write('node_modules/zod/index.js','export const synthetic=true;\n');write('node_modules/zod/v4/core/schemas.js','export const bounded=true;\n')
  write('node_modules/next/dist/compiled/zod/index.cjs',framework)
  const assets=Object.entries(SECURITY_ORIGINAL_ASSETS).map(([file,originalSha256])=>{const bytes='/*! @license DOMPurify 3.4.17 */ export const fixed=true;\n';write('node_modules/monaco-editor/'+file,bytes);return {path:file,originalSha256,patchedSha256:sha(bytes),upstreamSha256:SECURITY_UPSTREAM}})
  const provenance={monacoVersion:'0.55.1',upstreamVersion:'3.4.17',upstreamSha256:SECURITY_UPSTREAM,patchSha256:sha('owned patch'),maps:'owned fixture policy',assets}
  const inputHashes:Record<string,string>={}
  for(const file of SECURITY_CANDIDATE_PATHS){const relative=file.slice('identity-portal/'.length);const bytes=file.endsWith('.provenance.json')?JSON.stringify(provenance):file.endsWith('package.json')?JSON.stringify({name:'owned',version:'0.1.0'}):'owned input '+file+'\n';write(relative,bytes);inputHashes[file]=sha(bytes)}
  write('.next/BUILD_ID','owned-build\n');write('.next/build-manifest.json','{}');write('.next/routes-manifest.json','{}')
  write('.next/server/app-paths-manifest.json',JSON.stringify({'/admin/apps/registry/page':'app/admin/apps/registry/page.js','/api/admin/catalog/route':'app/api/admin/catalog/route.js'}))
  write('.next/server/app/admin/apps/registry/page.js','owned registry page')
  write('.next/server/app/admin/apps/registry/page/react-loadable-manifest.json',JSON.stringify({owned:{id:1,files:['static/chunks/owned-monaco.js','static/chunks/owned-client-zod.js']}}))
  write('.next/server/app/api/admin/catalog/route.js','owned route')
  write('.next/server/app/api/admin/catalog/route.js.nft.json',JSON.stringify({version:1,files:['../../../../chunks/owned-server-zod.js']}))
  write('.next/static/chunks/owned-monaco.js','/*! DOMPurify */ const version="3.4.17"; function sanitize(){const mode="IN_PLACE"}')
  const zod='const version={major:4,minor:6,patch:7}; function sizeCaps(){};class ZodArray{};const issue="too_big";'
  write('.next/static/chunks/owned-client-zod.js',zod);write('.next/server/chunks/owned-server-zod.js',zod)
  const implementation=['index.cjs','index.js','v4/core/schemas.js'].sort().map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,'node_modules/zod',file)))}))
  const zodSource={packageSha256:sha(fs.readFileSync(path.join(root,'node_modules/zod/package.json'))),entries:{commonjs:{path:'index.cjs',sha256:sha(fs.readFileSync(path.join(root,'node_modules/zod/index.cjs')))},module:{path:'index.js',sha256:sha(fs.readFileSync(path.join(root,'node_modules/zod/index.js')))}},implementationTreeSha256:sha(JSON.stringify(implementation)),implementationFiles:implementation.length}
  const expected={source,inputHashes,provenance,packageVersions,zodSource,frameworkVendor:{sha256:sha(framework),bytes:Buffer.byteLength(framework),followup:'https://github.com/tiangong-lca/identity-center/issues/49'}}
  return {temporary,root,write,expected}
}

it('inspects actual small Worker filesystem bytes and rejects missing, mismatched and shadow inputs',()=>{
  const f=fixture()
  try{
    const result=inspectImageFilesystem('worker',f.root,f.expected)
    expect(result.target).toBe('worker');expect(result.source).toBe(source)
    expect(result.worker!.imageObservedInputHashes).toEqual(f.expected.inputHashes)
    expect(result.worker!.zod.entries.map((entry:{format:string})=>entry.format)).toEqual(['commonjs','module'])
    for(const entry of result.worker!.zod.entries){expect(entry.resolution).toBe('declared-public-export-conditions');expect(entry.sha256).toBe(sha(fs.readFileSync(path.join(f.root,entry.path))))}
    expect(result.frameworkVendor.sha256).toBe(f.expected.frameworkVendor.sha256)
    const asset='node_modules/monaco-editor/'+f.expected.provenance.assets[0].path
    const original=fs.readFileSync(path.join(f.root,asset),'utf8');f.write(asset,original+'drift')
    expect(()=>inspectImageFilesystem('worker',f.root,f.expected)).toThrow()
    f.write(asset,original);fs.unlinkSync(path.join(f.root,asset));expect(()=>inspectImageFilesystem('worker',f.root,f.expected)).toThrow()
  }finally{fs.rmSync(f.temporary,{recursive:true,force:true})}
})

it('binds Runner output to discovered registry manifests and API NFT chunks, never invented fixed filenames',()=>{
  const f=fixture()
  try{
    const result=inspectImageFilesystem('runner',f.root,f.expected)
    expect(result.source).toBe(source);expect(result.hostExpectedInputHashes).toEqual(f.expected.inputHashes)
    expect(Object.hasOwn(result,'imageObservedInputHashes')).toBe(false)
    expect(result.runner!.buildId).toBe('owned-build')
    expect(JSON.stringify(result.runner)).toContain('owned-monaco.js');expect(JSON.stringify(result.runner)).toContain('owned-server-zod.js');expect(JSON.stringify(result.runner)).toContain('owned-client-zod.js')
    fs.unlinkSync(path.join(f.root,'.next/server/app/admin/apps/registry/page/react-loadable-manifest.json'))
    expect(()=>inspectImageFilesystem('runner',f.root,f.expected)).toThrow()
  }finally{fs.rmSync(f.temporary,{recursive:true,force:true})}
})

it('supports explicitly split retained standalone/static inputs without claiming they are an image',()=>{
  const f=fixture()
  try{
    const staticRoot=path.join(f.temporary,'retained-static');fs.renameSync(path.join(f.root,'.next/static'),staticRoot)
    const result=inspectImageFilesystem('runner',f.root,f.expected,{staticRoot})
    expect(result.runner!.buildId).toBe('owned-build')
    expect(()=>inspectImageFilesystem('runner',f.root,f.expected)).toThrow()
  }finally{fs.rmSync(f.temporary,{recursive:true,force:true})}
})

it('fails closed on association/path escape, framework namespace drift and oversized files',()=>{
  for(const control of (process.platform==='win32'?['framework','oversized']:['escape','framework','oversized'])){
    const f=fixture()
    try{
      if(control==='escape'){
        const outside=path.join(f.temporary,'outside.js');fs.writeFileSync(outside,'private outsider')
        const target=path.join(f.root,'.next/static/chunks/owned-monaco.js');fs.unlinkSync(target);fs.symlinkSync(outside,target)
      }else if(control==='framework')f.write('node_modules/next/dist/compiled/zod/index.cjs','wrong vendor namespace')
      else fs.truncateSync(f.write('.next/static/chunks/owned-monaco.js','x'),80*1024*1024)
      expect(()=>inspectImageFilesystem('runner',f.root,f.expected),control).toThrow()
    }finally{fs.rmSync(f.temporary,{recursive:true,force:true})}
  }
})

it('uses guarded structured inspection argv and rejects malformed, stale or unsuccessful probe responses',async()=>{
  const repo=path.resolve(__dirname,'../../..');const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'identity48-image-command-'))
  try{
    const imageId='sha256:'+'a'.repeat(64);const info=path.join(temporary,'runner-image.txt');fs.writeFileSync(info,imageId+' linux/amd64\n')
    const expected=buildExpected(repo,source)
    const filesystem={schema:1,target:'runner',source,scope:'image-root-filesystem',hostExpectedInputHashes:expected.inputHashes,frameworkVendor:expected.frameworkVendor,runner:{buildId:'owned',manifests:[],browserSanitizers:[],clientZod:[],serverZod:[]}}
    const receipt={schema:1,target:'runner',source,imageId,nodeVersion:'v24.22.1',platform:'linux',arch:'x64',filesystem}
    const options={target:'runner',image:'identity41-node24-123-2:runner',name:'identity41-node24-123-2-runner',evidence:temporary,source,imageInfo:info,root:repo}
    const calls:Array<{executable:string;args:string[];options:unknown}>=[]
    const transport=(executable:string,args:string[],spawnOptions:unknown)=>{calls.push({executable,args,options:spawnOptions});return {status:0,stdout:JSON.stringify(receipt),stderr:''}}
    await runImageInspection(options,transport)
    expect(calls).toHaveLength(1);const args=calls[0].args
    for(const flag of ['60000','2000','docker','run','--rm','--read-only'])expect(args).toContain(flag)
    const joined=args.join(' ');expect(joined).toMatch(/--cap-drop(?:=| )ALL/);expect(joined).toMatch(/--security-opt(?:=| )no-new-privileges/);expect(joined).toMatch(/--network(?:=| )none/)
    expect(args).toContain(options.name);expect(args).toContain(imageId);expect(args).not.toContain(options.image);expect(args).toContain('-e')
    expect(fs.readFileSync(path.join(temporary,'runner-node.txt'),'utf8').trim()).toBe('v24.22.1')
    expect(JSON.parse(fs.readFileSync(path.join(temporary,'runner-security.json'),'utf8')).source).toBe(source)
    for(const mutation of [{source:'b'.repeat(40)},{imageId:'sha256:'+'b'.repeat(64)},{nodeVersion:'v22.0.0'},{arch:'arm64'}])await expect(runImageInspection(options,()=>({status:0,stdout:JSON.stringify({...receipt,...mutation}),stderr:''}))).rejects.toThrow()
    await expect(runImageInspection(options,()=>({status:1,stdout:'',stderr:'synthetic failure'}))).rejects.toThrow()
    await expect(runImageInspection(options,()=>({status:0,stdout:'not-json',stderr:''}))).rejects.toThrow()
    fs.unlinkSync(path.join(temporary,'runner-security.json'));fs.unlinkSync(path.join(temporary,'runner-node.txt'))
    await expect(runImageInspection(options,()=>({status:143,cancelCode:143,stdout:JSON.stringify(receipt)}))).rejects.toMatchObject({exitCode:143})
    expect(fs.existsSync(path.join(temporary,'runner-security.json'))).toBe(false);expect(fs.existsSync(path.join(temporary,'runner-node.txt'))).toBe(false)
  }finally{fs.rmSync(temporary,{recursive:true,force:true})}
})

posixIt('the actual workflow invokes both image inspections before the unchanged cleanup trap',()=>{
  const repo=path.resolve(__dirname,'../../..');const text=fs.readFileSync(path.join(repo,'.github/workflows/auth-compatibility.yml'),'utf8')
  const workflow=load(text) as {on:{pull_request:{paths:string[]}};jobs:Record<string,{steps:Array<{name?:string;run?:string}>}>}
  expect(workflow.on.pull_request.paths).toContain('identity-portal/tests/auth-compatibility/image-security-proof.mjs');expect(workflow.on.pull_request.paths).toContain('identity-portal/tests/unit/image-security-proof.test.ts')
  expect(securityChangedPathPolicy('identity-portal/tests/unit/image-security-proof.test.ts')).toBe('qualification-support')
  expect(securityChangedPathPolicy('identity-portal/tests/unit/auth-image-cleanup.test.ts')).toBe('qualification-support')
  expect(()=>securityChangedPathPolicy('identity-portal/tests/unit/auth-image-cleanup-extra.test.ts')).toThrow('Unreviewed security qualification path')
  const script=workflow.jobs['auth-compatibility'].steps.find(s=>s.name==='Build and inspect isolated Node24 Portal and Worker images')!.run!
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'identity48-workflow-proof-'));const bin=path.join(temp,'bin');fs.mkdirSync(bin);const events=path.join(temp,'events.jsonl')
  try{
    const nodeShim=`#!${process.execPath}\nconst fs=require('node:fs'),p=require('node:path');const a=process.argv.slice(2),events=${JSON.stringify(events)};const emit=x=>fs.appendFileSync(events,JSON.stringify(x)+'\\n');if(a[0]==='tests/auth-compatibility/bounded-command.mjs'){const d=a.slice(4);emit({kind:'docker',args:d});if(d[0]==='container'&&d[1]==='inspect')process.exit(1);if(d[0]==='image'&&d[1]==='inspect'){process.stdout.write('sha256:'+('a'.repeat(64))+' linux/amd64\\n')}process.exit(0)}if(a[0]!=='tests/auth-compatibility/image-security-proof.mjs')process.exit(77);const o=Object.fromEntries(a.slice(1).reduce((x,v,i,z)=>i%2?x:[...x,[v.slice(2),z[i+1]]],[]));for(const key of ['target','image','name','evidence','source','image-info'])if(!o[key])process.exit(78);if(o.name!=='identity41-node24-123-2-'+o.target||o.image!=='identity41-node24-123-2:'+o.target)process.exit(79);emit({kind:'inspection',...o});require('node:child_process').execFileSync(process.execPath,[${JSON.stringify(path.join(repo,'identity-portal/tests/auth-compatibility/image-security-proof.mjs'))},...a.slice(1)],{env:process.env,stdio:'pipe'});`
    fs.writeFileSync(path.join(bin,'node'),nodeShim,{mode:0o700});fs.writeFileSync(path.join(bin,'git'),`#!${process.execPath}\nlet a=process.argv.slice(2);if(a[0]==='-C')a=a.slice(2);if(a.join(' ')==='rev-parse HEAD')console.log(${JSON.stringify(source)});else if(a.join(' ')==='status --porcelain'){}else process.exit(96);\n`,{mode:0o700});fs.writeFileSync(path.join(bin,'docker'),`#!${process.execPath}\nconst fs=require('node:fs'),assert=require('node:assert/strict'),a=process.argv.slice(2);if(a[0]!=='run')process.exit(97);for(const flag of ['--rm','--read-only'])assert.ok(a.includes(flag));for(const [flag,value]of [['--network','none'],['--cap-drop','ALL'],['--security-opt','no-new-privileges'],['--entrypoint','node']])assert.equal(a[a.indexOf(flag)+1],value);const input=JSON.parse(a.at(-1));assert.ok(a.includes('-e'));assert.ok(a.includes(input.imageId));assert.ok(!a.some(x=>/^identity41-node24-.*:(runner|worker)$/.test(x)));fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({kind:'actual-helper-transport',target:input.target})+'\\n');const filesystem={schema:1,target:input.target,source:input.expected.source,scope:'image-root-filesystem',hostExpectedInputHashes:input.expected.inputHashes,frameworkVendor:input.expected.frameworkVendor};process.stdout.write(JSON.stringify({schema:1,target:input.target,source:input.expected.source,imageId:input.imageId,nodeVersion:'v24.22.1',platform:'linux',arch:'x64',filesystem}));\n`,{mode:0o700})
    // Positively prove the explicit docker executable is inert; no PATH fallback.
    expect(()=>execFileSync(path.join(bin,'docker'),[],{stdio:'pipe'})).toThrow()
    execFileSync('/bin/bash',['-c',script],{cwd:path.join(repo,'identity-portal'),env:{NODE_ENV:'test' as const,PATH:bin+':/usr/bin:/bin',RUNNER_TEMP:temp,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2'},stdio:'pipe'})
    const actual=fs.readFileSync(events,'utf8').trim().split('\n').map(x=>JSON.parse(x))
    const inspections=actual.filter(x=>x.kind==='inspection');expect(inspections.map(x=>x.target)).toEqual(['runner','worker']);expect(actual.filter(x=>x.kind==='actual-helper-transport').map(x=>x.target)).toEqual(['runner','worker'])
    for(const item of inspections){expect(item.source).toBe(source);expect(item['image-info']).toBe(path.join(item.evidence,item.target+'-image.txt'))}
    const firstCleanup=actual.findIndex(x=>x.kind==='docker'&&x.args[0]==='image'&&x.args[1]==='rm')
    expect(firstCleanup).toBeGreaterThan(actual.findIndex(x=>x.kind==='inspection'&&x.target==='worker'))
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
})

it('rejects same-version Zod implementation mutation while package and both public entries stay unchanged',()=>{
  const f=fixture()
  try{
    inspectImageFilesystem('worker',f.root,f.expected)
    const packageHash=sha(fs.readFileSync(path.join(f.root,'node_modules/zod/package.json')))
    const cjs=sha(fs.readFileSync(path.join(f.root,'node_modules/zod/index.cjs')));const esm=sha(fs.readFileSync(path.join(f.root,'node_modules/zod/index.js')))
    f.write('node_modules/zod/v4/core/schemas.js','export const bounded=false;\n')
    expect(sha(fs.readFileSync(path.join(f.root,'node_modules/zod/package.json')))).toBe(packageHash)
    expect(sha(fs.readFileSync(path.join(f.root,'node_modules/zod/index.cjs')))).toBe(cjs);expect(sha(fs.readFileSync(path.join(f.root,'node_modules/zod/index.js')))).toBe(esm)
    expect(()=>inspectImageFilesystem('worker',f.root,f.expected)).toThrow('Worker Zod implementation bytes mismatch')
  }finally{fs.rmSync(f.temporary,{recursive:true,force:true})}
})

it('rejects an unexpected physical Express package and checks the reviewed direct-parent inventory',()=>{
  expect(EXPECTED_PACKAGE_VERSIONS.express).toEqual([])
  expect(EXPECTED_PACKAGE_VERSIONS.shadcn).toEqual(['4.23.0'])
  expect(EXPECTED_PACKAGE_VERSIONS.vitest).toEqual(['4.1.12'])
  expect(EXPECTED_PACKAGE_VERSIONS['@vitest/coverage-v8']).toEqual(['4.1.12'])
  const f=fixture()
  try{
    f.expected.packageVersions.express=[]
    expect(()=>inspectImageFilesystem('worker',f.root,f.expected)).not.toThrow()
    f.write('node_modules/.pnpm/express@5.2.1/node_modules/express/package.json',JSON.stringify({name:'express',version:'5.2.1'}))
    expect(()=>inspectImageFilesystem('worker',f.root,f.expected)).toThrow('Worker security package inventory mismatch: express')
  }finally{fs.rmSync(f.temporary,{recursive:true,force:true})}
})
