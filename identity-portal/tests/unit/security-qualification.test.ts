import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { qualificationCase, assertQualificationManifest, assertQualificationVersions } from '../auth-compatibility/qualification-case.mjs'
import { SECURITY_BASELINE, SECURITY_INPUTS, SECURITY_PATCH, securityChangedPathPolicy, assertSecurityArchive, SECURITY_CANDIDATE_PATHS, SECURITY_PROVENANCE, SECURITY_UPSTREAM, SECURITY_ORIGINAL_ASSETS, assertSecurityProvenance, securityInstalledAssets } from '../auth-compatibility/security-case.mjs'
import { qualificationUiPlan, qualificationBrowserTimeout, combinedReactUi, assertSecurityUiReceipts } from '../auth-compatibility/ui-plan.mjs'

// Immutable Main68 content is recorded independently of current dependency edits.
const immutableManifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/manifest-security-audit.json'), 'utf8')) as { content: string; sourceCommit: string; sha256: string }
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
function candidateManifest() {
  const candidate = JSON.parse(immutableManifest.content)
  candidate.dependencies.shadcn = '^4.23.0'; candidate.dependencies.zod = '^4.6.7'
  candidate.devDependencies.vitest = candidate.devDependencies['@vitest/coverage-v8'] = '^4.1.12'
  return candidate
}
const versions = (variant: string) => ({ next: '16.4.2', react: '19.3.1', 'react-dom': '19.3.1', '@types/react': '19.3.0', '@types/react-dom': '19.3.0', jose: '6.2.12', '@keycloak/keycloak-admin-client': '26.8.1', 'monaco-editor': '0.55.1', 'monaco-yaml': '5.5.1', shadcn: variant === 'baseline' ? '4.21.0' : '4.23.0', zod: variant === 'baseline' ? '4.4.3' : '4.6.7', vitest: variant === 'baseline' ? '4.1.11' : '4.1.12', '@vitest/coverage-v8': variant === 'baseline' ? '4.1.11' : '4.1.12' })

it('keeps security manifest, exact runtime/cohort versions and immutable history independent', () => {
  expect(immutableManifest.sourceCommit).toBe(SECURITY_BASELINE)
  expect(digest(immutableManifest.content)).toBe(immutableManifest.sha256)
  expect(qualificationCase('security-audit').baseline).toBe(SECURITY_BASELINE)
  expect(qualificationCase('react19.3-catalog-fixed').baseline).toBe('b0c5baa1e9119563dc2a8c0720390dd1ce3a5890')
  expect(() => assertQualificationManifest('security-audit', immutableManifest.content, candidateManifest())).not.toThrow()
  expect(() => assertQualificationManifest('security-audit', immutableManifest.content+' ', candidateManifest())).toThrow()
  for (const [group, field, value] of [['dependencies', 'react', '19.3.2'], ['dependencies', 'zod', '^5'], ['devDependencies', 'vitest', '^5'], ['dependencies', 'next', '16.4.3']]) {
    const candidate = candidateManifest(); candidate[group][field] = value
    expect(() => assertQualificationManifest('security-audit', immutableManifest.content, candidate)).toThrow()
  }
  for (const variant of ['baseline', 'candidate']) {
    expect(() => assertQualificationVersions('security-audit', variant, versions(variant))).not.toThrow()
    for (const delta of [{ react: '19.2.4' }, { 'react-dom': '19.2.4' }, { 'monaco-editor': '0.57.0' }, { '@vitest/coverage-v8': '5.0.5' }, { zod: '3.25.76' }]) expect(() => assertQualificationVersions('security-audit', variant, { ...versions(variant), ...delta })).toThrow()
  }
})

