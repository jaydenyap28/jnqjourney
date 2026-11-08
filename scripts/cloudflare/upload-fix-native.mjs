import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const deployment=JSON.parse(await readFile('artifacts/cloudflare-phase3/deployment.json','utf8'))
const fixture=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
const images=JSON.parse(await readFile('artifacts/cloudflare-upload-fix/images.json','utf8'))
if(!deployment.success||deployment.environment!=='preview'||fixture.projectRef!=='rnamstwwbzknwbjwdgrf'||fixture.spotId!==1)throw new Error('ISOLATED_PREVIEW_REQUIRED')
const origin=deployment.url,mode=process.argv.includes('--repeat-ten')?'independent-repeat':process.argv.includes('--security')?'security':'sizes'
let report
try{report=JSON.parse(await readFile('artifacts/cloudflare-upload-fix/acceptance.json','utf8'))}catch{}
if(!report)report={url:origin,deploymentId:deployment.deploymentId,workerSha256:deployment.workerSha256,startedAt:new Date().toISOString(),checks:[],uploads:[],baseline:'Previous Auth/Spot/withdrawal results retained; not rerun.'}
if(report.deploymentId!==deployment.deploymentId)throw new Error('UPLOAD_REPORT_DEPLOYMENT_MISMATCH')
if(mode!=='sizes'&&!report.sizesPassed)throw new Error('SIZE_TESTS_REQUIRED')
if(mode==='security'&&!report.independentTenPassed)throw new Error('INDEPENDENT_REPEAT_REQUIRED')
let cookies=''
async function call(name,route,{method='GET',body,auth=true,type='application/json',expected=200}={}){
  const acceptanceId=`${Date.now()}-${report.checks.length}`,headers={'X-JnQ-Acceptance':acceptanceId}
  if(auth&&cookies)headers.Cookie=cookies
  if(!['GET','HEAD'].includes(method)){headers.Origin=origin;headers['Content-Type']=type}
  const start=performance.now()
  const response=await fetch(origin+route,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(90000),...(body instanceof ReadableStream?{duplex:'half'}:{})})
  const record={name,method,path:route,status:response.status,wallTimeMs:Math.round(performance.now()-start),expected,acceptanceId,passed:response.status===expected}
  report.checks.push(record)
  if(!record.passed){try{const data=await response.clone().json();if(typeof data.error==='string')record.serverError=data.error.slice(0,200)}catch{};throw new Error('NATIVE_STATUS_FAILED')}
  let trace
  for(let i=0;i<160;i++){
    try{const tail=JSON.parse(await readFile('artifacts/cloudflare-upload-fix/runtime-events.json','utf8'));if(tail.deploymentId===deployment.deploymentId)trace=tail.events.find(e=>e.acceptanceId===acceptanceId)}catch{}
    if(trace)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  if(typeof trace?.cpuTime!=='number')throw new Error('NATIVE_CPU_NOT_OBSERVED')
  record.cpuTimeMs=trace.cpuTime;record.runtimeWallTimeMs=trace.wallTime
  if(trace.cpuTime>10||trace.outcome==='exceededResources'){record.cpuExceeded=true;throw new Error('STREAM_CPU_BUDGET_EXCEEDED')}
  return response
}
try{
  const login=await call(`${mode}_session`,'/api/candidate/session',{method:'POST',body:JSON.stringify({email:fixture.email,password:fixture.password})})
  cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
  if(mode==='sizes'||mode==='independent-repeat'){
    const selected=mode==='sizes'?images.slice(0,3):images.slice(3)
    for(const image of selected){
      const data=await readFile(image.file)
      if(data.length!==image.bytes||createHash('sha256').update(data).digest('hex')!==image.sha256)throw new Error('VALID_FIXTURE_MISMATCH')
      const response=await call(image.file.split('/').at(-1),'/api/candidate/spots/1/image',{method:'POST',type:'image/png',body:data,expected:201})
      const upload=await response.json()
      if(upload.validated!==true||upload.bytes!==image.bytes)throw new Error('VALIDATION_RECEIPT_MISSING')
      report.uploads.push({...image,url:upload.url,key:upload.key,cpuTimeMs:report.checks.at(-1).cpuTimeMs,mode})
    }
    if(mode==='sizes')report.sizesPassed=true
    else{report.independentTenPassed=true;if(new Set(report.uploads.map(u=>u.key)).size!==4)throw new Error('INDEPENDENT_OBJECT_REQUIRED')}
  }else{
    const bytes=await readFile(images[0].file),sample=bytes.subarray(0,256)
    await call('unauthorized_upload','/api/candidate/spots/1/image',{method:'POST',body:sample,type:'image/png',auth:false,expected:401})
    await call('signature_mismatch','/api/candidate/spots/1/image',{method:'POST',body:sample,type:'image/jpeg',expected:415})
    const unknown=new ReadableStream({start(controller){controller.enqueue(sample);controller.close()}})
    await call('unknown_length','/api/candidate/spots/1/image',{method:'POST',body:unknown,type:'image/png',expected:411})
    await call('over_limit','/api/candidate/spots/1/image',{method:'POST',body:Buffer.alloc(10*1024*1024+1),type:'image/png',expected:413})
    let row=(await(await call('version_for_upload_regression','/api/candidate/spots/1')).json()).spot
    const originalVersion=row.updated_at,image=report.uploads[0]
    const previous=JSON.parse(await readFile('artifacts/cloudflare-phase3/native-acceptance.json','utf8'))
    await call('unverified_existing_object_cannot_publish','/api/candidate/spots/1',{method:'PATCH',body:JSON.stringify({expectedUpdatedAt:row.updated_at,data:{image_url:previous.smallImagePath}}),expected:400})
    await call('unverified_existing_object_cannot_read',previous.smallImagePath,{auth:false,expected:404})
    async function save(name,data){const result=await call(name,'/api/candidate/spots/1',{method:'PATCH',body:JSON.stringify({expectedUpdatedAt:row.updated_at,data})});row=(await result.json()).spot}
    await save('verified_image_reference',{image_url:image.url,images:[image.url]})
    await call('version_conflict_preserved','/api/candidate/spots/1',{method:'PATCH',body:JSON.stringify({expectedUpdatedAt:originalVersion,data:{description:'stale must not win'}}),expected:409})
    const imageRead=await call('verified_image_read',image.url,{auth:false})
    if(createHash('sha256').update(Buffer.from(await imageRead.arrayBuffer())).digest('hex')!==image.sha256)throw new Error('STORED_IMAGE_BYTES_DIFFER')
    await save('withdraw_for_media_guard',{publication_status:'hidden'})
    await call('hidden_image_denied',image.url,{auth:false,expected:401})
    await save('restore_fixture_publication',{publication_status:'published'})
    report.securityPassed=true
  }
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'NATIVE_UPLOAD_ACCEPTANCE_FAILED';report.hold=true;if(report.error==='STREAM_CPU_BUDGET_EXCEEDED')report.presignedFallbackRequired=true}
report.finishedAt=new Date().toISOString()
await writeFile('artifacts/cloudflare-upload-fix/acceptance.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({mode,url:report.url,checks:report.checks.slice(-16),uploads:report.uploads.map(({file,bytes,cpuTimeMs})=>({file,bytes,cpuTimeMs})),sizesPassed:report.sizesPassed,independentTenPassed:report.independentTenPassed,securityPassed:report.securityPassed,error:report.error,hold:report.hold},null,2))
if(report.error)process.exitCode=1
