// Real Preview HTTP/R2/Supabase acceptance, restricted to the created fixture.
// Passwords, session cookies and full response payloads never enter reports.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const deployment=JSON.parse(await readFile('artifacts/cloudflare-phase3/deployment.json','utf8'))
const fixture=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
if(!deployment.success||deployment.environment!=='preview'||fixture.projectRef!=='rnamstwwbzknwbjwdgrf'||fixture.spotId!==1)throw new Error('VERIFIED_ISOLATED_PREVIEW_REQUIRED')
const origin=new URL(deployment.url).origin
if(!new URL(origin).hostname.endsWith('.jnqjourney-spot-loop-migration-candidate.pages.dev'))throw new Error('CANDIDATE_ORIGIN_REQUIRED')
let prior
try{prior=JSON.parse(await readFile('artifacts/cloudflare-phase3/native-acceptance.json','utf8'))}catch{}
if(prior?.error==='NATIVE_CPU_LIMIT_EXCEEDED'&&!process.argv.includes('--acknowledge-cpu-retest'))throw new Error('CPU_HOLD_REQUIRES_NEW_AUTHORIZATION')
const resume=process.argv.includes('--resume')
const report=resume?JSON.parse(await readFile('artifacts/cloudflare-phase3/native-acceptance.json','utf8')):{startedAt:new Date().toISOString(),url:origin,fixtureId:fixture.spotId,checks:[],browserAcceptance:false,sqlExecuted:false,productionAccessed:false,cpuMeasurement:'Actual native per-request CPU from Preview tail; HTTP wall time is reported separately.'}
if(resume){if(report.url!==origin||report.fixtureId!==fixture.spotId)throw new Error('RESUME_TARGET_MISMATCH');report.resumedAt=new Date().toISOString();delete report.error;delete report.hold}
let cookies='',row
async function request(name,route,{method='GET',body,type='application/json',authenticated=false,expected=200}={}) {
  const acceptanceId=`${Date.now()}-${report.checks.length}`
  const headers={'X-JnQ-Acceptance':acceptanceId}
  if(authenticated&&cookies)headers.Cookie=cookies
  if(!['GET','HEAD'].includes(method)){headers.Origin=origin;headers['Content-Type']=type}
  const start=performance.now()
  const response=await fetch(`${origin}${route}`,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(60000)})
  const text=type==='image/png'&&method==='GET'?null:await response.clone().text()
  const record={name,method,path:route,status:response.status,wallTimeMs:Math.round(performance.now()-start),expected,passed:Array.isArray(expected)?expected.includes(response.status):response.status===expected,...(type==='image/png'&&body?{requestBodyBytes:body.byteLength}:{})}
  report.checks.push(record)
  if(!record.passed&&text) {
    try {const value=JSON.parse(text);if(typeof value.error==='string'&&value.error.length<200)record.serverError=value.error}catch{}
  }
  if(response.status>=500&&text&&/1102|exceeded.*CPU|CPU.*limit/i.test(text)){record.resourceLimitDetected=true;throw new Error('NATIVE_CPU_OR_RESOURCE_LIMIT')}
  if(!record.passed)throw new Error(`HTTP_CHECK_FAILED_${name.toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`)
  // Gate the next test request on this request's actual native trace CPU.
  // This is not wall-time estimation; stop before further mutations on overage.
  let trace
  for(let attempt=0;attempt<100;attempt++) {
    try {const tail=JSON.parse(await readFile('artifacts/cloudflare-phase3/runtime-events.json','utf8'));if(tail.deploymentId===deployment.deploymentId)trace=tail.events.find(event=>event.acceptanceId===acceptanceId)}catch{}
    if(trace)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(!trace||typeof trace.cpuTime!=='number') {
    record.cpuObservation='Not delivered by native tail; no CPU value inferred.'
    if(!['GET','HEAD'].includes(method))throw new Error('NATIVE_CPU_MEASUREMENT_UNAVAILABLE')
  } else {
    record.cpuTimeMs=trace.cpuTime;record.runtimeWallTimeMs=trace.wallTime
    if(trace.cpuTime>10||trace.outcome==='exceededResources'){record.resourceLimitDetected=true;throw new Error('NATIVE_CPU_LIMIT_EXCEEDED')}
  }
  return response
}
async function save(name,data,version=row.updated_at) {
  const response=await request(name,`/api/candidate/spots/${fixture.spotId}`,{method:'PATCH',authenticated:true,body:JSON.stringify({expectedUpdatedAt:version,data})})
  const payload=await response.json();row=payload.spot
  if(payload.buildsTriggered!==0)throw new Error('UNEXPECTED_BUILD_TRIGGER')
}
try {
  const login=await request(resume?'resume_session_login':'real_auth_login','/api/candidate/session',{method:'POST',body:JSON.stringify({email:fixture.email,password:fixture.password})})
  const session=await login.json()
  if(session.access_token||session.refresh_token)throw new Error('BROWSER_TOKEN_RESPONSE_LEAK')
  const cookieHeaders=login.headers.getSetCookie()
  if(cookieHeaders.length!==2||cookieHeaders.some(value=>!value.includes('HttpOnly; Secure; SameSite=Strict')))throw new Error('SESSION_COOKIE_PROTECTION_FAILED')
  cookies=cookieHeaders.map(value=>value.split(';')[0]).join('; ')
  const load=await request(resume?'resume_current_version':'load_fixture',`/api/candidate/spots/${fixture.spotId}`,{authenticated:true})
  row=(await load.json()).spot
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF5kAAAAASUVORK5CYII=','base64')
  await writeFile('artifacts/cloudflare-phase3/test-photo.png',png)
  let image,marker,beforeWithdrawal
  if(resume) {
    if(!report.smallImagePath||row.publication_status!=='hidden')throw new Error('RESUME_STATE_NOT_WITHDRAWN_FIXTURE')
    image={url:report.smallImagePath};marker=report.contentMarker;beforeWithdrawal=report.startedAt
  } else {
  const upload=await request('small_native_r2_upload',`/api/candidate/spots/${fixture.spotId}/image`,{method:'POST',authenticated:true,type:'image/png',body:png,expected:201})
  image=await upload.json();report.smallImageBytes=image.bytes;report.smallImagePath=image.url
  marker=`真实 Cloudflare 发布闭环 ${new Date().toISOString()}`
  report.contentMarker=marker
  await save('save_publish',{name:'Cloudflare isolated publication acceptance',name_cn:'Cloudflare 隔离发布验收',description:marker,experience_zh:marker,image_url:image.url,images:[image.url],publication_status:'published'})
  const publicPage=await request('anonymous_immediate_html',`/spot/${fixture.slug}`)
  if(!(await publicPage.text()).includes(marker)||!publicPage.headers.get('cache-control')?.includes('no-store'))throw new Error('PUBLISHED_HTML_NOT_FRESH')
  const imageRead=await request('anonymous_r2_read',image.url,{type:'image/png'})
  const bytes=Buffer.from(await imageRead.arrayBuffer())
  if(createHash('sha256').update(bytes).digest('hex')!==createHash('sha256').update(png).digest('hex'))throw new Error('R2_BYTES_MISMATCH')
  await request('anonymous_admin_denied',`/api/candidate/spots/${fixture.spotId}`,{expected:401})
  beforeWithdrawal=row.updated_at
  await save('withdraw_fixture',{publication_status:'hidden'})
  }
  for(const path of [`/spot/${fixture.slug}`,`/en/spot/${fixture.slug}`,`/spot/old-alias-${fixture.spotId}`,`/spot/${fixture.slug}.html`,`/spot/${fixture.slug}.txt`,`/api/candidate/public/spots/${fixture.spotId}`,`/_next/data/old-build/spot/${fixture.slug}.json`]) {
    if(resume&&report.checks.some(check=>check.name==='withdrawn_representation_denied'&&check.path===path&&check.passed))continue
    await request('withdrawn_representation_denied',path,{expected:404})
  }
  await request('withdrawn_r2_image_denied',image.url,{expected:[401,403,404]})
  await request('stale_save_denied',`/api/candidate/spots/${fixture.spotId}`,{method:'PATCH',authenticated:true,expected:409,body:JSON.stringify({expectedUpdatedAt:beforeWithdrawal,data:{description:'stale write must not win'}})})
  await save('republish_fixture',{publication_status:'published'})
  await request('republished_html',`/spot/${fixture.slug}`)
  report.nativeSmallSpotLoopPassed=true
  // Exact documented maximum. Valid PNG payload with trailing padding isolates
  // request-body/R2 handling cost without adding any image transformation work.
  const maximum=Buffer.alloc(10*1024*1024);png.copy(maximum)
  const large=await request('maximum_10mib_native_r2_upload',`/api/candidate/spots/${fixture.spotId}/image`,{method:'POST',authenticated:true,type:'image/png',body:maximum,expected:201})
  const big=await large.json();report.maximumImageBytes=big.bytes;report.maximumImagePath=big.url
  report.maximumUploadPassed=big.bytes===10*1024*1024
  await request('real_logout','/api/candidate/session',{method:'DELETE',authenticated:true})
  report.httpAcceptancePassed=true
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'NATIVE_ACCEPTANCE_FAILED';report.hold=true}
report.finishedAt=new Date().toISOString();report.requestCount=report.checks.length
await writeFile('artifacts/cloudflare-phase3/native-acceptance.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(report.error)process.exitCode=1
