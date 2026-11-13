// Deliberately has no watch/claim/deploy-public path. All changes are private
// queue metadata, runner credentials, an inactive local config and the Admin API.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, unlink, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { getFormalKey } from './formal-read-source.mjs'
import { publicationStore } from '../../cloudflare/admin-preview/publication.mjs'
const ref='vrufunuomioczocdsoer',fn='jnq-admin-formal'
assert.deepEqual(process.argv.slice(2),['--queue-only-held',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),pub=path.join(root,'production-publisher'),dir=path.join(pub,'publication-phase3-20261113')
const json=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,'')),sha=v=>createHash('sha256').update(v).digest('hex')
const pre=await json(path.join(dir,'preflight.json')),s=await json(path.join(pub,'settings.json'))
assert.ok(!s.enabled&&!s.formalPublishingEnabled&&s.formalWritesEnabled&&s.formalUploadsEnabled)
assert.ok(Date.now()-Date.parse(pre.at)<60*60*1000&&pre.productionId==='333e51aa-506e-4a66-a7c6-4f28e3e890a1')
process.env.JNQ_SUPABASE_CLI=s.supabaseCli
const run=promisify(execFile)
async function cli(args){try{return await run(process.execPath,[s.supabaseCli,...args,'--project-ref',ref],{windowsHide:true,timeout:180000,maxBuffer:2*1024**2})}catch{throw Error('FORMAL_QUEUE_PREPARE_RESULT_UNKNOWN_STOP')}}
const old=(JSON.parse((await cli(['functions','list','--output','json'])).stdout)).find(v=>v.slug===fn)
assert.ok(old.version===18&&old.verify_jwt&&old.ezbr_sha256==='15c9c23870343330560988bd2a02f7bbec06823a84f92a3575f34fa5234e4d18','FORMAL_EDGE_BASELINE_CHANGED')
const db=createClient(`https://${ref}.supabase.co`,await getFormalKey(),{auth:{persistSession:false}}),queue=publicationStore(db,'jnq-admin-formal-publication',16*1024**2)
assert.equal(await queue.latest(),null)
const live=await queue.read('_publication/live.json');assert.equal(live.source.revision,pre.baselineRevision)
// Bind the existing manifest to the actual restored and live Production receipt.
const backup=await json(path.join(root,'static-backup-result.json')),bytes=await readFile(path.join(root,'restore-static/production-deploy/_publication.json'))
assert.equal(sha(bytes),backup.receiptSha256)
const r=await fetch('https://www.jnqjourney.com/_publication.json',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)})
assert.ok(r.ok&&sha(Buffer.from(await r.arrayBuffer()))===backup.receiptSha256)
const bundle=await json(path.join(root,'runs/full-review-20261112-b/package-result.json'))
assert.equal(bundle.pages.length,1349)
const media=await readdir(path.join(root,'restore-static/production-deploy/media/static'));assert.equal(media.length,4515)
assert.ok(media.every(name=>/^[a-f0-9]{64}\.(png|jpg|webp|gif|jpeg|avif)$/i.test(name)))
const inventory={revision:pre.baselineRevision,deploymentId:pre.productionId,receiptSha256:backup.receiptSha256,
  routes:bundle.pages.map(row=>row.route),mediaPaths:media.map(name=>'/media/static/'+name)}
const saved=await queue.createOnce('_publication/baseline-inventory/'+pre.baselineRevision+'.json',inventory)
assert.deepEqual(saved,inventory)
await copyFile(path.join(pub,'settings.json'),path.join(dir,'settings-before.json'))
await copyFile(path.join(pub,'.runner-key'),path.join(dir,'runner-key-before.private'))
const key=randomBytes(32).toString('hex'),keyFile=path.join(pub,'.runner-key')
await writeFile(keyFile,key,{mode:0o600})
const flags=path.join(dir,'queue-held.env')
const publicKey=await json('artifacts/cloudflare-static-recovery/.public-read-key.json');assert.equal(publicKey.projectRef,ref)
await writeFile(flags,'JNQ_FORMAL_PUBLICATION_ENABLED=true\nJNQ_FORMAL_EXECUTION_ENABLED=false\nFORMAL_RUNNER_KEY_SHA256='+sha(key)+'\nFORMAL_RUNNER_ANON_SHA256='+sha(publicKey.apiKey)+'\n',{flag:'wx',mode:0o600})
try{await cli(['secrets','set','--env-file',flags])}finally{await unlink(flags)}
const work=path.join(dir,'edge-'+Date.now()),folder=path.join(work,'supabase/functions',fn);await mkdir(folder,{recursive:true})
const {build}=await import(pathToFileURL(path.resolve(path.dirname(s.wranglerCli),'../../esbuild/lib/main.js')).href)
await build({entryPoints:['cloudflare/admin-preview/formal-publication-edge.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['npm:*'],outfile:path.join(folder,'index.ts')})
await writeFile(path.join(work,'supabase/config.toml'),`project_id="jnq-formal-phase3-held"\n[functions.${fn}]\nverify_jwt=true\nentrypoint="./functions/${fn}/index.ts"\n`)
await writeFile(path.join(dir,'edge-submission.json'),JSON.stringify({previous:old.version,sourceSha256:sha(await readFile(path.join(folder,'index.ts'))),work}),{flag:'wx'})
await cli(['functions','deploy',fn,'--workdir',work,'--use-api','--yes'])
const deployed=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===fn)
assert.ok(deployed.verify_jwt&&deployed.status==='ACTIVE'&&deployed.version>old.version)
Object.assign(s,{formalPublishingEnabled:true,productionReleaseApproved:false,supportedReleaseEnvironment:'production',expectedProductionBranch:pre.productionBranch,enabled:false})
await writeFile(path.join(pub,'settings.json'),JSON.stringify(s,null,2))
const result={at:new Date().toISOString(),version:deployed.version,verifyJwt:true,ezbrSha256:deployed.ezbr_sha256,sourceSha256:sha(await readFile(path.join(folder,'index.ts'))),
  queueAdmission:true,runnerExecution:false,productionReleaseApproved:false,localEnabled:false,baselineRoutes:inventory.routes.length,baselineMedia:inventory.mediaPaths.length,
  freshRunnerCredential:true,runnerSecretValuePrinted:false,queueJobsCreated:0,publicDeploymentSubmitted:false}
await writeFile(path.join(dir,'prepared.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result))
