// Bounded native compatibility acceptance. Existing size/Chrome proofs are not rerun.
import {readFile,writeFile,rename} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root='artifacts/cloudflare-compatibility-native/'
const deployment=JSON.parse(await readFile(root+'deployment.json'))
const fixture=JSON.parse(await readFile(root+'fixtures.json'))
const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
if(!deployment.success||deployment.environment!=='preview'||!fixture.complete||fixture.projectRef!=='rnamstwwbzknwbjwdgrf')throw Error('ISOLATED_DEPLOYMENT_REQUIRED')
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const report={startedAt:new Date().toISOString(),deploymentId:deployment.deploymentId,url:origin,budget:40,checks:[],assertions:[],hold:true}
const file=root+'native-acceptance.json'
await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
async function persist(){await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file)}
let cookies=''
function ensure(condition,code){if(!condition)throw Error(code)}
async function call(name,path,{method='GET',body,auth=true,expected=200,r2Expected}={}) {
  ensure(report.checks.length<40,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`,headers={'X-JnQ-Acceptance':acceptanceId}
  if(auth&&cookies)headers.Cookie=cookies
  if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json'}
  const check={name,path,method,expected,acceptanceId,...(r2Expected?{r2Expected}:{}),issuedAt:new Date().toISOString()}
  report.checks.push(check);await persist()
  const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(30000)})
  check.status=response.status
  const bytes=Buffer.from(await response.arrayBuffer())
  let trace
  const deadline=Date.now()+25000
  while(Date.now()<deadline){
    let tail
    try{tail=JSON.parse(await readFile(root+'runtime-events.json'))}catch{}
    ensure(!tail?.diagnostics?.parseErrors&&!tail?.diagnostics?.truncatedEvents,'TAIL_EVENT_INTEGRITY_FAILED')
    if(tail?.deploymentId===deployment.deploymentId)trace=tail.events.find(e=>e.acceptanceId===acceptanceId)
    if(trace)break
    if(tail?.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  ensure(typeof trace?.cpuTime==='number'&&Number.isFinite(trace.cpuTime),'NATIVE_CPU_NOT_OBSERVED')
  Object.assign(check,{cpuTimeMs:trace.cpuTime,runtimeWallTimeMs:trace.wallTime,outcome:trace.outcome})
  await persist()
  ensure(trace.method===method&&trace.status===response.status,'NATIVE_TRACE_MISMATCH')
  ensure(trace.cpuTime<=10&&trace.outcome!=='exceededResources','NATIVE_CPU_LIMIT_EXCEEDED')
  ensure((Array.isArray(expected)?expected:[expected]).includes(response.status),'UNEXPECTED_HTTP_STATUS')
  return {response,bytes,json:()=>JSON.parse(bytes.toString()),text:()=>bytes.toString()}
}
const byRole=role=>fixture.fixtures.find(f=>f.role===role)
const route=id=>`/api/candidate/spots/${id}`
const publicRoute=f=>`/spot/${f.slug}`
let galleryRow
async function patch(name,data,expected=200){
  const result=await call(name,route(byRole('gallery').id),{method:'PATCH',body:{expectedUpdatedAt:galleryRow?.updated_at??null,data},expected,r2Expected:data.images?{receiptGet:new Set([data.image_url,...data.images].filter(Boolean)).size,objectHead:new Set([data.image_url,...data.images].filter(Boolean)).size}:undefined})
  if(expected===200)galleryRow=result.json().spot
  return result
}
try{
  const login=await call('compat_login','/api/candidate/session',{method:'POST',body:{email:credentials.email,password:credentials.password}})
  cookies=login.response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')
  const first17=fixture.media.slice(0,17).map(m=>m.path),all30=fixture.media.map(m=>m.path)
  const full={name:'Synthetic full contract',name_cn:'合成完整字段',category:'attraction',latitude:1.3,longitude:103.8,region_id:null,description:'36 field acceptance',review:null,review_jayden:'Jayden synthetic review',review_qing:'Qing synthetic review',address:null,google_maps_url:'https://maps.google.com/?q=1.3,103.8',opening_hours:'09:00–17:00',price_info:{adult:12,currency:'MYR',free:false},tags:['synthetic'],visit_date:'2026-11-09',is_visited:true,image_url:first17[0],images:first17,image_metadata:Object.fromEntries(first17.map(p=>[p,{alt_zh:'合成照片',alt_en:'Synthetic image',caption:'合成说明'}])),video_url:null,facebook_video_url:null,related_note_slugs:[],status:'active',publication_status:'published',seo_title_zh:'合成 SEO',seo_description_zh:'合成描述',seo_title_en:'Synthetic SEO',seo_description_en:'Synthetic description',experience_zh:'合成内容',experience_en:'Synthetic content',redirect_url:null,redirect_type:301}
  await patch('save_17_gallery_full_fields_null_version',full)
  ensure(galleryRow.images.length===17&&typeof galleryRow.updated_at==='string','SAVE_17_CONTRACT_FAILED')
  const read17=(await call('read_17_gallery',`/api/candidate/public/spots/${galleryRow.id}`,{auth:false})).json().spot
  for(const [key,value]of Object.entries(full).filter(([key])=>!['redirect_url','redirect_type'].includes(key)))ensure(JSON.stringify(read17[key])===JSON.stringify(value),'PUBLIC_FIELD_TYPE_OR_VALUE_CHANGED')
  report.assertions.push('17 images and complete mutable fields preserve JSON types; null version accepted')
  await call('unreferenced_verified_image_denied',all30[29],{auth:false,expected:401})
  await patch('save_30_gallery_long_metadata',{images:all30,image_url:all30[0],image_metadata:Object.fromEntries(all30.map(p=>[p,{alt_zh:'长'.repeat(1800),alt_en:'A'.repeat(1800),caption:'C'.repeat(1800)}]))})
  const page=(await call('read_30_gallery',publicRoute(byRole('gallery')),{auth:false})).text()
  ensure((page.match(/<figure>/g)||[]).length===30,'GALLERY_30_PUBLIC_COUNT_FAILED')
  report.assertions.push('30 images and long metadata saved; public HTML contains 30 figures')
  await patch('close_spot',{status:'temporarily_closed'})
  await call('closed_spot_denied',publicRoute(byRole('gallery')),{auth:false,expected:404})
  await call('closed_image_denied',all30[0],{auth:false,expected:401})
  await patch('restore_spot',{status:'active'})
  const image=await call('published_image_sha256',all30[0],{auth:false})
  ensure(createHash('sha256').update(image.bytes).digest('hex')===fixture.imageSha256,'IMAGE_READBACK_CHANGED')
  await call('english_route',`/en${publicRoute(byRole('gallery'))}`,{auth:false})
  const r=byRole('redirect')
  const redirectPatch=await call('redirect_301_save',route(r.id),{method:'PATCH',body:{expectedUpdatedAt:null,data:{redirect_url:publicRoute(byRole('gallery')),redirect_type:301}}})
  let redirectRow=redirectPatch.json().spot
  const redirect301=await call('redirect_301',publicRoute(r),{auth:false,expected:301});ensure(redirect301.response.headers.get('Location')===publicRoute(byRole('gallery')),'REDIRECT_DESTINATION_CHANGED')
  redirectRow=(await call('redirect_302_save',route(r.id),{method:'PATCH',body:{expectedUpdatedAt:redirectRow.updated_at,data:{redirect_type:302}}})).json().spot
  await call('redirect_302',publicRoute(r),{auth:false,expected:302})
  await call('hidden_redirect_refused',route(r.id),{method:'PATCH',body:{expectedUpdatedAt:redirectRow.updated_at,data:{redirect_url:publicRoute(byRole('hidden'))}},expected:400})
  await call('cycle_refused',publicRoute(byRole('cycle')),{auth:false,expected:503})
  await call('delete_fixture',route(byRole('delete').id),{method:'DELETE',body:{expectedUpdatedAt:null}})
  await call('deleted_fixture_denied',publicRoute(byRole('delete')),{auth:false,expected:404})
  report.compatibilityReadSavePassed=true
  // Additional concurrency/browser steps must share this same 40-request journal.
  report.nextStage='R2_CONCURRENCY_AND_NEW_EDITOR'
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'NATIVE_ACCEPTANCE_FAILED';report.hold=true;process.exitCode=1}
report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify(report,null,2))
