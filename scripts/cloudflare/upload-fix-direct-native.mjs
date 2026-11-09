// Native isolated direct-upload acceptance. Never log URLs with SigV4 tokens.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root='artifacts/cloudflare-upload-fix/'
const deployment=JSON.parse(await readFile(root+'deployment.json','utf8'))
const boundary=JSON.parse(await readFile(root+'boundaries.json','utf8'))
const fixture=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const mode=process.argv.includes('--check-hold')?'hold':process.argv.includes('--repeat-ten')?'repeat':process.argv.includes('--security')?'security':'sizes'
if(!deployment.success||deployment.environment!=='preview'||!boundary.boundariesPassed||fixture.projectRef!=='rnamstwwbzknwbjwdgrf'||fixture.spotId!==1)throw new Error('ISOLATED_PREVIEW_REQUIRED')
if(mode!=='hold'&&!boundary.directUploadCredentialsReady)throw new Error('PREVIEW_SIGNING_SECRETS_REQUIRED')
const file=root+(mode==='hold'?'direct-hold-check.json':'direct-acceptance.json')
let report
try{report=JSON.parse(await readFile(file,'utf8'))}catch{}
report??={url:origin,deploymentId:deployment.deploymentId,workerSha256:deployment.workerSha256,checks:[],uploads:[],hold:true}
if(report.deploymentId!==deployment.deploymentId)throw new Error('REPORT_DEPLOYMENT_MISMATCH')
if(report.error)throw new Error('PREVIOUS_FAILURE_REQUIRES_REVIEW')
if(mode==='repeat'&&!report.sizesPassed)throw new Error('SIZE_TESTS_REQUIRED')
if(mode==='security'&&!report.independentTenPassed)throw new Error('INDEPENDENT_REPEAT_REQUIRED')
let cookies=''
async function call(name,path,{method='GET',body,auth=true,expected=200}={}) {
  const acceptanceId=`${Date.now()}-${report.checks.length}`,headers={'X-JnQ-Acceptance':acceptanceId}
  if(auth&&cookies)headers.Cookie=cookies
  if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json'}
  const start=performance.now(),response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(30000)})
  const check={name,path,method,status:response.status,expected,acceptanceId,wallTimeMs:Math.round(performance.now()-start)}
  report.checks.push(check)
  let trace
  for(let i=0;i<160;i++){
    try{const tail=JSON.parse(await readFile(root+'direct-runtime-events.json','utf8'));if(tail.deploymentId===deployment.deploymentId)trace=tail.events.find(e=>e.acceptanceId===acceptanceId)}catch{}
    if(trace)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(typeof trace?.cpuTime!=='number')throw new Error('NATIVE_CPU_NOT_OBSERVED')
  check.cpuTimeMs=trace.cpuTime;check.runtimeWallTimeMs=trace.wallTime;check.outcome=trace.outcome
  if(trace.cpuTime>10||trace.outcome==='exceededResources')throw new Error('DIRECT_CPU_BUDGET_EXCEEDED')
  if(response.status!==expected){
    const known=['R2 verified copy failed','Copied object verification failed','Uploaded size or type does not match authorization','Uploaded signature does not match type','Isolated Preview signing credentials are not configured','Candidate service unavailable','Upstream redirect refused']
    try{const error=(await response.json()).error;if(known.includes(error)||/^Upstream unavailable \[[A-Z_]+\]$/.test(error))check.serverError=error}catch{}
    throw new Error('NATIVE_STATUS_FAILED')
  }
  return response
}
const base='/api/candidate/spots/1/image'
async function grant(size,type='image/png') {return (await call('authorize_direct',base+'/presign',{method:'POST',body:{size,type},expected:201})).json()}
async function put(ticket,bytes,type='image/png',expected=200,withOrigin=false) {
  const start=performance.now()
  const response=await fetch(ticket.putUrl,{method:'PUT',headers:{'Content-Type':type,...(withOrigin?{Origin:origin}:{})},body:bytes,redirect:'manual',signal:AbortSignal.timeout(90000)})
  const result={name:'direct_s3_put',status:response.status,expected,bytes:bytes.length,wallTimeMs:Math.round(performance.now()-start),workerInvocations:0}
  report.checks.push(result)
  // Never persist an S3 response body, header, or signed URL.
  if(response.status!==expected){
    const code=(await response.text()).match(/<Code>([A-Za-z]+)<\/Code>/)?.[1]
    if(['AccessDenied','SignatureDoesNotMatch','InvalidAccessKeyId','InvalidArgument','InvalidRequest','MissingContentLength','NoSuchBucket','RequestTimeTooSkewed'].includes(code))result.s3ErrorCode=code
    throw new Error('S3_PUT_STATUS_FAILED')
  }
  await response.body?.cancel()
  if(withOrigin){result.corsAllowed=response.headers.get('Access-Control-Allow-Origin')===origin;if(!result.corsAllowed)throw new Error('S3_PUT_CORS_FAILED')}
}
async function corsPreflight(ticket,source,allowed){
  const response=await fetch(ticket.putUrl,{method:'OPTIONS',headers:{Origin:source,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'},redirect:'manual',signal:AbortSignal.timeout(15000)})
  const originAllowed=response.headers.get('Access-Control-Allow-Origin'),putAllowed=/\bPUT\b/i.test(response.headers.get('Access-Control-Allow-Methods')||''),typeAllowed=/\bcontent-type\b/i.test(response.headers.get('Access-Control-Allow-Headers')||'')
  await response.body?.cancel()
  const passed=allowed?response.ok&&originAllowed===source&&putAllowed&&typeAllowed:!originAllowed
  report.checks.push({name:allowed?'cors_preview_origin':'cors_unapproved_origin',status:response.status,allowed:!!originAllowed,passed,workerInvocations:0})
  if(!passed)throw new Error('S3_CORS_PREFLIGHT_FAILED')
}
try {
  const login=await call('session_'+mode,'/api/candidate/session',{method:'POST',body:{email:fixture.email,password:fixture.password}})
  cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
  if(mode==='hold') {
    await call('missing_signing_secrets_fail_closed',base+'/presign',{method:'POST',body:{size:10485760,type:'image/png'},expected:503})
    await call('unsafe_stream_disabled',base,{method:'POST',body:{},expected:503})
    await call('unauthenticated_grant_denied',base+'/presign',{method:'POST',body:{size:1024,type:'image/png'},auth:false,expected:401})
    report.holdGatePassed=true
  } else if(mode==='sizes'||mode==='repeat') {
    const images=JSON.parse(await readFile(root+'images.json','utf8'))
    for(const image of mode==='sizes'?images.slice(0,3):images.slice(3)) {
      const bytes=await readFile(image.file)
      if(bytes.length!==image.bytes||createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error('VALID_FIXTURE_MISMATCH')
      const ticket=await grant(bytes.length)
      try {
        const authorizeCpu=report.checks.at(-1).cpuTimeMs
        await put(ticket,bytes)
        const result=await(await call('verify_direct_'+image.bytes,base+'/complete',{method:'POST',body:{key:ticket.key},expected:201})).json()
        if(!result.validated||result.bytes!==image.bytes)throw new Error('VERIFICATION_FAILED')
        report.uploads.push({...image,key:result.key,url:result.url,authorizeCpuMs:authorizeCpu,verifyCpuMs:report.checks.at(-1).cpuTimeMs,mode})
      }catch(error){
        // Stop on the first failed gate. Pending objects are covered by the
        // isolated bucket's staging/ticket lifecycle; no extra Worker call.
        report.pendingUpload={key:ticket.key}
        throw error
      }
    }
    if(mode==='sizes')report.sizesPassed=true
    else{if(new Set(report.uploads.map(u=>u.key)).size!==4)throw new Error('INDEPENDENT_OBJECT_REQUIRED');report.independentTenPassed=true}
  } else {
    const restricted=await grant(1024)
    await corsPreflight(restricted,origin,true)
    await corsPreflight(restricted,'https://not-approved.invalid',false)
    await put(restricted,Buffer.alloc(1024),'image/jpeg',403)
    await put(restricted,Buffer.alloc(1025),'image/png',403)
    const read=await fetch(restricted.putUrl,{redirect:'manual',signal:AbortSignal.timeout(15000)})
    await read.body?.cancel();report.checks.push({name:'put_capability_cannot_get',status:read.status,expected:403})
    if(read.status!==403)throw new Error('SIGNED_METHOD_NOT_ENFORCED')
    await call('cancel_unused_ticket',base+'/cancel',{method:'POST',body:{key:restricted.key}})
    report.compatibilityPassed=true
    await call('unauthorized',base+'/presign',{method:'POST',auth:false,body:{size:1024,type:'image/png'},expected:401})
    for(const size of [null,10485761])await call('invalid_size_grant',base+'/presign',{method:'POST',body:{size,type:'image/png'},expected:400})
    let row=(await(await call('version_for_upload_regression','/api/candidate/spots/1')).json()).spot
    const ticket=await grant(1024)
    await put(ticket,Buffer.alloc(1024),'image/png',200,true)
    await call('unverified_object_cannot_publish','/api/candidate/spots/1',{method:'PATCH',body:{expectedUpdatedAt:row.updated_at,data:{image_url:'/'+ticket.key}},expected:400})
    await call('invalid_signature_rejected_and_cleaned',base+'/complete',{method:'POST',body:{key:ticket.key},expected:415})
    await call('invalid_object_not_public','/'+ticket.key,{auth:false,expected:404})
    await call('failed_ticket_removed',base+'/complete',{method:'POST',body:{key:ticket.key},expected:403})
    const originalVersion=row.updated_at,image=report.uploads[0]
    async function save(name,data){row=(await(await call(name,'/api/candidate/spots/1',{method:'PATCH',body:{expectedUpdatedAt:row.updated_at,data}})).json()).spot}
    await save('verified_reference',{image_url:image.url,images:[image.url]})
    await call('version_conflict','/api/candidate/spots/1',{method:'PATCH',body:{expectedUpdatedAt:originalVersion,data:{description:'must not win'}},expected:409})
    const response=await call('published_verified_media',image.url,{auth:false})
    if(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==image.sha256)throw new Error('STORED_BYTES_DIFFER')
    await save('withdraw_for_image_guard',{publication_status:'hidden'})
    await call('withdrawn_image_denied',image.url,{auth:false,expected:401})
    await save('republish_fixture',{publication_status:'published'})
    report.securityPassed=true;report.hold=false
  }
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'NATIVE_DIRECT_CHECK_FAILED';report.hold=true}
report.finishedAt=new Date().toISOString()
await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
if(report.error)process.exitCode=1
