// Read-only phase-2 admission check. Never creates a token, bucket or object.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer',bucket='jnqjourney-admin-private-media'
assert.deepEqual(process.argv.slice(2),['--read-only',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),dir=path.join(root,'production-publisher/media-activation-20261113')
const settings=JSON.parse((await readFile(path.join(root,'production-publisher/settings.json'),'utf8')).replace(/^\uFEFF/,''))
assert.equal(settings.projectRef,ref);assert.equal(settings.formalWritesEnabled,true)
for(const k of ['enabled','formalUploadsEnabled','formalPublishingEnabled'])assert.equal(settings[k],false)
process.env.JNQ_WRANGLER_CLI=settings.wranglerCli
const token=await privateWranglerToken(),headers={Authorization:'Bearer '+token}
async function read(suffix){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${suffix}`,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});const p=await r.json();return {status:r.status,success:p.success===true,result:p.result,errorCodes:p.errors?.map(e=>e.code)}}
const [account,buckets,permissions,subscriptions]=await Promise.all([read(''),read('/r2/buckets'),read('/tokens/permission_groups'),read('/subscriptions')])
assert.ok(account.success&&account.result.id===ACCOUNT,'ACCOUNT_IDENTITY_UNCONFIRMED')
const end=new Date().toISOString(),start=new Date(Date.now()-24*3600000).toISOString(),month=end.slice(0,7)+'-01T00:00:00Z'
const query=`query($a:string!,$start:Time!,$end:Time!,$month:Time!){viewer{accounts(filter:{accountTag:$a}){storage:r2StorageAdaptiveGroups(limit:100,filter:{datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]){max{payloadSize metadataSize objectCount} dimensions{bucketName datetime}} operations:r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$month,datetime_leq:$end}){sum{requests} dimensions{actionType actionStatus}}}}}`
const g=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{a:ACCOUNT,start,end,month}}),redirect:'error',signal:AbortSignal.timeout(20000)})
const data=await g.json()
const report={result:'PHASE2_READONLY_PREFLIGHT',accountConfirmed:true,accountId:ACCOUNT,bucket,
 bucketExists:buckets.success?(buckets.result.buckets||[]).some(v=>v.name===bucket):'UNKNOWN',
 bucketList:{status:buckets.status,success:buckets.success,count:buckets.result?.buckets?.length},
 tokenPermissionGroups:{status:permissions.status,success:permissions.success,errorCodes:permissions.errorCodes},
 subscriptions:{status:subscriptions.status,success:subscriptions.success,errorCodes:subscriptions.errorCodes,
   plans:subscriptions.success?subscriptions.result?.map(v=>({name:v.rate_plan?.public_name||v.rate_plan?.id,state:v.state})):undefined},
 analytics:{status:g.status,errors:data.errors?.map(e=>({message:String(e.message).split(token).join('[redacted]').slice(0,220)})),data:data.data,window:{start,end,month}},
 uploadsEnabled:false,bucketCreated:false,credentialCreated:false,secretsPrinted:false,mediaScanned:false}
await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'preflight.json'),JSON.stringify(report,null,2),{flag:'wx'})
const latest=new Map()
for(const row of report.analytics.data?.viewer?.accounts?.[0]?.storage||[])if(!latest.has(row.dimensions.bucketName))latest.set(row.dimensions.bucketName,row)
console.log(JSON.stringify({...report,analytics:{status:g.status,errors:report.analytics.errors,window:report.analytics.window,
 latestStorage:[...latest.values()],observedOperationRequests:(report.analytics.data?.viewer?.accounts?.[0]?.operations||[]).reduce((n,r)=>n+r.sum.requests,0)}},null,2))
