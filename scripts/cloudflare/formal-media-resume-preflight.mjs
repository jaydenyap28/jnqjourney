import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer',bucket='jnqjourney-admin-private-media'
assert.deepEqual(process.argv.slice(2),['--check',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),dir=path.join(root,'production-publisher/media-resume-20261113')
const s=JSON.parse((await readFile(path.join(root,'production-publisher/settings.json'),'utf8')).replace(/^\uFEFF/,''))
assert.equal(s.projectRef,ref);assert.equal(s.formalWritesEnabled,true);assert.equal(s.formalUploadsEnabled,false);assert.equal(s.formalPublishingEnabled,false);assert.equal(s.enabled,false)
process.env.JNQ_WRANGLER_CLI=s.wranglerCli
const token=await privateWranglerToken(),headers={Authorization:'Bearer '+token}
async function cf(suffix){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${bucket}${suffix}`,{headers,redirect:'error',signal:AbortSignal.timeout(20000)}),p=await r.json();assert.ok(r.ok&&p.success,'R2_CONFIGURATION_UNCONFIRMED');return p.result}
const [b,managed,custom]=await Promise.all([cf(''),cf('/domains/managed'),cf('/domains/custom')])
assert.equal(b.name,bucket);assert.ok(!b.storage_class||b.storage_class==='Standard');assert.equal(managed.enabled,false);assert.equal(custom.domains.length,0)
const run=promisify(execFile),secrets=JSON.parse((await run(process.execPath,[s.supabaseCli,'secrets','list','--project-ref',ref,'--output','json'],{windowsHide:true,timeout:30000,maxBuffer:1024*1024})).stdout)
for(const name of ['FORMAL_R2_ACCESS_KEY_ID','FORMAL_R2_SECRET_ACCESS_KEY'])assert.ok(secrets.some(v=>v.name===name),'FORMAL_EDGE_SECRET_NAME_MISSING')
const end=new Date().toISOString(),month=end.slice(0,7)+'-01T00:00:00Z'
const query=`query($a:string!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$a}){storage:r2StorageAdaptiveGroups(limit:50,filter:{datetime_geq:$start,datetime_leq:$end}){max{payloadSize metadataSize objectCount}dimensions{bucketName}}operations:r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests}dimensions{actionType actionStatus}}}}}`
const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{a:ACCOUNT,start:month,end}}),redirect:'error'}),a=await r.json()
assert.ok(r.ok&&!a.errors&&a.data.viewer.accounts.length===1,'USAGE_UNCONFIRMED')
const usage=a.data.viewer.accounts[0],peak=usage.storage.reduce((n,v)=>n+v.max.payloadSize+v.max.metadataSize,0),ops=usage.operations.reduce((n,v)=>n+v.sum.requests,0)
assert.ok(peak+1024*1024<10_000_000_000&&ops+1000<1_000_000,'BOUNDED_PILOT_FREE_HEADROOM_UNCONFIRMED')
const report={projectRef:ref,account:ACCOUNT,bucket,standardStorage:true,managedPublic:false,customDomains:0,secretNamesPresent:true,secretValuesRead:false,userAttestedBucketOnlyObjectReadWrite:true,measuredMonthPeakUpperBoundBytes:peak,observedMonthOperations:ops,window:{month,end},invoiceBalance:'UNKNOWN',uploadCapability:false,publication:false}
await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'preflight.json'),JSON.stringify(report,null,2),{flag:'wx'})
console.log(JSON.stringify(report))
