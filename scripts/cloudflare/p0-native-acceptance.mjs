import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {isolatedKeys,isolatedRequest,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
import {legacyPath} from '../../cloudflare/spot-loop/legacy-media-preview.mjs'
import {PUBLIC_SPOT_FIELDS} from '../../cloudflare/spot-loop/publication-gate.mjs'
const root='artifacts/cloudflare-p0-cutover/'
const load=async name=>JSON.parse(await readFile(root+name))
const deployment=await load('deployment.json')
assert.ok(deployment.success&&deployment.gate.environment==='preview'&&deployment.fault.environment==='preview')
const resume=process.argv.includes('--resume-after-missing-tail')
const firstFile=root+'native-acceptance.json'
const file=resume?root+'native-resumed.json':firstFile
const report={startedAt:new Date().toISOString(),p0ExposureCutover:'BLOCKED',publicationGate:'BLOCKED',cloudflareBudget:32,checks:[],acl:[],mutations:[],formalWrites:0}
if(resume){
  const prior=await load('native-acceptance.json')
  ensureCheckpoint(prior)
  report.priorCloudflareRequests=prior.checks.length
  report.originalUnobservedAcceptanceId=prior.checks.at(-1).acceptanceId
}
function ensureCheckpoint(prior){
  assert.ok(prior.error==='NATIVE_CPU_NOT_OBSERVED'&&prior.checks.length===12&&prior.checks.at(-1).label==='hidden_alias'&&prior.checks.at(-1).status===404&&prior.fixtureHidden&&prior.authSessionClosed&&!prior.revoked)
  assert.ok(prior.checks.slice(0,-1).every(check=>Number.isFinite(check.nativeCpuMs)&&check.nativeCpuMs<=6))
}
await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
const ensure=(condition,code)=>{if(!condition)throw Error(code)}
let keys,token,version,revoked=false
async function row(){
  const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.92005&select=id,updated_at,publication_status,status')
  const rows=await response.json()
  ensure(response.ok&&rows.length===1&&rows[0].id===92005,'ISOLATED_STATE_UNAVAILABLE')
  return rows[0]
}
async function rpc(name,args){
  const response=await isolatedRequest(keys,'/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})
  const value=await response.json()
  ensure(response.ok,'ISOLATED_RPC_'+response.status)
  return value
}
async function save(label,patch){
  const current=await row()
  const updated=await rpc('jnq_media_save',{p_spot:92005,p_expected_updated_at:current.updated_at,p_patch:patch,p_observed:[deployment.media.identity]})
  ensure(updated.id===92005&&updated.updated_at!==current.updated_at,'MUTATION_UNCONFIRMED')
  version=updated.updated_at
  report.mutations.push({label,status:updated.status,publication_status:updated.publication_status,version})
  await persist()
}
async function trace(entry){
  const deadline=Date.now()+20000
  while(Date.now()<deadline){
    const tail=await load('runtime-'+entry.target+'.json')
    ensure(tail.deploymentId===entry.deploymentId&&!tail.diagnostics.parseErrors&&!tail.diagnostics.truncatedEvents,'TAIL_INTEGRITY_FAILED')
    const event=tail.events.find(event=>event.acceptanceId===entry.acceptanceId)
    if(event){
      entry.nativeCpuMs=event.cpuTime;entry.nativeWallMs=event.wallTime;entry.operations=event.operations;entry.outcome=event.outcome
      await persist()
      const pathname=new URL(entry.path,'https://candidate.invalid').pathname
      const sanitized=pathname.replace(/^(\/media\/candidate\/92005\/)[a-f0-9-]+\.webp$/,'$1REDACTED.webp')
      ensure((event.path===pathname||event.path===sanitized)&&event.method==='GET'&&event.status===entry.status,'NATIVE_TRACE_MISMATCH')
      ensure(Number.isFinite(event.cpuTime)&&event.cpuTime<=10&&event.outcome==='ok','NATIVE_CPU_LIMIT_EXCEEDED')
      return
    }
    await new Promise(resolve=>setTimeout(resolve,80))
  }
  throw Error('NATIVE_CPU_NOT_OBSERVED')
}
async function get(label,path,expected,{target='gate',image=false}={}){
  ensure(report.checks.length+(report.priorCloudflareRequests??0)<32,'CLOUDFLARE_BUDGET_EXHAUSTED')
  const d=deployment[target]
  const entry={label,path,target,deploymentId:d.deploymentId,acceptanceId:Date.now()+'-'+report.checks.length}
  report.checks.push(entry);await persist()
  const start=performance.now()
  const response=await fetch(d.origin+path,{headers:{'X-JnQ-Acceptance':entry.acceptanceId},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)})
  const bytes=Buffer.from(await response.arrayBuffer())
  Object.assign(entry,{status:response.status,elapsedMs:Math.round(performance.now()-start),bytes:bytes.length,mime:response.headers.get('content-type'),cache:response.headers.get('cache-control')})
  await trace(entry)
  ensure(response.status===expected&&entry.cache?.includes('no-store'),'GATE_HTTP_OR_CACHE_FAILED')
  if(image){
    entry.sha256=createHash('sha256').update(bytes).digest('hex')
    ensure(entry.sha256===deployment.media.sha256&&entry.mime==='image/webp','GATE_IMAGE_BYTES_FAILED')
  }else ensure(!entry.mime?.startsWith('image/'),'UNEXPECTED_IMAGE_LEAK')
  const body=bytes.toString('utf8')
  if(!image)ensure(!body.includes('P0_PRIVATE_SENTINEL')&&!/review_jayden|review_qing|is_visited|created_at/.test(body),'PRIVATE_FIELD_LEAK')
  if(response.status===301)ensure(response.headers.get('location')==='/spot/cloudflare-loop-registry-92005','ALIAS_DESTINATION_FAILED')
  return entry.mime?.includes('json')?JSON.parse(body):body
}
async function assertClosed(jwt,label){
  for(const query of ['select=*','select=id,name','select=review_jayden','select=id&publication_status=eq.hidden']){
    const response=await fetch(ISOLATED_ORIGIN+'/rest/v1/locations?'+query,{headers:{apikey:keys.anon,Authorization:'Bearer '+jwt},redirect:'manual'})
    const body=await response.json()
    report.acl.push({role:label,path:'locations?'+query,status:response.status,code:body.code})
    ensure([401,403].includes(response.status)&&body.code==='42501','DIRECT_SELECT_NOT_CLOSED')
  }
  const response=await fetch(ISOLATED_ORIGIN+'/rest/v1/rpc/jnq_public_spots',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify({p_ids:[92005,92017]})})
  const body=await response.json()
  report.acl.push({role:label,path:'jnq_public_spots',status:response.status,code:body.code})
  ensure([401,403,404].includes(response.status)&&['42501','PGRST202'].includes(body.code),'DIRECT_RPC_NOT_CLOSED')
  await persist()
}
try{
  ensure(Date.now()<deployment.gate.expiresAt*1000,'PREVIEW_EXPIRED')
  keys=await isolatedKeys()
  const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
  ensure(credentials.projectRef===ISOLATED_REF,'AUTH_SCOPE_INVALID')
  const auth=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),redirect:'manual'})
  const session=await auth.json()
  ensure(auth.ok&&session.user?.id===credentials.userId&&session.access_token,'ISOLATED_AUTH_FAILED')
  token=session.access_token
  if(!resume){
    await assertClosed(keys.anon,'anon')
    await assertClosed(token,'authenticated')
  }
  const original=await row()
  ensure(original.publication_status==='hidden'&&original.status==='active','FIXTURE_CHANGED')
  const path='/'+deployment.media.key,canonical='/spot/cloudflare-loop-registry-92005',alias='/spot/spot-92005'
  if(resume){
    version=original.updated_at
    await get('replacement_hidden_alias_observation',alias,404)
  }else{
  await save('legacy_null_published',{name:'P0 Synthetic public Spot',name_cn:'隔离公开门控样本',description:'Live publication source version one',publication_status:null,status:'active',image_url:path,images:[path],image_metadata:{},review_jayden:'P0_PRIVATE_SENTINEL_JAYDEN',review_qing:'P0_PRIVATE_SENTINEL_QING',is_visited:true})
  const home=await get('legacy_null_home','/',200)
  ensure(home.includes('P0 Synthetic public Spot')&&!home.includes('92017'),'HOME_ELIGIBILITY_FAILED')
  await get('legacy_null_list','/spot',200)
  const list=await get('legacy_null_public_api','/api/locations',200)
  ensure(list.locations.length===1&&list.locations[0].id===92005&&Object.keys(list.locations[0]).length===PUBLIC_SPOT_FIELDS.length,'PUBLIC_PROJECTION_FAILED')
  const detail=await get('legacy_null_detail',canonical,200)
  ensure(detail.includes('Live publication source version one'),'DETAIL_CURRENT_CONTENT_FAILED')
  const api=await get('public_detail_api','/api/spots/cloudflare-loop-registry-92005',200)
  ensure(api.spot.id===92005&&Object.keys(api.spot).length===PUBLIC_SPOT_FIELDS.length,'DETAIL_PROJECTION_FAILED')
  await get('visible_old_alias',alias,301)
  await get('visible_historical_media',legacyPath,200,{image:true})
  await get('visible_canonical_media',path,200,{image:true})
  const hidden=await rpc('jnq_media_withdraw',{p_spot:92005,p_expected_updated_at:version})
  ensure(hidden.publication_status==='hidden','WITHDRAW_FAILED')
  ensure(!(await get('hidden_home','/',200)).includes('P0 Synthetic public Spot'),'HIDDEN_HOME_LEAK')
  ensure((await get('hidden_public_list','/api/locations',200)).locations.length===0,'HIDDEN_LIST_LEAK')
  await get('hidden_detail',canonical,404)
  await get('hidden_alias',alias,404)
  }
  await get('hidden_historical_media',legacyPath,404)
  await save('republish_and_edit',{publication_status:'published',description:'Live publication source version two'})
  ensure((await get('republished_detail_without_build',canonical,200)).includes('Live publication source version two'),'DYNAMIC_UPDATE_FAILED')
  await get('republished_historical_media',legacyPath,200,{image:true})
  ensure((await get('republished_list','/api/locations',200)).locations.length===1,'REPUBLISH_LIST_FAILED')
  await save('closed_null_not_public',{status:'temporarily_closed',publication_status:null})
  await get('closed_null_alias',alias,404)
  await get('closed_null_media',legacyPath,404)
  // Reset only eligibility before a controlled final revocation.
  await save('republish_for_revoke',{status:'active',publication_status:'published'})
  ensure(await rpc('jnq_media_revoke',{p_spot:92005,p_key:deployment.media.key})===true,'REVOKE_FAILED')
  revoked=true
  await get('revoked_media',legacyPath,404)
  await get('revocation_hides_page',canonical,404)
  for(const path of ['/',canonical,legacyPath,'/api/locations',alias])await get('source_failure_'+path,path,503,{target:'fault'})
  await get('field_injection_refused','/api/locations?select=review_jayden',404)
  await get('no_old_static_json_bypass','/_next/data/old/spot/cloudflare-loop-registry-92005.json',404)
  await get('no_static_html_bypass',canonical+'.html',404)
  report.functionalGatePassed=true
  report.publicationGate=report.originalUnobservedAcceptanceId||report.checks.some(check=>check.nativeCpuMs>=10)?'BLOCKED':'READY'
  report.lowMargin=report.checks.filter(check=>check.nativeCpuMs>=8).map(({label,nativeCpuMs})=>({label,nativeCpuMs}))
  report.publicFieldCount=PUBLIC_SPOT_FIELDS.length
  report.staticRebuildsForMutations=0
}catch(error){
  report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'P0_NATIVE_ACCEPTANCE_FAILED'
  process.exitCode=1
}finally{
  if(keys){
    try{
      const current=await row()
      if(current.publication_status!=='hidden')await rpc('jnq_media_withdraw',{p_spot:92005,p_expected_updated_at:current.updated_at})
      report.fixtureHidden=(await row()).publication_status==='hidden'
      report.revoked=revoked
    }catch{report.cleanupState='UNKNOWN'}
  }
  if(keys&&token)try{
    const response=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token},redirect:'manual'})
    await response.body?.cancel();report.authSessionClosed=response.ok
  }catch{report.authSessionClosed=false}
  report.finishedAt=new Date().toISOString();await persist()
  console.log(JSON.stringify({publicationGate:report.publicationGate,p0ExposureCutover:report.p0ExposureCutover,error:report.error,checks:report.checks.map(({label,status,nativeCpuMs,operations})=>({label,status,nativeCpuMs,operations})),acl:report.acl},null,2))
}