it('requires both full UI suites and continuous zero errors in both security variants', () => {
  const broad = { passed: true, errors: { page: 0, console: 0 }, firstRenderHydration: true, clientNavigation: true, realFormAndReadback: true, radixFocusTrapAndRestore: true, monacoEditAndApply: true, localesAndThemes: true, syntheticDataOnly: true }
  const catalog = { executed: true, passed: true, errors: { page: 0, console: 0 }, schemaWorker: true, keyboardApplyReadback: true, spaDisposalReopen: true, exactBufferRestored: true, syntheticDataOnly: true, yamlWorkers: 2, yamlWorkersClosed: 2, unrecognizedWorkers: 0, undoSteps: [5,5] }
  const summaries = ['baseline','candidate'].map(variant => {
    expect(qualificationUiPlan('security-audit', variant)).toEqual({ broad: true, catalog: true, knownDefectiveSkip: false })
    expect(qualificationBrowserTimeout('security-audit')).toBe(150000)
    return { ui: combinedReactUi('security-audit', variant, broad, catalog, { page: 0, console: 0 }) }
  })
  expect(() => assertSecurityUiReceipts(summaries[0], summaries[1])).not.toThrow()
  for (const mutation of [{ executed: false }, { broad: undefined }, { errors: { page: 1, console: 0 } }, { catalog: { ...catalog, yamlWorkersClosed: 1 } }]) expect(() => assertSecurityUiReceipts(summaries[0], { ui: { ...summaries[1].ui, ...mutation } })).toThrow()
})

it('admits only exact security patch/support paths and rejects adjacent product paths', () => {
  for (const file of [SECURITY_PATCH, 'identity-portal/scripts/security/monaco-purify-patch.mjs', 'identity-portal/tests/unit/security-dependency-patch.test.ts']) expect(() => securityChangedPathPolicy(file)).not.toThrow()
  for (const file of ['identity-portal/config/business-apps.yaml', 'identity-portal/drizzle.config.ts', 'identity-portal/new-product.ts', 'identity-portal/patches/unreviewed.patch', 'identity-portal/scripts/security/unreviewed.mjs']) expect(() => securityChangedPathPolicy(file)).toThrow('Unreviewed security qualification path')
})

it('executes the actual security browser-body suite selection without skips or receipt overwrite', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/browser.proof.spec.ts'), 'utf8')
  const start = source.indexOf('      if (c.qualificationCase'); const end = source.indexOf("      page.off('pageerror'", start)
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start)
  // No source rewrite changes the branch: remove only the single TS annotation.
  const body = source.slice(start,end).replace('(name: string)', '(name)')
  for (const variant of ['baseline','candidate']) {
    const files = new Map<string,string>(); const events: string[] = []
    const deps = { c: { qualificationCase: 'security-audit', variant, evidenceDirectory: '/inert' }, plan: qualificationUiPlan('security-audit', variant), page: {}, errors: { page: 0, console: 0 }, diagnostics: {}, path,
      qualifyStandaloneUi: async (_p: unknown, _e: unknown, _d: unknown, name: string) => { expect(name).toBe('ui-broad.json'); events.push(name); files.set('/inert/'+name, '{}') },
      qualifyCatalogUi: async (_p: unknown, _e: unknown, _d: unknown, name: string) => { expect(name).toBe('ui-catalog.json'); events.push(name); files.set('/inert/'+name, '{}') },
      readFileSync: (file: string) => { expect(files.has(file)).toBe(true); return files.get(file) },
      combinedReactUi: (name: string, v: string) => { expect(name).toBe('security-audit'); expect(v).toBe(variant); return { executed: true } },
      receipt: (name: string) => { expect(name).toBe('ui.json'); events.push(name) },
    }
    await new Function(...Object.keys(deps), `return (async()=>{${body}})()`)(...Object.values(deps))
    expect(events).toEqual(['ui-broad.json','ui-catalog.json','ui.json'])
  }
})

