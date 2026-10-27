import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawn,execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url)
export const EXPECTED_PACKAGE_VERSIONS={express:[],shadcn:['4.23.0'],vitest:['4.1.12'],'@vitest/coverage-v8':['4.1.12'],esbuild:['0.18.20','0.25.12','0.28.2'],dompurify:['3.4.17'],'fast-uri':['3.1.9'],'ip-address':['10.7.5'],'brace-expansion':['1.1.21','5.0.12'],'source-map-js':['1.2.2'],'proxy-addr':[],'@modelcontextprotocol/sdk':[],handlebars:['4.7.10'],hono:[],vite:['8.3.5'],'@vitest/mocker':['4.1.12'],zod:['4.6.7'],'body-parser':[],undici:['7.30.1'],'postcss-selector-parser':['7.1.7'],next:['16.4.2'],react:['19.3.1'],'react-dom':['19.3.1'],'monaco-editor':['0.55.1'],'monaco-yaml':['5.5.1'],'monaco-worker-manager':['2.0.1']}
export const EXPECTED_ZOD_SOURCE={"version":"4.6.7","sourceLockSha256":"3e443a164b8b26b18cff335d548c7ac9a13d4af349aebc2367bf7b5d778a2fa1","packageSha256":"c2d190d9ee4e0bdb60332aaa2130a6a98d65ddb903fe1d29248b15de57832c45","entries":{"commonjs":{"path":"index.cjs","sha256":"d93a8730d52c0fedab13619c8bc971cc99934c13d8dce7c97ee4d03a98d4096e"},"module":{"path":"index.js","sha256":"32e7efd49a94a765f6d10a1a0a3c02c50c246def17c80c6f0225f85525d98505"}},"implementationTreeFormat":"UTF8-JSON-array-of-{path,sha256}-ASCII-path-order","implementationTreeSha256":"4111f26d65c60cd9a9d24c6985bdf9a7525032f922f0cededfad8a199f38f1c7","implementationFiles":248}
export const FRAMEWORK_VENDOR={sha256:'af7deaaff50a14c7d8b52f518e10dac800a350bf8eef43f8454006fa7a44e4da',bytes:77325,followup:'https://github.com/tiangong-lca/identity-center/issues/49'}
const sha=b=>createHash('sha256').update(b).digest('hex')

