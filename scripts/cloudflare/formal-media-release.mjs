import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {createClient} from '@supabase/supabase-js'
import {getFormalKey} from './formal-read-source.mjs'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer',bucket='jnqjourney-admin-private-media',origin='https://read-only.jnqjourney-admin-formal.pages.dev',fn='jnq-admin-formal',probe='jnq-admin-media-check'
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),pub=path.join(root,'production-publisher'),dir=path.join(pub,'media-resume-20261113')
const mode=process.argv[2];assert.ok(['--stage','--resume-test','--pages','--pages-update','--activate','--stop'].includes(mode));assert.equal(process.argv[3],ref);assert.equal(process.argv.length,4)
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,'')),sha=b=>createHash('sha256').update(b).digest('hex')
const s=await json(path.join(pub,'settings.json'));assert.equal(s.projectRef,ref);assert.equal(s.formalWritesEnabled,true);assert.equal(s.enabled,false);assert.equal(s.formalPublishingEnabled,false)
process.env.JNQ_SUPABASE_CLI=s.supabaseCli;process.env.JNQ_WRANGLER_CLI=s.wranglerCli
const run=promisify(execFile)
async function cli(args){try{return await run(process.execPath,[s.supabaseCli,...args,'--project-ref',ref],{windowsHide:true,timeout:180000,maxBuffer:2*1024**2})}catch{throw Error('MEDIA_CLI_RESULT_UNCONFIRMED_STOP')}}
async function flags(values){const file=path.join(dir,'flags-'+Date.now()+'.env');await writeFile(file,Object.entries({JNQ_FORMAL_WRITES_ENABLED:'true',JNQ_FORMAL_PUBLICATION_ENABLED:'false',...values}).map(([k,v])=>k+'='+v).join('\n'),{flag:'wx'});try{await cli(['secrets','set','--env-file',file])}finally{await unlink(file)}}
if(mode==='--stop'){await flags({JNQ_FORMAL_UPLOADS_ENABLED:'false',JNQ_FORMAL_MEDIA_TEST_ENABLED:'false'});s.formalUploadsEnabled=false;await writeFile(path.join(pub,'settings.json'),JSON.stringify(s,null,2));console.log('UPLOAD_OFF_TEXT_REMAINS_ON');process.exit(0)}
const admitted=await json(path.join(dir,'preflight.json'));assert.ok(admitted.standardStorage&&!admitted.managedPublic&&!admitted.customDomains&&admitted.secretNamesPresent)
const token=await privateWranglerToken(),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'}
async function cloud(resource,method='GET',body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/${resource}`,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)}),p=await r.json();if(method==='GET'&&r.status===404)return null;assert.ok(r.ok&&p.success,'CLOUDFLARE_CONFIGURATION_UNCONFIRMED');return p.result}
const production=await cloud('pages/projects/jnqjourney-static-recovery-candidate');assert.equal(production.canonical_deployment.id,'333e51aa-506e-4a66-a7c6-4f28e3e890a1')
const fingerprint=p=>sha(JSON.stringify({canonical:p.canonical_deployment?.id,config:p.deployment_configs,domains:p.domains,branch:p.production_branch}))
async function deploy(name,entry){
 const work=path.join(dir,'deploy-'+name+'-'+Date.now()),folder=path.join(work,'supabase/functions',name);await mkdir(folder,{recursive:true})
 const {build}=await import(pathToFileURL(path.resolve(path.dirname(s.wranglerCli),'../../esbuild/lib/main.js')).href)
 await build({entryPoints:[entry],bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['npm:*'],outfile:path.join(folder,'index.ts')})
 const code=await readFile(path.join(folder,'index.ts'));await writeFile(path.join(work,'supabase/config.toml'),`project_id = "jnq-formal-media-phase2"\n[functions.${name}]\nverify_jwt = true\nentrypoint = "./functions/${name}/index.ts"\n`)
 await writeFile(path.join(work,'submission.json'),JSON.stringify({name,sha256:sha(code),at:new Date().toISOString()}),{flag:'wx'})
 await cli(['functions','deploy',name,'--workdir',work,'--use-api','--yes'])
 const f=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===name);assert.ok(f?.status==='ACTIVE'&&f.verify_jwt,'EDGE_DEPLOYMENT_UNCONFIRMED')
 return {name,id:f.id,version:f.version,verifyJwt:true,ezbrSha256:f.ezbr_sha256,sourceSha256:sha(code),work}
}
if(mode==='--resume-test'){
 const prior=await json(path.join(dir,'acceptance.json')),stage=await json(path.join(dir,'stage-result.json'))
 const observationOnly=prior.failedPhase==='upload-spot'&&prior.r2Calls===1&&!prior.mediaName
 const completedBeforeDenial=prior.failedPhase==='bytes'&&prior.checks.includes('guide_server_verified_complete')&&prior.checks.includes('real_chrome_image_decode')&&!prior.checks.includes('spot_private_reference_saved')
 assert.ok(prior.result==='FORMAL_MEDIA_ADMISSION_FAIL'&&(observationOnly||completedBeforeDenial)&&prior.uploadStoppedTextOn,'UNSAFE_RESUME_CHECKPOINT')
 const functions=JSON.parse((await cli(['functions','list','--output','json'])).stdout)
 for(const r of [stage.text,stage.check]){const f=functions.find(v=>v.slug===r.name);assert.ok(f.id===r.id&&f.verify_jwt&&f.ezbr_sha256===r.ezbrSha256,'SOURCE_CHANGED_NO_RESUME')}
 await flags({JNQ_FORMAL_UPLOADS_ENABLED:'false',JNQ_FORMAL_MEDIA_TEST_ENABLED:'true'})
 console.log('RESTRICTED_TEST_RESUMED_UPLOAD_REMAINS_OFF')
}else if(mode==='--stage'){
 assert.equal(s.formalUploadsEnabled,false)
 const before=JSON.parse((await cli(['functions','list','--output','json'])).stdout),old=before.find(v=>v.slug===fn),proof=await json(path.join(dir,'prior-code.json'))
 assert.ok(old.id===proof.id&&old.version===proof.version&&old.ezbr_sha256===proof.ezbrSha256&&proof.sourceMatchesAcceptedTextRelease&&!before.some(v=>v.slug===probe),'FORMAL_BASELINE_CHANGED_STOP')
 const db=createClient(`https://${ref}.supabase.co`,await getFormalKey(),{auth:{persistSession:false}}),previous=await json(path.join(pub,'text-activation-20261113/acceptance.json'))
 const spot=await db.from('locations').select('*').eq('id',previous.created.spotId).single();assert.ok(!spot.error&&spot.data.publication_status==='hidden')
 async function collection(name){const b=db.storage.from('jnq-admin-formal-publication'),p=await b.download('_system/'+name+'-latest.webp');assert.ok(!p.error);const pointer=(await p.data.text()).trim();const r=await b.download(pointer);assert.ok(!r.error);return JSON.parse(await r.data.text())}
 const note=(await collection('notes')).find(v=>v.slug===previous.created.noteSlug),guide=(await collection('guides')).find(v=>v.slug===previous.created.guideSlug)
 assert.ok(note?.published===false&&guide?.published===false)
 const pixels=Buffer.alloc(96*64*3);for(let i=0;i<pixels.length;i++)pixels[i]=(i*37+13)%256
 const bytes=await sharp(pixels,{raw:{width:96,height:64,channels:3}}).png().toBuffer();assert.ok(bytes.length<65536)
 const targets=[{kind:'spot',target:spot.data.id,expectedVersion:spot.data.updated_at},{kind:'note',target:note.slug,expectedVersion:note.updatedAt||''},{kind:'guide',target:guide.slug,expectedVersion:guide.updatedAt||''}]
 await writeFile(path.join(dir,'fixture.png'),bytes,{flag:'wx'});await writeFile(path.join(dir,'fixtures.json'),JSON.stringify({sha256:sha(bytes),size:bytes.length,targets,before:{spot:spot.data,note,guide}}),{flag:'wx'})
 const cors={rules:[{allowed:{origins:[origin],methods:['PUT'],headers:['Content-Type','If-None-Match']},exposeHeaders:['ETag'],maxAgeSeconds:0}]}
 const oldCors=await cloud('r2/buckets/'+bucket+'/cors');await writeFile(path.join(dir,'cors-before.json'),JSON.stringify(oldCors),{flag:'wx'})
 await cloud('r2/buckets/'+bucket+'/cors','PUT',cors)
 const checked=await cloud('r2/buckets/'+bucket+'/cors');assert.deepEqual(checked.rules[0].allowed.origins,[origin]);assert.equal(checked.rules.length,1)
 await flags({JNQ_FORMAL_UPLOADS_ENABLED:'false',JNQ_FORMAL_PRIVATE_MEDIA_READY:'true',JNQ_FORMAL_MEDIA_TEST_ENABLED:'true',JNQ_FORMAL_MEDIA_TEST_SHA:sha(bytes),JNQ_FORMAL_MEDIA_TEST_SIZE:String(bytes.length),JNQ_FORMAL_MEDIA_TEST_TARGETS:JSON.stringify(targets)})
 const text=await deploy(fn,'cloudflare/admin-preview/formal-text-edge.ts'),check=await deploy(probe,'cloudflare/admin-preview/formal-media-check-edge.ts')
 await writeFile(path.join(dir,'stage-result.json'),JSON.stringify({text,check,upload:false,publication:false}),{flag:'wx'});console.log(JSON.stringify({textVersion:text.version,testVersion:check.version,upload:false,corsOrigin:origin}))
}else if(mode==='--pages'||mode==='--pages-update'){
 assert.equal((await json(path.join(dir,'stage-result.json'))).upload,false)
 const project='jnqjourney-admin-formal',p=await cloud('pages/projects/'+project);assert.ok(!p.canonical_deployment&&p.production_branch==='reserved-production')
 if(mode==='--pages-update'){const prior=await json(path.join(dir,'pages-result.json'));assert.equal(p.latest_deployment.id,prior.deploymentId);await writeFile(path.join(dir,'pages-before-autosave-fix.json'),JSON.stringify(prior),{flag:'wx'})}
 const pkg=await json(path.join(pub,'frontend-managed-off/package.json'));assert.ok(pkg.zeroFunctions&&pkg.preparedOff&&pkg.projectRef===ref);const out=path.resolve(pkg.out);assert.ok(out.startsWith(path.join(pub,'frontend-managed-off')+path.sep));assert.match(await readFile(path.join(out,'_headers'),'utf8'),/r2\.cloudflarestorage\.com/)
 const commit=sha((await readFile(path.join(dir,'stage-result.json'))).toString()+out).slice(0,40)
 await writeFile(path.join(dir,'pages-submission'+(mode==='--pages-update'?'-autosave-fix':'')+'.json'),JSON.stringify({commit,out,branch:'read-only'}),{flag:'wx'});await writeFile(path.join(dir,'wrangler.jsonc'),JSON.stringify({name:project,pages_build_output_dir:out}))
 try{await run(process.execPath,[s.wranglerCli,'pages','deploy',out,'--project-name',project,'--branch','read-only','--commit-hash',commit,'--commit-dirty=true','--force'],{cwd:dir,windowsHide:true,timeout:180000,maxBuffer:2*1024**2,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false'}})}catch{throw Error('ADMIN_UPLOAD_RESULT_UNKNOWN_NO_RETRY')}
 const after=await cloud('pages/projects/'+project),d=after.latest_deployment;assert.ok(!after.canonical_deployment&&d.environment==='preview'&&d.deployment_trigger.metadata.commit_hash===commit&&!d.uses_functions&&d.latest_stage.status==='success')
 const result={deploymentId:d.id,url:origin+'/admin',fixedUrl:d.url,functions:0,uploadCapabilitySource:'server-session'};await writeFile(path.join(dir,'pages-result.json'),JSON.stringify(result),{flag:mode==='--pages-update'?'w':'wx'});console.log(JSON.stringify(result))
}else{
 const acceptance=await json(path.join(dir,'acceptance.json'));assert.equal(acceptance.result,'FORMAL_MEDIA_ADMISSION_PASS')
 await flags({JNQ_FORMAL_UPLOADS_ENABLED:'true',JNQ_FORMAL_PRIVATE_MEDIA_READY:'true',JNQ_FORMAL_MEDIA_TEST_ENABLED:'false'})
 const result=await deploy(fn,'cloudflare/admin-preview/formal-media-edge.ts')
 await writeFile(path.join(dir,'activation-result.json'),JSON.stringify({...result,upload:true,publication:false}),{flag:'wx'});console.log(JSON.stringify({version:result.version,upload:true,publication:false}))
}
assert.equal(fingerprint(await cloud('pages/projects/jnqjourney-static-recovery-candidate')),fingerprint(production),'PUBLIC_SITE_CHANGED')
