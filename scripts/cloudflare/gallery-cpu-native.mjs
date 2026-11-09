// New isolated run. Never overwrite the original 29ms report or resume failures.
import {readFile,writeFile,rename} from 'node:fs/promises'
const root='artifacts/cloudflare-gallery-cpu/'
const deployment=JSON.parse(await readFile(root+'deployment.json'))
const fixture=JSON.parse(await readFile(root+'fixtures.json'))
const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
if(!deployment.success||deployment.environment!=='preview'||!fixture.complete||fixture.projectRef!=='rnamstwwbzknwbjwdgrf')throw Error('ISOLATED_DEPLOYMENT_REQUIRED')
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const report={startedAt:new Date().toISOString(),deploymentId:deployment.deploymentId,workerSha256:deployment.workerSha256,url:origin,budget:40,priorCompatibilityRequests:2,checks:[],assertions:[],hold:true}
const file=root+'native-acceptance.json';await writeFile(file,JSON.stringify(report,null,2),{flag:'wx'})
async function persist(){await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file)}
let cookies=''
const ensure=(condition,code)=>{if(!condition)throw Error(code)}
async function call(name,path,{method='GET',body,auth=true,expected=200,r2Expected}={}){
  ensure(report.checks.length<40,'REQUEST_BUDGET_EXHAUSTED')
  const acceptanceId=`${Date.now()}-${report.checks.length}`,headers={'X-JnQ-Acceptance':acceptanceId}
  if(auth&&cookies)headers.Cookie=cookies
  if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json'}
  const check={name,path,method,expected,acceptanceId,...(r2Expected?{r2Expected}:{}),issuedAt:new Date().toISOString()}
  report.checks.push(check);await persist()
  const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(30000)})
  check.status=response.status;const bytes=Buffer.from(await response.arrayBuffer())
  let trace;const deadline=Date.now()+25000
  while(Date.now()<deadline){
    let tail;try{tail=JSON.parse(await readFile(root+'runtime-events.json'))}catch{}
    ensure(!tail?.diagnostics?.parseErrors&&!tail?.diagnostics?.truncatedEvents,'TAIL_EVENT_INTEGRITY_FAILED')
    if(tail?.deploymentId===deployment.deploymentId)trace=tail.events.find(e=>e.acceptanceId===acceptanceId)
    if(trace||tail?.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  ensure(typeof trace?.cpuTime==='number'&&Number.isFinite(trace.cpuTime),'NATIVE_CPU_NOT_OBSERVED')
  Object.assign(check,{cpuTimeMs:trace.cpuTime,runtimeWallTimeMs:trace.wallTime,outcome:trace.outcome});await persist()
  const safePath=path.replace(/^(\/media\/candidate\/\d+\/)[a-f0-9-]+(\.[a-z]+)$/,'$1REDACTED$2')
  ensure((trace.path===path||trace.path===safePath)&&trace.method===method&&trace.status===response.status,'NATIVE_TRACE_MISMATCH')
  ensure(trace.cpuTime<=10&&trace.outcome!=='exceededResources','NATIVE_CPU_LIMIT_EXCEEDED')
  ensure(response.status===expected,'UNEXPECTED_HTTP_STATUS')
  return {response,json:()=>JSON.parse(bytes.toString()),text:()=>bytes.toString()}
}
const rows=new Map(),byRole=role=>fixture.fixtures.find(f=>f.role===role)
const route=f=>`/api/candidate/spots/${f.id}`
async function save(name,f,data,version=rows.get(f.id)?.updated_at??null,expected=200){
  const n=new Set([data.image_url,...(data.images||[])].filter(Boolean)).size
  const r=await call(name,route(f),{method:'PATCH',body:{expectedUpdatedAt:version,data},expected,...(n?{r2Expected:{receiptGet:n,objectHead:n===1?1:0,objectList:n>1?1:0,measurement:'Code-path count, not native operation telemetry'}}:{})})
  if(expected===200)rows.set(f.id,r.json().spot)
}
try{
  const login=await call('login','/api/candidate/session',{method:'POST',body:{email:credentials.email,password:credentials.password}})
  cookies=login.response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')
  const small=byRole('small'),gallery=byRole('gallery'),smallImages=small.media.map(m=>m.path),images=gallery.media.map(m=>m.path)
  await save('save_1_first',small,{image_url:smallImages[0],images:smallImages.slice(0,1)})
  await call('unreferenced_verified_denied',smallImages[4],{auth:false,expected:401})
  await save('save_5_first',small,{image_url:smallImages[0],images:smallImages})
  await save('save_5_unchanged',small,{image_url:smallImages[0],images:smallImages})
  const full={name:'Synthetic full contract',name_cn:'合成完整字段',category:'attraction',latitude:1.3,longitude:103.8,region_id:null,description:'36 field acceptance',review:null,review_jayden:'Jayden synthetic review',review_qing:'Qing synthetic review',address:null,google_maps_url:'https://maps.google.com/?q=1.3,103.8',opening_hours:'09:00–17:00',price_info:{adult:12,currency:'MYR',free:false},tags:['synthetic'],visit_date:'2026-11-09',is_visited:true,image_url:images[0],images:images.slice(0,17),image_metadata:Object.fromEntries(images.slice(0,17).map(p=>[p,{alt_zh:'合成照片',alt_en:'Synthetic image',caption:'合成说明'}])),video_url:null,facebook_video_url:null,related_note_slugs:[],status:'active',publication_status:'published',seo_title_zh:'合成 SEO',seo_description_zh:'合成描述',seo_title_en:'Synthetic SEO',seo_description_en:'Synthetic description',experience_zh:'合成内容',experience_en:'Synthetic content',redirect_url:null,redirect_type:301}
  await save('save_17_first_full_fields',gallery,full)
  const read17=(await call('read_17_public',`/api/candidate/public/spots/${gallery.id}`,{auth:false})).json().spot
  for(const [key,value]of Object.entries(full).filter(([k])=>!['redirect_url','redirect_type'].includes(k)))ensure(JSON.stringify(read17[key])===JSON.stringify(value),'FIELD_TYPE_OR_VALUE_CHANGED')
  report.assertions.push('17 newly referenced images, complete mutable fields and public readback passed')
  await save('save_17_unchanged',gallery,full)
  const longMetadata=Object.fromEntries(images.map(p=>[p,{alt_zh:'合'.repeat(500),alt_en:'description'.repeat(100),caption:'caption'.repeat(100)}]))
  await save('save_30_long_metadata',gallery,{images,image_url:images[0],image_metadata:longMetadata})
  const read30=(await call('read_30_public',`/api/candidate/public/spots/${gallery.id}`,{auth:false})).json().spot
  ensure(read30.images.length===30&&JSON.stringify(read30.image_metadata)===JSON.stringify(longMetadata),'GALLERY_30_READBACK_CHANGED')
  await save('save_30_unchanged',gallery,{images,image_url:images[0],image_metadata:longMetadata})
  await save('stale_version_refused',gallery,{name:'Must not win'},'2020-01-01T00:00:00Z',409)
  await save('hide',gallery,{publication_status:'hidden'})
  await call('hidden_image_denied',images[0],{auth:false,expected:401})
  await call('hidden_page_denied',`/spot/${gallery.slug}`,{auth:false,expected:404})
  await save('republish',gallery,{publication_status:'published'})
  await call('logout','/api/candidate/session',{method:'DELETE'})
  await call('unauthorized_editor_denied',route(gallery),{auth:false,expected:401})
  report.galleryCpuAcceptancePassed=true;report.hold=false;report.verdict='GALLERY_PATH_GO_FULL_COMPATIBILITY_STILL_PENDING'
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'GALLERY_NATIVE_FAILED';report.hold=true;report.verdict='NO_GO_HOLD';process.exitCode=1}
report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify(report,null,2))