it('runs real temporary-Git security preflight and refuses missing/hash/config/rename/source inputs before Docker', { skip: process.platform === 'win32', timeout: 20000 }, () => {
  const sourceRoot = path.resolve(__dirname, '../../..'); const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity48-entrypoint-'))
  try {
    const checkout = path.join(temp, 'repo'); fs.mkdirSync(checkout)
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    const env = { PATH: process.env.PATH, HOME: temp, NODE_ENV: 'test' as const, GIT_CONFIG_NOSYSTEM: '1' }
    const git = (...args: string[]) => execFileSync(realGit, ['-C',checkout,...args], { env, encoding: 'utf8', stdio: 'pipe' }).trim()
    const write = (file: string, value: string) => { const f=path.join(checkout,file);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,value) }
    const snapshots = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/security-source.json'), 'utf8')) as { source: string; files: Record<string,string> }
    expect(snapshots.source).toBe(SECURITY_BASELINE)
    git('init','--quiet');git('config','diff.renames','true')
    for (const [file,content] of Object.entries(snapshots.files)) write(file,content)
    write('identity-portal/lib/synthetic-rename.ts','export const unchanged = true\n')
    const commit = () => { git('add','--all');git('-c','user.name=Inert fixture','-c','user.email=test@invalid','commit','--quiet','-m','inert fixture');return git('rev-parse','HEAD') }
    const ownedBaseline=commit()
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/security-inputs.json'),'utf8'))
    write('identity-portal/package.json',JSON.stringify(candidateManifest(),null,2)+'\n');write('identity-portal/pnpm-lock.yaml','synthetic candidate lock\n');write('identity-portal/pnpm-workspace.yaml','synthetic candidate workspace\n');write(SECURITY_PATCH,'synthetic patch\n')
    const docker='identity-portal/deploy/docker/Dockerfile';write(docker,snapshots.files[docker].replace('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\n','COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nCOPY patches ./patches\n'))
    for (const file of SECURITY_CANDIDATE_PATHS) {
      if (file === SECURITY_PROVENANCE) {
        const provenance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../', file.slice('identity-portal/'.length)), 'utf8'))
        provenance.patchSha256 = digest(fs.readFileSync(path.join(checkout, SECURITY_PATCH)))
        write(file, JSON.stringify(provenance))
      } else if (file === 'identity-portal/patches/upstream/dompurify-3.4.17.purify.es.mjs') write(file, fs.readFileSync(path.resolve(__dirname, '../../patches/upstream/dompurify-3.4.17.purify.es.mjs'), 'utf8'))
      else if (!fs.existsSync(path.join(checkout,file))) write(file,'synthetic bound support bytes\n')
      config.candidateHashes[file]=digest(fs.readFileSync(path.join(checkout,file)))
    }
    write(SECURITY_INPUTS,JSON.stringify(config));const accepted=commit()
    const bin=path.join(temp,'bin');fs.mkdirSync(bin);const calls=path.join(temp,'calls');const marker=path.join(temp,'docker');const state=path.join(temp,'state')
    // The only ref seam maps immutable baseline68 to the owned synthetic Git commit.
    fs.writeFileSync(path.join(bin,'git'),`#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');let a=process.argv.slice(2);if(a[0]==='-C')a=a.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');if(fs.readFileSync(${JSON.stringify(state)},'utf8')==='old')a=a.filter(x=>x!=='--no-renames');const ref=${JSON.stringify(SECURITY_BASELINE)},owned=${JSON.stringify(ownedBaseline)};const args=a.map(x=>x===ref?owned:x.startsWith(ref+':')?owned+x.slice(ref.length):x);const result=cp.execFileSync(${JSON.stringify(realGit)},['-C',${JSON.stringify(checkout)},...args]);if(a[0]==='merge-base'){if(result.toString().trim()!==owned)process.exit(3);process.stdout.write(ref+'\\n')}else process.stdout.write(result);\n`,{mode:0o700})
    fs.writeFileSync(path.join(bin,'docker'),`#!/bin/sh\n: > '${marker}'\n`,{mode:0o700});execFileSync(path.join(bin,'docker'));expect(fs.existsSync(marker)).toBe(true);fs.unlinkSync(marker)
    const run=(head=git('rev-parse','HEAD'),extra:Record<string,string>={})=>{fs.writeFileSync(state,extra.TEST_OLD_RENAME==='1'?'old':'new');return execFileSync(process.execPath,[path.join(sourceRoot,'identity-portal/tests/auth-compatibility/run.mjs'),'--validate-sources'],{env:{...env,PATH:`${bin}:${process.env.PATH}`,AUTH_PROOF_CASE:'security-audit',AUTH_PROOF_HEAD:head,...extra},encoding:'utf8',stdio:'pipe'})}
    expect(JSON.parse(run())).toMatchObject({ qualificationCase:'security-audit',baseline:SECURITY_BASELINE,head:accepted,dockerAccessed:false })
    for(const file of ['identity-portal/pnpm-lock.yaml',SECURITY_PATCH,'identity-portal/pnpm-workspace.yaml','identity-portal/config/business-apps.yaml','identity-portal/drizzle.config.ts','identity-portal/unexpected.ts',docker]){
      git('reset','--hard',accepted);write(file,(fs.existsSync(path.join(checkout,file))?fs.readFileSync(path.join(checkout,file),'utf8'):'')+'\nchanged\n');const head=commit();expect(()=>run(head),file).toThrow()
    }
    git('reset','--hard',accepted);write(SECURITY_INPUTS,JSON.stringify({...config,baselineHashes:{...config.baselineHashes,'identity-portal/pnpm-lock.yaml':'a'.repeat(64)}}));expect(()=>run(commit())).toThrow('Security baseline hashes are immutable')
    git('reset','--hard',accepted);write(SECURITY_INPUTS,JSON.stringify({...config,candidateHashes:{...config.candidateHashes,[SECURITY_PATCH]:'PENDING'}}));expect(()=>run(commit())).toThrow('Unqualified candidate input')
    git('reset','--hard',accepted);git('mv','identity-portal/lib/synthetic-rename.ts','identity-portal/tests/auth-compatibility/synthetic-renamed.ts');const renamed=commit();expect(git('diff','--name-status','-M',accepted,renamed)).toContain('R100')
    expect(JSON.parse(run(renamed,{TEST_OLD_RENAME:'1'}))).toMatchObject({dockerAccessed:false});expect(()=>run(renamed)).toThrow('Unreviewed security qualification path')
    git('reset','--hard',accepted);expect(()=>run('b'.repeat(40))).toThrow();expect(()=>run(accepted,{AUTH_PROOF_CASE:'unknown'})).toThrow()
    expect(fs.readFileSync(calls,'utf8')).toContain(JSON.stringify(['diff','--name-only','--no-renames','-z',SECURITY_BASELINE,accepted]));expect(fs.existsSync(marker)).toBe(false)
  } finally { fs.rmSync(temp,{recursive:true,force:true}) }
})

