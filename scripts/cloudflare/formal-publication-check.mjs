// Authenticated read-only admission check. No POST to a publication endpoint.
import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { getFormalKey } from './formal-read-source.mjs'
import { publicationStore } from '../../cloudflare/admin-preview/publication.mjs'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer',origin='https://read-only.jnqjourney-admin-formal.pages.dev',base=`https://${ref}.supabase.co`
assert.deepEqual(process.argv.slice(2),['--read-only',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),pub=path.join(root,'production-publisher'),dir=path.join(pub,'publication-phase3-20261113')
const json=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''))
const s=await json(path.join(pub,'settings.json'));process.env.JNQ_SUPABASE_CLI=s.supabaseCli;process.env.JNQ_WRANGLER_CLI=s.wranglerCli
assert.ok(!s.enabled&&s.formalPublishingEnabled&&s.productionReleaseApproved===false)
const roles=await json(path.join(pub,'verified-operator-allowlists.json')),key=(await json('artifacts/cloudflare-static-recovery/.public-read-key.json')).apiKey
const db=createClient(base,await getFormalKey(),{auth:{persistSession:false,autoRefreshToken:false}}),user=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}}),q=publicationStore(db,s.formalQueueBucket,16*1024**2)
assert.equal(await q.latest(),null)
const checks=[],check=(ok,name)=>{assert.ok(ok,name);checks.push(name)},result={checks,result:'PENDING',postPublicationRequests:0,queueClaims:0,builds:0,publicDeployments:0}
let access
try {
 const u=await db.auth.admin.getUserById(roles.publisherAuthIds[0]);assert.ok(!u.error&&u.data.user.email_confirmed_at)
 const l=await db.auth.admin.generateLink({type:'magiclink',email:u.data.user.email});assert.ok(!l.error)
 const login=await user.auth.verifyOtp({type:'magiclink',token_hash:l.data.properties.hashed_token});assert.ok(!login.error&&login.data.user.id===roles.publisherAuthIds[0]);access=login.data.session.access_token
 async function call(route,token=access){const r=await fetch(base+'/functions/v1/jnq-admin-formal/'+route,{headers:{Origin:origin,apikey:key,Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000)});return {status:r.status,data:await r.json()}}
 let r=await call('session');check(r.status===200&&r.data.writesEnabled&&r.data.uploadsEnabled&&r.data.publishingEnabled,'text_upload_and_explicit_queue_capabilities_enabled')
 r=await call('publication');check(r.status===200&&r.data.state==='held'&&r.data.releaseHeld&&!r.data.job&&!r.data.online,'queue_status_hard_hold_no_job_no_runner')
 check(r.data.live.deploymentId==='333e51aa-506e-4a66-a7c6-4f28e3e890a1','current_production_receipt_unchanged')
 const status=r.data
 r=await call('publication/catalog');check(r.status===200&&Array.isArray(r.data.items),'real_publication_catalog_authorized')
 const catalog=r.data;check(catalog.items.filter(row=>row.kind==='spot'&&row.action==='publish'&&row.eligible).length===582,'full_582_public_spot_catalog_retained')
 check(catalog.items.filter(row=>row.kind==='note'&&row.action==='publish'&&row.eligible).length===6&&catalog.items.filter(row=>row.kind==='guide'&&row.action==='publish'&&row.eligible).length===7,'original_6_notes_7_guides_retained')
 check(catalog.items.find(row=>row.kind==='spot'&&row.key==='853')?.eligible===false,'hidden_853_not_publishable')
 check(catalog.items.filter(row=>row.status==='草稿').length>=3,'test_drafts_not_publishable')
 r=await call('publication',key);check(r.status===401,'anonymous_queue_read_denied')
 const runner=base+'/functions/v1/jnq-admin-formal/publication/runner/verify/'+'0'.repeat(64)
 for(const [proof,expected,name] of [[randomBytes(32).toString('hex'),403,'invalid_runner_key_denied'],[(await readFile(path.join(pub,'.runner-key'),'utf8')).trim(),423,'real_runner_key_still_production_held']]){
  const r=await fetch(runner,{headers:{Authorization:'Bearer '+key,'X-JnQ-Runner-Key':proof},redirect:'error'});check(r.status===expected,name);await r.body?.cancel()
 }
 check((await q.latest())===null,'read_checks_created_no_jobs')
 const token=await privateWranglerToken(),r2=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`,{headers:{Authorization:'Bearer '+token},redirect:'error'}),p=(await r2.json()).result
 check(r2.ok&&p.canonical_deployment.id===status.live.deploymentId&&!p.canonical_deployment.uses_functions,'actual_production_still_original_zero_functions')
 result.result='FORMAL_PUBLICATION_PREPARATION_PASS';result.pendingChanges=catalog.counts;result.items=catalog.items.length
 // Private catalog may contain titles. Only aggregate results leave this file.
 await writeFile(path.join(dir,'catalog.private.json'),JSON.stringify(catalog,null,2),{flag:'wx'})
} catch(error){result.result='FORMAL_PUBLICATION_PREPARATION_FAIL';result.failed=error.code||error.message;process.exitCode=1}
finally{if(access){const out=await user.auth.signOut({scope:'local'});result.testSessionRevoked=!out.error}await writeFile(path.join(dir,'check.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result))}
