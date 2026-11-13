// Read-only approval packet. No queue claim, approval creation, flags or deploy.
import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createClient} from '@supabase/supabase-js'
import {publicationStore,jobState} from '../../cloudflare/admin-preview/publication.mjs'
import {formalDigest} from '../../cloudflare/admin-preview/formal-publication.mjs'
import {getFormalKey} from './formal-read-source.mjs'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {readFormalFreeHeadroom} from './formal-publication-cost.mjs'
import {budgetBlockedUntil,publicationBudget} from './publication-budget.mjs'
const ref='vrufunuomioczocdsoer',origin='https://read-only.jnqjourney-admin-formal.pages.dev',base=`https://${ref}.supabase.co`
assert.deepEqual(process.argv.slice(2),['--read-only',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),pub=path.join(root,'production-publisher'),dir=path.join(pub,'first-release-control-20261113')
const json=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,'')),sha=v=>createHash('sha256').update(v).digest('hex')
const s=await json(path.join(pub,'settings.json'));assert.ok(s.projectRef===ref&&!s.enabled&&!s.productionReleaseApproved&&!s.approvedRelease&&s.formalWritesEnabled&&s.formalUploadsEnabled&&s.formalPublishingEnabled)
process.env.JNQ_SUPABASE_CLI=s.supabaseCli;process.env.JNQ_WRANGLER_CLI=s.wranglerCli
const roles=await json(path.join(pub,'verified-operator-allowlists.json')),run=promisify(execFile)
const secrets=JSON.parse((await run(process.execPath,[s.supabaseCli,'secrets','list','--project-ref',ref,'--output','json'],{windowsHide:true,timeout:30000})).stdout)
for(const [name,value]of Object.entries({JNQ_FORMAL_EXECUTION_ENABLED:'false',JNQ_FORMAL_WRITES_ENABLED:'true',JNQ_FORMAL_UPLOADS_ENABLED:'true',JNQ_FORMAL_PUBLICATION_ENABLED:'true'}))assert.equal(secrets.find(v=>v.name===name)?.value,sha(value),'CAPABILITY_FLAG_CHANGED')
const db=createClient(base,await getFormalKey(),{auth:{persistSession:false}}),q=publicationStore(db,s.formalQueueBucket,16*1024**2)
const [job,live]=await Promise.all([q.latest(),q.read('_publication/live.json')]);assert.ok(live?.source?.revision)
const token=await privateWranglerToken(),r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)}),p=(await r.json()).result
assert.ok(r.ok&&p.production_branch===s.expectedProductionBranch&&!p.canonical_deployment.uses_functions)
assert.equal(p.canonical_deployment.id,'333e51aa-506e-4a66-a7c6-4f28e3e890a1');assert.equal(live.deploymentId,p.canonical_deployment.id)
const backup=await json(path.join(root,'static-backup-result.json')),http=await fetch('https://www.jnqjourney.com/_publication.json',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)})
assert.ok(http.ok&&sha(Buffer.from(await http.arrayBuffer()))===backup.receiptSha256)
const usage=await readFormalFreeHeadroom(token,ACCOUNT),ledger=await json('artifacts/cloudflare-static-recovery/publication-attempts.json'),blockedUntil=budgetBlockedUntil(ledger)
const revoked='f9dce8bd73884fd12f1dedaff14302fd1415fc8358da672937b8b5d8eeeb8f98.png',receipt=await q.read('_media/'+revoked+'.json');assert.equal(receipt.revoked,true)
const test=await json(path.join(pub,'media-resume-20261113/fixtures.json'))
const exclusion=feeds=>!feeds['database.json'].locations.some(row=>row.id===853)&&!test.targets.filter(t=>t.kind!=='spot').some(t=>feeds[t.kind==='note'?'notes.json':'guides.json'][t.kind==='note'?'notes':'guides'].some(row=>row.slug===t.target))&&!JSON.stringify(feeds).includes(revoked.split('.')[0])
assert.ok(exclusion(live.source.feeds),'CURRENT_BASELINE_FIXTURE_LEAK')
const result={at:new Date().toISOString(),state:job?'TASK_REVIEW_PENDING':'WAITING_FOR_ADMIN_REQUEST',productionExecution:'HOLD',currentProductionDeploymentId:p.canonical_deployment.id,productionBranch:p.production_branch,publicFunctions:0,
 privateFixtureBaselineExclusion:'PASS',revokedTestReceipt:true,usage,buildBudget:{daily:publicationBudget.daily,monthly:publicationBudget.monthly,spacingMinutes:10,blockedUntil},
 jobId:null,contentFingerprint:null,queueClaimed:false,taskCreatedByTool:false,approvalCreated:false,productionSubmitted:false}