it('binds actual archived input bytes before and after frozen installation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity48-archive-'))
  try {
    const paths = SECURITY_CANDIDATE_PATHS
    const hashes: Record<string,string> = {}
    for (const file of paths) { const relative = file.slice('identity-portal/'.length); const f = path.join(root,relative); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,file); hashes[file] = digest(file) }
    const bindings = { baselineHashes: Object.fromEntries(Object.entries(hashes).filter(([file])=>['identity-portal/package.json','identity-portal/pnpm-lock.yaml','identity-portal/pnpm-workspace.yaml'].includes(file))), candidateHashes: hashes }
    expect(()=>assertSecurityArchive(root,'baseline',bindings)).not.toThrow()
    expect(()=>assertSecurityArchive(root,'candidate',bindings)).not.toThrow()
    fs.appendFileSync(path.join(root,'pnpm-lock.yaml'),'drift')
    expect(()=>assertSecurityArchive(root,'candidate',bindings)).toThrow('Archived security input mismatch')
    expect(()=>assertSecurityArchive(root,'baseline',bindings)).toThrow('Archived security input mismatch')
  } finally { fs.rmSync(root,{recursive:true,force:true}) }
})

it('validates every exact sanitizer provenance path, immutable original and trusted upstream', () => {
  const provenance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../patches/monaco-editor@0.55.1.provenance.json'), 'utf8'))
  const bindings = { candidateHashes: { [SECURITY_PATCH]: provenance.patchSha256 } }
  expect(() => assertSecurityProvenance(provenance, bindings)).not.toThrow()
  for (const change of [
    (p: typeof provenance) => { p.assets.pop() },
    (p: typeof provenance) => { p.assets[1].path = p.assets[0].path },
    (p: typeof provenance) => { p.assets[0].path = '../shadow.js' },
    (p: typeof provenance) => { p.assets[0].originalSha256 = 'a'.repeat(64) },
    (p: typeof provenance) => { p.assets[0].upstreamSha256 = 'b'.repeat(64) },
    (p: typeof provenance) => { p.upstreamSha256 = 'b'.repeat(64) },
    (p: typeof provenance) => { p.patchSha256 = 'c'.repeat(64) },
    (p: typeof provenance) => { p.assets[0].patchedSha256 = 'PENDING' },
  ]) { const changed = structuredClone(provenance); change(changed); expect(() => assertSecurityProvenance(changed, bindings)).toThrow() }
  expect(Object.keys(SECURITY_ORIGINAL_ASSETS)).toHaveLength(3)
  expect(provenance.upstreamSha256).toBe(SECURITY_UPSTREAM)
})

