import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {isolatedKeys,isolatedRequest,ISOLATED_ORIGIN,ISOLATED_REF} from './isolated-supabase.mjs'
const root='artifacts/cloudflare-p0-consumers/',origin='http://127.0.0.1:4401'
const deployment=JSON.parse(await readFile(root+'deployment-resumed.json'))
const report={startedAt:new Date().toISOString(),checks:[],gaps:[],success:false,siteRuntime:'Local Next with isolated Supabase and Cloudflare Preview data source; not a hosted Next frontend'}
const file=root+'http-checks.json';await writeFile(file,JSON.stringify(report),{flag:'wx'})
const keys=await isolatedKeys(),credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
assert.equal(credentials.projectRef,ISOLATED_REF)
let token
const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
async function current(){const response=await isolatedRequest(keys,'/rest/v1/locations?id=eq.92061&select=id,publication_status,updated_at');assert.ok(response.ok);return(await response.json())[0]}
async function http(label,path,expected=200,auth=false){
  const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(30000),headers:auth?{Authorization:'Bearer '+token}:{}})
  const bytes=Buffer.from(await response.arrayBuffer());const record={label,path,status:response.status,bytes:bytes.length,expected,passed:response.status===expected,cache:response.headers.get('cache-control')}
  report.checks.push(record);await persist();return{response,record,bytes}
}
try{
  const auth=await fetch(ISOLATED_ORIGIN+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:keys.anon,'Content-Type':'application/json'},body:JSON.stringify({email:credentials.email,password:credentials.password}),redirect:'manual'})
  const session=await auth.json();assert.ok(auth.ok&&session.user.id===credentials.userId);token=session.access_token
  const before=await current();assert.equal(before.publication_status,'hidden')
  const publish=await isolatedRequest(keys,'/rest/v1/locations?id=eq.92061&publication_status=eq.hidden&updated_at=eq.'+encodeURIComponent(before.updated_at),{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({publication_status:null,updated_at:new Date().toISOString()})})
  assert.ok(publish.ok&&(await publish.json()).length===1);report.fixtureControlOnly=true
  // New HEAD method only. Preserve previous twelve native requests unchanged.
  const acceptanceId=Date.now()+'-12'
  const head=await fetch(deployment.origin+deployment.mediaPath,{method:'HEAD',headers:{'X-JnQ-Acceptance':acceptanceId},redirect:'manual'})
  let event
  for(let i=0;i<300;i++){const tail=JSON.parse(await readFile(root+'runtime-events.json'));event=tail.events.find(item=>item.acceptanceId===acceptanceId);if(event)break;await new Promise(resolve=>setTimeout(resolve,100))}
  report.nativeHead={acceptanceId,status:head.status,cpuMs:event?.cpuTime,operations:event?.operations}
  await persist();assert.ok(event&&Number.isFinite(event.cpuTime)&&event.cpuTime<=10&&event.status===200&&head.status===200,'NATIVE_HEAD_NOT_ACCEPTED')
  await http('admin_anonymous_denied','/api/admin/locations',401)
  const full=await http('admin_full_fields','/api/admin/locations?page=0',200,true)
  const adminRows=JSON.parse(full.bytes).data
  assert.deepEqual(adminRows.map(row=>row.id),[92062,92061]);assert.ok(Object.hasOwn(adminRows[0],'review_jayden'))
  await http('metadata_anonymous_denied','/api/admin/image-size?url='+encodeURIComponent(deployment.mediaPath),401)
  const size=await http('metadata_controlled_image','/api/admin/image-size?url='+encodeURIComponent(deployment.mediaPath),200,true)
  assert.equal(JSON.parse(size.bytes).size,68)
  await http('metadata_ssrf_rejected','/api/admin/image-size?url=http://169.254.169.254/',400,true)
  for(const path of ['/api/locations','/api/regions','/api/spots/consumer-fixture-92061','/public-data/locations.json','/public-data/regions.json','/public-data/spots/index.json','/public-data/spots/consumer-fixture-92061.json','/public-data/guides.json','/public-data/notes.json','/public-data/i18n/en/records.json','/public-data/guide-trip-costs.json']){
    const result=await http('controlled_public_source',path)
    if(result.record.passed){assert.ok(!result.bytes.toString().includes('review_jayden'));assert.ok(!result.bytes.toString().includes('pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'));assert.match(result.record.cache,/no-store/)}
  }
  await http('historical_feed_alias','/public-data/spots/spot-92061.json',301)
  // Probe exact missing dependencies; no schema repair, empty substitute or
  // fallback is permitted to make these pages appear successful.
  const query=(await readFile('lib/server/travel-packages.ts','utf8')).match(/const PACKAGE_SELECT = '([^']+)'/)[1]
  const packages=await isolatedRequest(keys,'/rest/v1/travel_packages?select='+query+'&limit=1')
  if(!packages.ok){const error=await packages.json();report.gaps.push({source:'isolated travel_packages',status:packages.status,code:error.code,message:error.message})}
  const notes=await http('authoritative_admin_notes','/api/admin/notes',200,true)
  if(!notes.record.passed)report.gaps.push({source:'isolated Notes pointer',status:notes.record.status})
  const row=await current()
  const hidden=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:row.updated_at})})
  assert.ok(hidden.ok)
  const list=await http('hidden_projection','/public-data/locations.json')
  assert.deepEqual(JSON.parse(list.bytes).locations,[])
  await http('hidden_detail_feed','/public-data/spots/consumer-fixture-92061.json',404)
  await http('hidden_alias_feed','/public-data/spots/spot-92061.json',404)
  await http('hidden_api','/api/spots/consumer-fixture-92061',404)
  await http('hidden_image',deployment.mediaPath,404)
  report.success=report.checks.every(check=>check.passed)
}catch(error){report.error=/^[A-Z_0-9]+$/.test(error.message)?error.message:'TARGETED_HTTP_FAILED';report.errorCode=error.code}
finally{
  const row=await current();if(row.publication_status!=='hidden'){
    const response=await isolatedRequest(keys,'/rest/v1/rpc/jnq_media_withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_spot:92061,p_expected_updated_at:row.updated_at})});report.fixtureHidden=response.ok
  }else report.fixtureHidden=true
  if(token){const logout=await fetch(ISOLATED_ORIGIN+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:keys.anon,Authorization:'Bearer '+token}});report.localSessionClosed=logout.ok}
  report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify(report,null,2))
}