// Self-contained: exactly this function runs in a network-disabled, read-only image Node process.
export function inspectImageFilesystem(target,root,expected,{staticRoot}={}){
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto')
 assert.ok(['runner','worker'].includes(target));assert.match(expected.source,/^[a-f0-9]{40}$/)
 root=path.resolve(root);const actualRoot=fs.realpathSync(root);const staticPath=path.resolve(staticRoot??path.join(root,'.next/static'));const allowed=[actualRoot,...(staticRoot?[fs.realpathSync(staticPath)]:[])]
 const limits={files:6000,bytes:128*1024**2,fileBytes:16*1024**2,depth:32};let files=0,bytes=0
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
 const inside=(base,file)=>file===base||file.startsWith(base+path.sep)
 function read(file){file=path.resolve(file);const real=fs.realpathSync(file);assert.ok(allowed.some(base=>inside(base,real)),'Image file escapes approved root');const st=fs.statSync(real);assert.ok(st.isFile()&&st.size<=limits.fileBytes,'Image file size exceeded');files++;bytes+=st.size;assert.ok(files<=limits.files&&bytes<=limits.bytes,'Image inventory exceeded');return fs.readFileSync(real)}
 const relative=file=>inside(staticPath,path.resolve(file))?'.next/static/'+path.relative(staticPath,file).split(path.sep).join('/'):path.relative(root,file).split(path.sep).join('/')
 const record=file=>{const data=read(file);return{path:relative(file),bytes:data.length,sha256:hash(data)}}
 const json=file=>JSON.parse(read(file).toString())
 function walk(dir,filter,depth=0){assert.ok(depth<=limits.depth,'Image directory depth exceeded');const list=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);assert.equal(e.isSymbolicLink(),false,'Refuse image inventory symlink');if(e.isDirectory())list.push(...walk(f,filter,depth+1));else if(e.isFile()&&filter(f))list.push(f);assert.ok(list.length<=limits.files,'Image file count exceeded')}return list}
 const frameworkPath=path.join(root,'node_modules/next/dist/compiled/zod/index.cjs'),framework=record(frameworkPath);assert.equal(framework.sha256,expected.frameworkVendor.sha256,'Known framework vendor bytes changed');assert.equal(framework.bytes,expected.frameworkVendor.bytes);const next=json(path.join(root,'node_modules/next/package.json'));assert.equal(next.version,'16.4.2')
 const frameworkVendor={...framework,namespace:'framework-vendored-zod',sourceNextVersion:next.version,vendorVersion:'not-asserted',status:'tracked-open-not-fixed',followup:expected.frameworkVendor.followup}
 let worker=null,runner=null
 if(target==='worker'){
  const observed={};for(const[file,digest]of Object.entries(expected.inputHashes)){assert.ok(file.startsWith('identity-portal/'));const rel=file.slice('identity-portal/'.length);observed[file]=hash(read(path.join(root,rel)));assert.equal(observed[file],digest,'Worker source input mismatch')}
  const provenance=json(path.join(root,'patches/monaco-editor@0.55.1.provenance.json'));assert.deepEqual(provenance.assets.map(a=>a.path).sort(),['dev/vs/editor.api-CykLys8L.js','esm/vs/base/browser/dompurify/dompurify.js','min/vs/editor.api-CalNCsUg.js'].sort(),'Require all three exact embedded copies');assert.equal(provenance.patchSha256,expected.provenance.patchSha256);assert.deepEqual(provenance.assets,expected.provenance.assets)
  const wanted=Object.keys(expected.packageVersions),found=new Map(wanted.map(n=>[n,new Map()]));const candidates=[]
  for(const n of wanted)candidates.push(path.join(root,'node_modules',n,'package.json'))
  const store=path.join(root,'node_modules/.pnpm');if(fs.existsSync(store))for(const d of fs.readdirSync(store,{withFileTypes:true})){if(!d.isDirectory()||d.name==='node_modules')continue;for(const n of wanted)candidates.push(path.join(store,d.name,'node_modules',n,'package.json'))}
  for(const file of candidates){if(!fs.existsSync(file))continue;const real=fs.realpathSync(file);const data=json(file);if(!found.has(data.name))continue;if(found.get(data.name).has(real))continue;found.get(data.name).set(real,{name:data.name,version:data.version,...record(file)})}
  const packageInventory=[];for(const name of wanted){const entries=[...found.get(name).values()];const versions=[...new Set(entries.map(x=>x.version))].sort();assert.deepEqual(versions,[...expected.packageVersions[name]].sort(),'Worker security package inventory mismatch: '+name);packageInventory.push({name,versions,packages:entries})}
  const sanitizers=provenance.assets.map(asset=>{const file=path.join(root,'node_modules/monaco-editor',asset.path),actual=record(file);assert.equal(actual.sha256,asset.patchedSha256,'Worker embedded sanitizer mismatch');return{...actual,namespace:'monaco-embedded-sanitizer'}})
  const zodRoot=fs.realpathSync(path.join(root,'node_modules/zod')),zodPackage=json(path.join(zodRoot,'package.json'))
  function publicExport(value,format){if(typeof value==='string')return value;assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Unsupported public export');for(const[key,entry]of Object.entries(value))if(['node',format,'default'].includes(key))return publicExport(entry,format);assert.fail('Missing public format export')}
  const entries=['require','import'].map(format=>{const relativeEntry=publicExport(zodPackage.exports?.['.'],format);assert.ok(relativeEntry.startsWith('./'));const file=path.resolve(zodRoot,relativeEntry);assert.ok(inside(zodRoot,fs.realpathSync(file)),'Zod export escapes package');return{format:format==='require'?'commonjs':'module',resolution:'declared-public-export-conditions',...record(file)}})
  const tree=walk(zodRoot,f=>/\.(?:c?js|mjs)$/.test(f)).map(file=>({path:path.relative(zodRoot,file).split(path.sep).join('/'),sha256:hash(read(file))})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
  assert.equal(hash(read(path.join(zodRoot,'package.json'))),expected.zodSource.packageSha256,'Worker Zod package bytes mismatch');for(const entry of entries){assert.equal(path.relative(zodRoot,path.join(root,entry.path)).split(path.sep).join('/'),expected.zodSource.entries[entry.format].path,'Worker Zod declared entry path mismatch');assert.equal(entry.sha256,expected.zodSource.entries[entry.format].sha256,'Worker Zod entry bytes mismatch')}assert.equal(hash(JSON.stringify(tree)),expected.zodSource.implementationTreeSha256,'Worker Zod implementation bytes mismatch');assert.equal(tree.length,expected.zodSource.implementationFiles);
  const zod={namespace:'application-zod-package',version:zodPackage.version,package:record(path.join(zodRoot,'package.json')),entries,implementationTreeSha256:hash(JSON.stringify(tree)),implementationFiles:tree.length}
  worker={imageObservedInputHashes:observed,sanitizers,packageInventory,zod,knownResiduals:[{module:'esbuild',version:'0.18.20',status:'tracked-open-not-fixed',followup:expected.frameworkVendor.followup}]}
 }else{
  const buildId=read(path.join(root,'.next/BUILD_ID')).toString().trim();assert.ok(buildId.length>0&&buildId.length<256)
  const appMapPath=path.join(root,'.next/server/app-paths-manifest.json'),appMap=json(appMapPath),manifests=[record(appMapPath),record(path.join(root,'.next/build-manifest.json')),record(path.join(root,'.next/routes-manifest.json'))]
  const serverRoot=path.join(root,'.next/server');const serverFiles=walk(serverRoot,f=>/\.(?:js|json)$/.test(f));const staticFiles=walk(staticPath,f=>f.endsWith('.js'))
  const textCache=new Map();const text=file=>{if(!textCache.has(file))textCache.set(file,read(file).toString());return textCache.get(file)}
  const loadables=serverFiles.filter(f=>path.basename(f)==='react-loadable-manifest.json').map(file=>({file,data:json(file)}))
  function browserAssociations(file){const publicPath='static/'+path.relative(staticPath,file).split(path.sep).join('/'),found=[];for(const item of loadables){const routeFile=path.dirname(item.file)+'.js';const routeEntry=path.relative(serverRoot,routeFile).split(path.sep).join('/');const routes=Object.entries(appMap).filter(([,value])=>value===routeEntry);for(const[id,value]of Object.entries(item.data)){if(Array.isArray(value.files)&&value.files.includes(publicPath)&&routes.length){for(const[route]of routes)found.push({kind:'route-associated-loadable-module',scope:'transitive route-map to sibling loadable manifest to emitted file; not direct route.js import',route,moduleId:id,manifest:record(item.file),routeFile:record(routeFile)})}}}assert.ok(found.length,'No actual loadable/route association');return found}
  const zodMarkers=s=>s.includes('major:4,minor:6,patch:7')&&s.includes('sizeCaps')&&s.includes('ZodArray')&&s.includes('too_big')
  const browserSanitizers=staticFiles.filter(f=>text(f).includes('DOMPurify')&&text(f).includes('3.4.17')).map(f=>{assert.ok(!text(f).includes('3.2.7'),'Old sanitizer in shipped chunk');assert.ok(text(f).includes('sanitize')&&text(f).includes('IN_PLACE'),'Sanitizer code anchors absent');return{...record(f),namespace:'monaco-sanitizer-output',versionProjection:'3.4.17',codeAnchors:['DOMPurify','sanitize','IN_PLACE'],associations:browserAssociations(f)}})
  assert.ok(browserSanitizers.length>0&&browserSanitizers.length<=4,'Missing or ambiguous shipped sanitizer outputs')
  const clientZod=staticFiles.filter(f=>zodMarkers(text(f))).map(f=>({...record(f),namespace:'application-zod-client-output',versionProjection:'4.6.7',codeAnchors:['sizeCaps','ZodArray','too_big'],associations:browserAssociations(f)}));assert.ok(clientZod.length>0&&clientZod.length<=8,'Missing application client Zod output')
  const serverZod=serverFiles.filter(f=>f.endsWith('.js')&&zodMarkers(text(f))).map(file=>{
   const associations=[];for(const[route,value]of Object.entries(appMap)){const routeFile=path.join(serverRoot,value),trace=routeFile+'.nft.json';if(!fs.existsSync(trace))continue;const data=json(trace);assert.ok(Array.isArray(data.files));if(data.files.some(ref=>path.resolve(path.dirname(trace),ref)===file))associations.push({kind:'route-nft-output-dependency',route,trace:record(trace),routeFile:record(routeFile),directLiteralReference:text(routeFile).includes(path.basename(file))})}
   assert.ok(associations.length,'No actual server route/trace association');return{...record(file),namespace:'application-zod-server-output',versionProjection:'4.6.7',codeAnchors:['sizeCaps','ZodArray','too_big'],associations}
  });assert.ok(serverZod.length>0&&serverZod.length<=8,'Missing application server Zod output')
  const appPackage=record(path.join(root,'package.json'));assert.equal(appPackage.sha256,expected.inputHashes['identity-portal/package.json'],'Runner project manifest mismatch')
  runner={buildId,manifests,appPackage,browserSanitizers,clientZod,serverZod,associationScope:'actual emitted files and discovered loadable/nft associations; static source/output binding, not behavioral or app-start proof'}
 }
 return{schema:1,target,source:expected.source,hostExpectedInputHashes:expected.inputHashes,hostInputScope:'committed source expectations; only Worker reports observed raw lock/workspace/patch inputs',frameworkVendor,worker,runner,inventory:{files,bytes},scope:staticRoot?'offline-split-root-retained-B':'image-root-filesystem'}
}

export function buildExpected(root,source){
 assert.match(source,/^[a-f0-9]{40}$/);const app=path.join(root,'identity-portal'),inputs=JSON.parse(fs.readFileSync(path.join(app,'tests/auth-compatibility/security-inputs.json'),'utf8'))
 for(const[file,digest]of Object.entries(inputs.candidateHashes)){assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(sha(fs.readFileSync(path.join(root,file))),digest,'Host expected source input mismatch')}
 return{source,inputHashes:inputs.candidateHashes,provenance:JSON.parse(fs.readFileSync(path.join(app,'patches/monaco-editor@0.55.1.provenance.json'),'utf8')),packageVersions:EXPECTED_PACKAGE_VERSIONS,zodSource:EXPECTED_ZOD_SOURCE,frameworkVendor:FRAMEWORK_VENDOR}
}
// Join the existing bounded supervisor on every path, including host-only
// signals. The shell cannot report cleanup while its detached transport lives.
export function imageInspectionCommand(executable,args,{timeout,maxBuffer}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{stdio:['ignore','pipe','pipe']})
  let stdout='',bytes=0,failed=false,cancelCode=null
  const stop=signal=>{try{child.kill(signal)}catch{}}
  const onInt=()=>{cancelCode??=130;stop('SIGINT')},onTerm=()=>{cancelCode??=143;stop('SIGTERM')}
  process.on('SIGINT',onInt);process.on('SIGTERM',onTerm)
  // Reserve the unchanged 2s supervisor grace plus a 1s close margin inside
  // the 65s host bound; the command itself still has its original 60s deadline.
  const deadline=setTimeout(()=>{failed=true;stop('SIGTERM')},timeout-3000)
  const ceiling=setTimeout(()=>{failed=true;stop('SIGKILL');child.stdout.destroy();child.stderr.destroy()},timeout)
  const clean=()=>{clearTimeout(deadline);clearTimeout(ceiling);process.off('SIGINT',onInt);process.off('SIGTERM',onTerm)}
  const data=(buffer,retain)=>{bytes+=buffer.length;if(bytes>maxBuffer){failed=true;stop('SIGTERM')}else if(retain&&!failed)stdout+=buffer.toString()}
  child.stdout.on('data',buffer=>data(buffer,true));child.stderr.on('data',buffer=>data(buffer,false))
  child.on('error',()=>{clean();reject(new Error('Owned image transport could not start'))})
  child.on('close',(code,signal)=>{clean();resolve({status:cancelCode??(failed?1:code??(signal==='SIGINT'?130:143)),stdout,cancelCode})})
 })
}
/** @param {(executable:string,args:string[],options:{timeout:number,maxBuffer:number})=>unknown} [transport] */
export async function runImageInspection(options,transport=imageInspectionCommand){
 const{target,image,name,evidence,source,imageInfo,root}=options;assert.ok(['runner','worker'].includes(target));assert.match(image,/^identity41-node24-\d+-\d+:(runner|worker)$/);assert.match(name,/^identity41-node24-\d+-\d+-(runner|worker)$/);assert.ok(image.endsWith(':'+target)&&name.endsWith('-'+target));assert.ok(path.isAbsolute(evidence)&&path.isAbsolute(imageInfo));const expected=buildExpected(root,source)
 const info=fs.readFileSync(imageInfo,'utf8').trim();assert.match(info,/^sha256:[a-f0-9]{64} linux\/amd64$/);const imageId=info.split(' ')[0]
 assert.equal(expected.zodSource.sourceLockSha256,expected.inputHashes['identity-portal/pnpm-lock.yaml']);
 const program=`try{const assert=require('node:assert/strict');assert.equal(process.version,'v24.22.1');assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');const input=JSON.parse(process.argv[1]);const filesystem=(${inspectImageFilesystem.toString()})(input.target,'/app',input.expected);process.stdout.write(JSON.stringify({schema:1,target:input.target,source:input.expected.source,imageId:input.imageId,nodeVersion:process.version,platform:process.platform,arch:process.arch,filesystem}));}catch{process.stderr.write('Owned image security inspection failed\\n');process.exitCode=1}`
 const args=[fileURLToPath(new URL('./bounded-command.mjs',import.meta.url)),'60000','2000','docker','run','--rm','--name',name,'--label',`org.tiangong.identity-proof=${image.split(':')[0]}`,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',imageId,'-e',program,JSON.stringify({target,expected,imageId})]
 const response=await transport(process.execPath,args,{timeout:65000,maxBuffer:128*1024});
 if(response.cancelCode)throw Object.assign(new Error('Owned image proof cancelled'),{exitCode:response.cancelCode})
 assert.equal(response.status,0,'Image inspection command failed');assert.ok(response.stdout&&Buffer.byteLength(response.stdout)<=128*1024,'Bound image receipt')
 const result=JSON.parse(response.stdout);assert.equal(result.schema,1);assert.equal(result.target,target);assert.equal(result.source,source);assert.equal(result.imageId,imageId);assert.equal(result.nodeVersion,'v24.22.1');assert.equal(result.platform,'linux');assert.equal(result.arch,'x64');assert.equal(result.filesystem?.target,target);assert.equal(result.filesystem?.source,source);assert.equal(result.filesystem?.scope,'image-root-filesystem')
 fs.writeFileSync(path.join(evidence,`${target}-security.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});fs.writeFileSync(path.join(evidence,`${target}-node.txt`),result.nodeVersion+'\n',{mode:0o600});return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);assert.ok(args.length===12||args.length===14);const o={};for(let i=0;i<args.length;i+=2){assert.ok(['--target','--image','--name','--evidence','--source','--image-info','--root'].includes(args[i]));assert.ok(!Object.hasOwn(o,args[i]));o[args[i]]=args[i+1]}
  const root=o['--root']??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),o['--source']);assert.equal(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}),'')
  await runImageInspection({target:o['--target'],image:o['--image'],name:o['--name'],evidence:o['--evidence'],source:o['--source'],imageInfo:o['--image-info'],root})
 }catch(error){process.stderr.write('Owned image proof failed\n');process.exitCode=[130,143].includes(error?.exitCode)?error.exitCode:1}
}
