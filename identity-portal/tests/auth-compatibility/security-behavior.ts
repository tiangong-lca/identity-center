import assert from 'node:assert/strict'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { fixture, receipt } from './fixture'
import { securitySanitizerModules, assertSecurityBehavior, securityZodIdentity } from './security-behavior-source.mjs'
export function zodControl(app:string, expected:NonNullable<ReturnType<typeof fixture>['securityBinding']>['zod']) {
  const z=createRequire(path.join(app,'package.json'))('zod') as typeof import('zod')
  const identity=securityZodIdentity(app);assert.deepEqual(identity,expected,'Zod must execute the source-bound frozen package')
  const modes=[]
  for(const jitless of [true,false]){
    const previous={...z.config(),jitless:z.config().jitless};const result:Record<string,unknown>={jitless}
    try{
      z.config({jitless})
      for(const kind of ['array','set','map'] as const){
        let parsed=0
        const item=z.string().superRefine(()=>{parsed++})
        const schema=kind==='array'?z.array(item).max(2,'owned-size-bound'):kind==='set'?z.set(item).max(2,'owned-size-bound'):z.map(item,item).max(2,'owned-size-bound')
        const values=['a','b','c'];const input=kind==='array'?values:kind==='set'?new Set(values):new Map(values.map(v=>[v,v]))
        const container=z.object({payload:schema})
        const invalid=container.safeParse({payload:input})
        assert.equal(invalid.success,false)
        const issues=invalid.error!.issues
        const work=parsed;const valid=container.safeParse({payload:kind==='array'?['ok']:kind==='set'?new Set(['ok']):new Map([['ok','ok']])})
        const data=valid.success?valid.data.payload:null
        const validCompatible=kind==='array'?Array.isArray(data)&&data.length===1&&data[0]==='ok':kind==='set'?data instanceof Set&&data.size===1&&data.has('ok'):data instanceof Map&&data.size===1&&data.get('ok')==='ok'
        result[kind]={parsed:work,issues,valid:validCompatible}
      }
    }finally{const keys=new Set([...Object.keys(previous),...Object.keys(z.config())]);z.config(Object.fromEntries([...keys].map(key=>[key,previous[key as keyof typeof previous]])));for(const key of keys)assert.equal(z.config()[key as keyof ReturnType<typeof z.config>],previous[key as keyof typeof previous]);result.restored=true}
    modes.push(result)
  }
  return {...identity,modes}
}

export async function qualifySecurityBehavior(portal:Page){
  const c=fixture();assert.equal(c.qualificationCase,'security-audit');assert.ok(c.securityBinding)
  const binding=c.securityBinding
  const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
  const browser=portal.context().browser();assert.ok(browser)
  const errors={page:0,console:0,forbiddenRequests:0};let contextsCreated=0;let contextsClosed=0;let passed=false
  let stage:'source-bind'|'zod'|'esm'|'amd-dev'|'amd-min'|'complete'='source-bind'
  const sanitizers=[]
  let zodResult:ReturnType<typeof zodControl>|null=null
  try{
    const modules=await securitySanitizerModules(app,c.variant,binding,path.join(app,'tests/auth-compatibility/security-proof-parser.mjs'))
    stage='zod'
    zodResult=zodControl(app,binding.zod)
    for(const asset of modules){
      stage=asset.path.startsWith('esm/')?'esm':asset.path.startsWith('dev/')?'amd-dev':'amd-min'
      const context=await browser.newContext({serviceWorkers:'block'});contextsCreated++
      try{
        const documentUrl=`${c.portalOrigin}/__owned_security_fixture/${c.nonce}/`
        const moduleUrl=documentUrl+'sanitizer.mjs'
        await context.route('**/*',async route=>{
          const url=route.request().url()
          if(url===documentUrl)await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Owned security fixture</title>'})
          else if(url===moduleUrl)await route.fulfill({status:200,contentType:'text/javascript',body:asset.module})
          else{errors.forbiddenRequests++;await route.abort()}
        })
        const page=await context.newPage();page.on('pageerror',()=>{errors.page++});page.on('console',m=>{if(m.type()==='error')errors.console++})
        await page.goto(documentUrl)
        const controls=await page.evaluate(async url=>{
          const {default:purifier}=await import(url)
          const root=document.createElement('div')
          // Exact upstream GHSA-mrv2 parent-detachment shape; no src and no events fired.
          root.innerHTML='<section><figure><i></i><img id="tail" onerror="alert(1)"></figure></section><p>ok</p><aside id="far"><img id="far-tail" onerror="alert(2)"></aside>'
          const figure=root.querySelector('figure')!;const tail=root.querySelector('#tail')!;const far=root.querySelector('#far-tail')!;let hookRan=false
          purifier.addHook('uponSanitizeElement',(node:Element)=>{if(!hookRan&&node.nodeName==='I'){hookRan=true;figure.remove()}})
          try{
            purifier.sanitize(root,{IN_PLACE:true})
            const handlerSurvives=tail.getAttribute('onerror')!==null;const otherHandlerRemoved=far.getAttribute('onerror')===null
            const normal=purifier.sanitize('<p>ok <a href="https://example.invalid/">link</a></p>')
            return {hookRan,handlerSurvives,otherHandlerRemoved,validMarkup:normal==='<p>ok <a href="https://example.invalid/">link</a></p>'}
          }finally{purifier.removeHook('uponSanitizeElement')}
        },moduleUrl)
        sanitizers.push({path:asset.path,sha256:asset.sha256,execution:asset.execution,controls})
      }finally{await context.close();contextsClosed++}
    }
    assert.deepEqual(errors,{page:0,console:0,forbiddenRequests:0})
    assertSecurityBehavior({source:binding.source,lockSha256:binding.lockSha256,manifestSha256:binding.manifestSha256,securityAssets:binding.assets,securityZod:binding.zod,securityParserSha256:binding.parserSha256,securityBehavior:{stage:'complete',qualificationCase:'security-audit',variant:c.variant,source:binding.source,lockSha256:binding.lockSha256,manifestSha256:binding.manifestSha256,passed:true,contextsCreated,contextsClosed,errors,sanitizers,zod:zodResult}},c.variant)
    stage='complete';passed=true
  }catch{throw new Error('Owned security behavior fixture failed')}finally{
    receipt('security-behavior.json',{qualificationCase:'security-audit',variant:c.variant,source:binding.source,manifestSha256:binding.manifestSha256,lockSha256:binding.lockSha256,parserSha256:binding.parserSha256,stage,passed,contextsCreated,contextsClosed,errors,sanitizers,zod:zodResult})
  }
}