it('reads actual installed candidate sanitizer bytes and refuses missing, changed and shadow copies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity48-installed-assets-'))
  const app = path.resolve(__dirname, '../..')
  try {
    const provenancePath = path.join(app, SECURITY_PROVENANCE.slice('identity-portal/'.length))
    const patchPath = path.join(app, SECURITY_PATCH.slice('identity-portal/'.length))
    const bindings = { candidateHashes: { [SECURITY_PROVENANCE]: digest(fs.readFileSync(provenancePath)), [SECURITY_PATCH]: digest(fs.readFileSync(patchPath)) } }
    const observed = securityInstalledAssets(app, 'candidate', bindings)
    expect(observed.assets).toHaveLength(3)
    expect(observed.sanitizerVersion).toBe('3.4.17')
    for (const file of [SECURITY_PATCH, SECURITY_PROVENANCE]) {
      const relative=file.slice('identity-portal/'.length);fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.copyFileSync(path.join(app,relative),path.join(root,relative))
    }
    const packageRoot=path.join(root,'node_modules/monaco-editor');fs.mkdirSync(packageRoot,{recursive:true})
    for (const asset of observed.assets) { const file=path.join(packageRoot,asset.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(app,'node_modules/monaco-editor',asset.path),file) }
    expect(securityInstalledAssets(root,'candidate',bindings)).toEqual(observed)
    expect(()=>securityInstalledAssets(root,'baseline',bindings)).toThrow('Installed sanitizer asset hash mismatch')
    const file=path.join(packageRoot,observed.assets[0].path);fs.renameSync(file,file+'.missing')
    expect(()=>securityInstalledAssets(root,'candidate',bindings)).toThrow('Unexpected or missing embedded sanitizer copy')
    fs.renameSync(file+'.missing',file);fs.appendFileSync(file,'\nchanged')
    expect(()=>securityInstalledAssets(root,'candidate',bindings)).toThrow('Installed sanitizer asset hash mismatch')
    fs.copyFileSync(path.join(app,'node_modules/monaco-editor',observed.assets[0].path),file)
    fs.copyFileSync(file,path.join(packageRoot,'shadow.js'))
    expect(()=>securityInstalledAssets(root,'candidate',bindings)).toThrow('Unexpected or missing embedded sanitizer copy')
  } finally { fs.rmSync(root,{recursive:true,force:true}) }
})

it('the actual runner writes source-bound installed-asset receipts for each security variant', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/run.mjs'), 'utf8')
  const start = source.indexOf("      if (selectedCase.name === 'security-audit') {")
  const end = source.indexOf('      summary.qualificationCase', start)
  expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start)
  for (const variant of ['baseline','candidate']) {
    const writes: Array<{file:string;data:unknown;options:unknown}> = [];const summary: Record<string,unknown> = {};const bindings = { exact:'source-bound' };const observed = { qualificationCase:'security-audit',variant,assets:[{path:'owned.js',sha256:'a'.repeat(64)}] }
    const deps = { selectedCase:{name:'security-audit'},summary,app:'/owned/app',variant,securityInputs:bindings,c:{evidenceDirectory:'/owned/evidence'},path,
      securityInstalledAssets:(app:string,v:string,input:unknown)=>{expect(app).toBe('/owned/app');expect(v).toBe(variant);expect(input).toBe(bindings);return observed},
      fs:{writeFileSync:(file:string,data:string,options:unknown)=>writes.push({file,data:JSON.parse(data),options})},hash:()=> 'b'.repeat(64),
    }
    new Function(...Object.keys(deps),source.slice(start,end))(...Object.values(deps))
    expect(summary.securityAssets).toBe(observed);expect(writes).toEqual([{file:'/owned/evidence/security-assets.json',data:observed,options:{mode:0o600}}])
    expect(Object.hasOwn(summary,'patchSha256')).toBe(variant==='candidate')
  }
})
