import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile,mkdir,unlink,readdir} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {connectFormalReadSource} from './formal-read-source.mjs'
const ref='vrufunuomioczocdsoer',fn='jnq-admin-formal',admin='jnqjourney-admin-formal',branch='read-only'
const origin=`https://${branch}.${admin}.pages.dev`,root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),pub=path.join(root,'production-publisher'),dir=path.join(pub,'text-activation-20261113')
const mode=process.argv[2];assert.ok(['--edge','--resume-confirmed-edge','--pages','--disable-writes'].includes(mode));assert.equal(process.argv[3],ref);assert.equal(process.argv.length,4)
const json=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''))
const settings=await json(path.join(pub,'settings.json')),roles=await json(path.join(pub,'verified-operator-allowlists.json'))
assert.equal(settings.projectRef,ref);assert.equal(roles.projectRef,ref)
for(const k of ['enabled','formalPublishingEnabled','formalUploadsEnabled'])assert.equal(settings[k],false)
assert.deepEqual(settings.formalEditorAuthIds,roles.editorAuthIds);assert.deepEqual(settings.formalPublisherAuthIds,roles.publisherAuthIds)
process.env.JNQ_SUPABASE_CLI=settings.supabaseCli;process.env.JNQ_WRANGLER_CLI=settings.wranglerCli
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex')
async function cli(args){try{return await run(process.execPath,[settings.supabaseCli,...args,'--project-ref',ref],{windowsHide:true,maxBuffer:2*1024**2,timeout:180000,env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}})}catch{throw Error('FORMAL_TEXT_CLI_RESULT_UNCONFIRMED_STOP')}}
const token=await privateWranglerToken()
async function cloud(name){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${name}`,{headers:{Authorization:'Bearer '+token},redirect:'error'});const p=await r.json();assert.ok(r.ok&&p.success,'PAGES_READ_FAILED');return p.result}
const before=await cloud('jnqjourney-static-recovery-candidate')
assert.equal(before.canonical_deployment.id,'333e51aa-506e-4a66-a7c6-4f28e3e890a1')
const fingerprint=p=>sha(JSON.stringify({canonical:p.canonical_deployment?.id,branch:p.production_branch,domains:p.domains,config:p.deployment_configs}))
async function flags(writes){const file=path.join(dir,'text-flags-'+Date.now()+'.env');await writeFile(file,Object.entries({JNQ_FORMAL_WRITES_ENABLED:String(writes),JNQ_FORMAL_UPLOADS_ENABLED:'false',JNQ_FORMAL_PUBLICATION_ENABLED:'false',JNQ_FORMAL_PRIVATE_AUTHORITY_READY:'true',JNQ_FORMAL_ANON_BOUNDARY_READY:'true',JNQ_FORMAL_PRIVATE_MEDIA_READY:'false'}).map(([k,v])=>k+'='+v).join('\n'),{flag:'wx'});try{await cli(['secrets','set','--env-file',file])}finally{await unlink(file)}}
if(mode==='--disable-writes'){await flags(false);console.log('FORMAL_TEXT_WRITES_DISABLED');process.exit(0)}
assert.equal((await json(path.join(dir,'bootstrap-result.json'))).copied,8)
const source=await connectFormalReadSource()
for(const id of new Set([...roles.editorAuthIds,...roles.publisherAuthIds]))assert.equal(await source.confirmedOperator(id),id)
if(mode==='--resume-confirmed-edge'){
 const proof=await json(path.join(dir,'edge-source-reconciled.json')),submission=await json(path.join(dir,'edge-submission.json'))
 assert.ok(proof.exactRemoteSourceMatchesLocal&&proof.verifyJwt&&proof.sourceSha256===submission.sha256&&proof.projectRef===ref)
 const current=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===fn)
 assert.ok(current.verify_jwt&&current.status==='ACTIVE'&&current.version>=proof.version&&current.ezbr_sha256===proof.ezbrSha256)
 await flags(true)
 const after=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===fn)
 assert.ok(after.id===current.id&&after.verify_jwt&&after.status==='ACTIVE'&&after.ezbr_sha256===current.ezbr_sha256,'EDGE_SOURCE_CHANGED_STOP')
 const receipt={function:fn,id:after.id,version:after.version,verifyJwt:true,sourceSha256:submission.sha256,remoteSourceVerified:true,writes:true,uploads:false,publication:false}
 await writeFile(path.join(dir,'edge-result-version-'+after.version+'.json'),JSON.stringify(receipt),{flag:'wx'})
 await writeFile(path.join(dir,'edge-result.json'),JSON.stringify(receipt));console.log(JSON.stringify(receipt))
}else if(mode==='--edge'){
 const functions=JSON.parse((await cli(['functions','list','--output','json'])).stdout)
 const prior=await json(path.join(pub,'read-only-edge-deployment.json')),current=functions.find(v=>v.slug===fn)
 assert.ok(current?.id===prior.id&&current.version===prior.version&&current.verify_jwt&&current.status==='ACTIVE','EDGE_CHANGED_STOP')
 await writeFile(path.join(dir,'edge-before.json'),JSON.stringify(prior),{flag:'wx'})
 const work=path.join(dir,'text-edge'),folder=path.join(work,'supabase/functions',fn)
 await mkdir(folder,{recursive:true})
 const {build}=await import(pathToFileURL(path.resolve(path.dirname(settings.wranglerCli),'../../esbuild/lib/main.js')).href)
 await build({entryPoints:['cloudflare/admin-preview/formal-text-edge.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['npm:*'],outfile:path.join(folder,'index.ts')})
 const bytes=await readFile(path.join(folder,'index.ts'))
 await writeFile(path.join(work,'supabase/config.toml'),`project_id = "jnq-formal-text-phase1"\n[functions.${fn}]\nverify_jwt = true\nentrypoint = "./functions/${fn}/index.ts"\n`)
 await writeFile(path.join(dir,'edge-submission.json'),JSON.stringify({function:fn,sha256:sha(bytes),at:new Date().toISOString(),writes:true,uploads:false,publication:false}),{flag:'wx'})
 await flags(true)
 await cli(['functions','deploy',fn,'--workdir',work,'--use-api','--yes'])
 const deployed=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===fn)
 // Secret changes also advance the deployed revision. Never infer source
 // identity from an assumed +1; reconcile actual code if this is uncertain.
 assert.ok(deployed.status==='ACTIVE'&&deployed.verify_jwt&&deployed.id===prior.id&&deployed.version>prior.version)
 const receipt={function:fn,id:deployed.id,version:deployed.version,verifyJwt:true,sourceSha256:sha(bytes),writes:true,uploads:false,publication:false}
 await writeFile(path.join(dir,'edge-result.json'),JSON.stringify(receipt),{flag:'wx'});console.log(JSON.stringify(receipt))
}else{
 assert.equal((await json(path.join(dir,'acceptance.json'))).result,'FORMAL_TEXT_REAL_SAVE_PASS')
 const p=await cloud(admin);assert.ok(!p.canonical_deployment&&p.production_branch==='reserved-production'&&!p.source)
 const pkg=await json(path.join(pub,'frontend-managed-off/package.json'));assert.ok(pkg.preparedOff&&pkg.zeroFunctions&&pkg.projectRef===ref)
 const out=path.resolve(pkg.out);assert.ok(out.startsWith(path.join(pub,'frontend-managed-off')+path.sep))
 const entries=await readdir(out,{recursive:true,withFileTypes:true});const files=entries.filter(v=>v.isFile())
 assert.ok(files.length<20000&&!files.some(v=>['functions','_worker.js','_routes.json'].includes(v.name)))
 assert.match(await readFile(path.join(out,'_headers'),'utf8'),/X-Robots-Tag: noindex/)
 for(const file of files.filter(v=>/\.(html|js|json|txt)$/.test(v.name))){const s=await readFile(path.join(file.parentPath,file.name),'utf8');for(const id of [...roles.editorAuthIds,...roles.publisherAuthIds])assert.ok(!s.includes(id));assert.ok(!s.includes('rnamstwwbzknwbjwdgrf'))}
 const commit=sha(await readFile(path.join(dir,'acceptance.json'))).slice(0,40)
 await writeFile(path.join(dir,'pages-submission.json'),JSON.stringify({branch,commit,out,at:new Date().toISOString()}),{flag:'wx'})
 await writeFile(path.join(dir,'wrangler.jsonc'),JSON.stringify({name:admin,pages_build_output_dir:out}))
 try{await run(process.execPath,[settings.wranglerCli,'pages','deploy',out,'--project-name',admin,'--branch',branch,'--commit-hash',commit,'--commit-dirty=true','--force'],{cwd:dir,windowsHide:true,maxBuffer:2*1024**2,timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false'}})}catch{throw Error('ADMIN_TEXT_UPLOAD_UNCERTAIN_RECONCILE_NO_RETRY')}
 const current=await cloud(admin),d=current.latest_deployment
 assert.ok(!current.canonical_deployment&&d.environment==='preview'&&d.deployment_trigger.metadata.branch===branch&&d.deployment_trigger.metadata.commit_hash===commit&&!d.uses_functions&&d.latest_stage.status==='success')
 const r=await fetch(origin+'/admin',{redirect:'error'});assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);await r.body?.cancel()
 const result={url:origin+'/admin',deploymentId:d.id,fixedUrl:d.url,functions:0,writes:true,uploads:false,publication:false}
 await writeFile(path.join(dir,'pages-result.json'),JSON.stringify(result),{flag:'wx'});console.log(JSON.stringify(result))
}
assert.equal(fingerprint(await cloud('jnqjourney-static-recovery-candidate')),fingerprint(before),'PUBLIC_SITE_CHANGED')