const approvalObjects = await db.storage.from(s.formalQueueBucket).list('_publication/execution-approvals', { limit: 1 })
assert.ok(!approvalObjects.error && approvalObjects.data?.length === 0, 'UNEXPECTED_EXECUTION_APPROVAL')
const publicKey = await json('artifacts/cloudflare-static-recovery/.public-read-key.json')
assert.equal(publicKey.projectRef, ref)
const key = publicKey.apiKey
const runnerKey = (await readFile(path.join(pub, '.runner-key'), 'utf8')).trim()
assert.match(runnerKey, /^[a-f0-9]{64}$/)
const runner = await fetch(base + '/functions/v1/jnq-admin-formal/publication/runner/verify/' + '0'.repeat(64), {
  headers: { Authorization: 'Bearer ' + key, 'X-JnQ-Runner-Key': runnerKey, 'X-JnQ-Release-Attempt': '1' },
  redirect: 'error', signal: AbortSignal.timeout(20000),
})
assert.ok(runner.status === 423 && (await runner.json()).error === 'FORMAL_PRODUCTION_RELEASE_HELD', 'RUNNER_HOLD_NOT_CONFIRMED')
Object.assign(result, { runnerHoldStatus: runner.status, executionApprovals: 0 })
let client,access
try{
 if(job){
  assert.ok(roles.publisherAuthIds.includes(job.requestedBy),'PUBLISHER_NOT_CONFIRMED');assert.equal(await formalDigest(job.payload),job.id)
  assert.ok(exclusion(job.payload.feeds),'REQUEST_FIXTURE_LEAK')
  const state=await jobState(q,job);assert.equal(state.state,'queued','TASK_NOT_WAITING_FOR_FIRST_APPROVAL')
  client=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const u=await db.auth.admin.getUserById(job.requestedBy);assert.ok(!u.error&&u.data.user.email_confirmed_at)
  const link=await db.auth.admin.generateLink({type:'magiclink',email:u.data.user.email});assert.ok(!link.error)
  const login=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert.ok(!login.error&&login.data.user.id===job.requestedBy);access=login.data.session.access_token
  const response=await fetch(base+'/functions/v1/jnq-admin-formal/publication/review?job='+job.id,{headers:{Origin:origin,apikey:key,Authorization:'Bearer '+access},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000)})
  const review=await response.json();assert.ok(response.ok,'ACTUAL_AUTHORITY_OR_MEDIA_REVIEW_FAILED');assert.equal(review.execution,'HOLD');assert.equal(review.currentProductionDeploymentId,p.canonical_deployment.id)
  let mediaBytes=0
  for(const name of review.newMedia){const receipt=await q.read('_media/'+name+'.json');assert.ok(receipt?.revoked===false&&Number.isSafeInteger(receipt.size));mediaBytes+=receipt.size}
  Object.assign(result,{...review,jobState:state.state,attempt:state.attempt||1,newMediaCount:review.newMedia.length,newMediaBytes:mediaBytes,
   assetScope:{historicalMediaReuploadRequired:false,newMediaFiles:review.newMedia.length,newMediaBytes:mediaBytes,finalBuildFileCount:'NOT_BUILT_PENDING_APPROVAL'},
   state:blockedUntil?'BUILD_BUDGET_HOLD':'AWAITING_EXACT_JOB_APPROVAL'})
  result.approvalTemplate={mode:'awaiting-user-approval',jobId:review.jobId,contentFingerprint:review.contentFingerprint,authorityFingerprint:review.authorityFingerprint,baselineRevision:review.baselineRevision,
   expectedProductionId:p.canonical_deployment.id,expectedProductionBranch:p.production_branch,attempt:state.attempt||1,approvedAt:null,expiresAt:null}
 }
}finally{if(access){const out=await client.auth.signOut({scope:'local'});assert.ok(!out.error,'REVIEW_SESSION_REVOCATION_UNCONFIRMED')}}
await mkdir(dir,{recursive:true});const file=path.join(dir,'review-'+Date.now()+'.private.json');await writeFile(file,JSON.stringify(result,null,2),{flag:'wx'});await writeFile(path.join(dir,'latest-result-path.json'),JSON.stringify({file}))
console.log(JSON.stringify(result))
