import assert from 'node:assert/strict'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { fixture, receipt } from './fixture'
import { securitySanitizerModules, assertSecurityBehavior, securityZodBothFormats, assertSecurityBehaviorBinding, securityBehaviorSnapshot } from './security-behavior-source.mjs'
export const zodControl=securityZodBothFormats

const defaults={modules:securitySanitizerModules,zod:securityZodBothFormats,validate:assertSecurityBehavior,write:receipt}
export async function executeSecurityBehavior(portal:Page,c:ReturnType<typeof fixture>,app:string,deps=defaults){
  const binding=assertSecurityBehaviorBinding(c)
  const browser=portal.context().browser();assert.ok(browser)
  const errors={page:0,console:0,forbiddenRequests:0};let contextsCreated=0;let contextsClosed=0;let passed=false
  let stage:'source-bind'|'zod'|'esm'|'amd-dev'|'amd-min'|'complete'='source-bind'
  const sanitizers=[]
  let zodResult:ReturnType<typeof zodControl>|null=null
  let snapshot:ReturnType<typeof securityBehaviorSnapshot>|null=null
  try{
    const modules=await deps.modules(app,c.variant,binding,path.join(app,'tests/auth-compatibility/security-proof-parser.mjs'))
    stage='zod'
    zodResult=deps.zod(app,binding.zod)
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
    stage='complete';passed=true
    snapshot=securityBehaviorSnapshot(c,{stage,passed,contextsCreated,contextsClosed,errors,sanitizers,zod:zodResult})
    deps.validate({source:binding.source,lockSha256:binding.lockSha256,manifestSha256:binding.manifestSha256,securityAssets:binding.assets,securityZod:binding.zod,securityParserSha256:binding.parserSha256,securityBehavior:snapshot},c.variant)
  }catch{passed=false;snapshot=null;throw new Error('Owned security behavior fixture failed')}finally{
    deps.write('security-behavior.json',snapshot??securityBehaviorSnapshot(c,{stage,passed,contextsCreated,contextsClosed,errors,sanitizers,zod:zodResult}))
  }
}

export async function qualifySecurityBehavior(portal:Page){return executeSecurityBehavior(portal,fixture(),path.resolve(__dirname,'../..'))}
