import assert from 'node:assert/strict'
import {readFile,writeFile,rename} from 'node:fs/promises'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createClient} from '@supabase/supabase-js'
import {getFormalKey} from './formal-read-source.mjs'
const ref='vrufunuomioczocdsoer',base=`https://${ref}.supabase.co`,origin='https://read-only.jnqjourney-admin-formal.pages.dev'
const resume=process.argv[2]==='--resume-browser-observation'
const resumeBytes=process.argv[2]==='--resume-private-denial'
assert.deepEqual(process.argv.slice(2),[resume?'--resume-browser-observation':resumeBytes?'--resume-private-denial':'--one-generated-image',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),dir=path.join(root,'production-publisher/media-resume-20261113')
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,'')),sha=b=>createHash('sha256').update(b).digest('hex')
const s=await json(path.join(root,'production-publisher/settings.json')),roles=await json(path.join(root,'production-publisher/verified-operator-allowlists.json')),f=await json(path.join(dir,'fixtures.json'))
assert.ok(!s.enabled&&!s.formalUploadsEnabled&&!s.formalPublishingEnabled&&s.formalWritesEnabled)
process.env.JNQ_SUPABASE_CLI=s.supabaseCli;process.env.DEBUG=''
const publicKey=(await json('artifacts/cloudflare-static-recovery/.public-read-key.json')).apiKey
const db=createClient(base,await getFormalKey(),{auth:{persistSession:false,autoRefreshToken:false}}),client=createClient(base,publicKey,{auth:{persistSession:false,autoRefreshToken:false}})
const bytes=await readFile(path.join(dir,'fixture.png'));assert.equal(sha(bytes),f.sha256)
const result={result:'PENDING',checks:[],r2Calls:0,edgeCalls:0,generatedImage:{sha256:f.sha256,bytes:f.size,width:96,height:64},formalUploadStillOff:true}
if(resume){const p=await json(path.join(dir,'acceptance.json'));assert.ok(p.result==='FORMAL_MEDIA_ADMISSION_FAIL'&&p.failedPhase==='upload-spot'&&p.r2Calls===1&&!p.mediaName&&p.uploadStoppedTextOn);await rename(path.join(dir,'acceptance.json'),path.join(dir,'acceptance-attempt1-browser-observation.json'));result.history={previousFailedAttemptPreserved:true,previousR2Attempts:1,previousEdgeRequests:p.edgeCalls,previousNegativeStatus:'UNKNOWN_NOT_RECORDED'};result.checks.push(...p.checks.slice(1,5))}
if(resumeBytes){const p=await json(path.join(dir,'acceptance.json'));assert.ok(p.result==='FORMAL_MEDIA_ADMISSION_FAIL'&&p.failedPhase==='bytes'&&p.checks.includes('real_chrome_image_decode')&&!p.checks.includes('spot_private_reference_saved')&&p.uploadStoppedTextOn);await rename(path.join(dir,'acceptance.json'),path.join(dir,'acceptance-attempt2-anonymous-status.json'));result.history={...p.history,secondFailedAttemptPreserved:true,secondAttemptR2Requests:p.r2Calls,secondAttemptEdgeRequests:p.edgeCalls,secondNegativeStatus:'UNKNOWN_ORIGINAL_FRESH_DIAGNOSTIC_400_XML'};result.checks.push(...p.checks);result.mediaName=p.mediaName}
let access,browser,phase='auth',last
function check(value,name){assert.ok(value,name);result.checks.push(name)}
async function call(action,method='GET',body,main=false,token=access){
 const url=base+'/functions/v1/'+(main?'jnq-admin-formal':'jnq-admin-media-check')+'/'+action
 const r=await fetch(url,{method,headers:{apikey:publicKey,Authorization:'Bearer '+token,...(main?{Origin:origin}:{}),...(body?{'Content-Type':'application/json','X-JnQ-Mutation-Id':randomUUID()}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)})
 result.edgeCalls++;const data=await r.json();last={action,status:r.status,...(/^[A-Z0-9_]+$/.test(data.error||'')?{error:data.error}:{})};return {status:r.status,data}
}
async function nativePut(ticket,type='image/png'){
 result.r2Calls++
 return page.evaluate(async ({url,headers,bytes,type})=>{
  try{const r=await fetch(url,{method:'PUT',headers,body:new Blob([new Uint8Array(bytes)],{type}),credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});return {status:r.status,etag:r.headers.get('etag')}}catch{return {status:0}}
 },{url:ticket.putUrl,headers:{...ticket.headers,'Content-Type':type},bytes:[...bytes],type})
}
let page
try{
 const operator=await db.auth.admin.getUserById(roles.editorAuthIds[0]);assert.ok(!operator.error&&operator.data.user.email_confirmed_at)
 const link=await db.auth.admin.generateLink({type:'magiclink',email:operator.data.user.email});assert.ok(!link.error)
 const login=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});assert.ok(!login.error&&login.data.user.id===roles.editorAuthIds[0]);access=login.data.session.access_token
 let r=await call('session','GET',undefined,true);check(r.status===200&&r.data.writesEnabled&&r.data.uploadsEnabled===false&&r.data.publishingEnabled===false,'formal_upload_and_publication_still_off_text_on')
 if(!resume&&!resumeBytes){
  r=await call('scope');check(r.status===200&&r.data.otherBucketDenied===403,'credential_denied_original_bucket')
  r=await call('presign','POST',{},false,publicKey);check(r.status===401,'anonymous_upload_denied')
  r=await call('upload/r2/presign','POST',{},true);check(r.status===405,'general_upload_capability_not_opened_for_test')
  r=await call('publication','POST',{},true);check(r.status===405,'publication_denied')
 }
 const results={}
 if(resumeBytes){
  const b=db.storage.from('jnq-admin-formal-publication'),listed=await b.list('_uploads',{limit:1000});assert.ok(!listed.error&&listed.data.length<1000)
  const grants=[];for(const item of listed.data.filter(v=>v.name.endsWith('-complete.json'))){const r=await b.download('_uploads/'+item.name);assert.ok(!r.error);const g=JSON.parse(await r.data.text());if(g.name===result.mediaName&&g.actor===roles.editorAuthIds[0]&&g.revoked===false)grants.push(g)}
  for(const target of f.targets){const matches=grants.filter(g=>JSON.stringify(g.binding)===JSON.stringify(target));assert.equal(matches.length,1);results[target.kind]=matches[0].result}
 }else{
 const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
 page=await browser.newPage();await page.goto(origin+'/admin/login',{waitUntil:'domcontentloaded',timeout:45000})
 for(const [index,binding] of f.targets.entries()){
  phase='upload-'+binding.kind
  r=await call('presign','POST',{type:'image/png',size:bytes.length,sha256:f.sha256,rightsEvidence:'Programmatically generated by this approved test; no third-party media.',binding});check(r.status===201,binding.kind+'_grant')
  const ticket=r.data
  check(ticket.expiresIn===120&&ticket.requiredBytes===bytes.length,binding.kind+'_short_exact_size_grant')
  if(index===0){
   // Browser fetch can hide an authorization-error HTTP response behind CORS.
   // Record the actual S3 status separately; Chrome still must PUT correctly.
   const bad=await fetch(ticket.putUrl,{method:'PUT',headers:{...ticket.headers,'Content-Type':'image/jpeg'},body:bytes,redirect:'error'});result.r2Calls++;check(bad.status===403,'s3_http_mime_signature_rejects_wrong_content_type');await bad.body?.cancel()
   const options=await fetch(ticket.putUrl,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,if-none-match'},redirect:'error'});result.r2Calls++;check(options.ok&&options.headers.get('access-control-allow-origin')===origin,'cors_only_admin_origin')
   const evil=await fetch(ticket.putUrl,{method:'OPTIONS',headers:{Origin:'https://example.invalid','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,if-none-match'},redirect:'error'});result.r2Calls++;check(evil.headers.get('access-control-allow-origin')!=='https://example.invalid','cors_unapproved_origin_denied')
  }
  const put=await nativePut(ticket);result.lastNativePutStatus=put.status;check(put.status===200,binding.kind+'_real_chrome_put')
  if(index===0){const duplicate=await nativePut(ticket);check(duplicate.status===412,'same_put_capability_cannot_overwrite_staging')}
  r=await call('complete','POST',{ticket:ticket.ticket,revision:ticket.revision});check(r.status===201&&r.data.verified===true,binding.kind+'_server_verified_complete')
  results[binding.kind]=r.data
  const retry=await call('complete','POST',{ticket:ticket.ticket,revision:ticket.revision});check(retry.status===201&&retry.data.url===r.data.url,binding.kind+'_complete_confirmation')
  if(index===0){
   const foreign=await call('foreign','POST',{ticket:ticket.ticket,revision:ticket.revision});check(foreign.status===403,'other_actor_cannot_use_receipt')
   const cancelled=await call('cancel','POST',{ticket:ticket.ticket,revision:ticket.revision});check(cancelled.status===409,'cancel_does_not_delete_verified_object')
  }
 }
 }
 const name=results.spot.url.split('/').at(-1);result.mediaName=name
 phase='bytes'
 if(!resumeBytes){
 const real=await fetch(base+'/functions/v1/jnq-admin-media-check/bytes?name='+name,{headers:{apikey:publicKey,Authorization:'Bearer '+access},redirect:'error'});result.edgeCalls++;const returned=Buffer.from(await real.arrayBuffer());check(real.status===200&&sha(returned)===f.sha256,'actual_private_bytes_sha256_match')
 const decoded=await page.evaluate(async data=>{const u=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:'image/png'}));try{const img=new Image();img.src=u;await img.decode();return {w:img.naturalWidth,h:img.naturalHeight}}finally{URL.revokeObjectURL(u)}},[...returned]);check(decoded.w===96&&decoded.h===64,'real_chrome_image_decode')
 }
 const anonymous=await fetch('https://41feff7cd62964f2eb33bb82508509a1.r2.cloudflarestorage.com/jnqjourney-admin-private-media/_admin-formal-drafts/'+name,{redirect:'manual'});result.r2Calls++;const anonymousBytes=Buffer.from(await anonymous.arrayBuffer());result.anonymousStatus=anonymous.status;check([400,401,403,404].includes(anonymous.status)&&!anonymous.headers.get('content-type')?.startsWith('image/')&&sha(anonymousBytes)!==f.sha256,'anonymous_s3_bytes_denied')
 r=await call('bytes?name='+name,'GET',undefined,false,publicKey);check(r.status===401,'anonymous_private_edge_bytes_denied')
 const expired=await call('expired');check(expired.status===200,'expired_capability_test_ready');const ep=await fetch(expired.data.putUrl,{method:'PUT',headers:expired.data.headers,body:bytes,redirect:'error'});result.r2Calls++;result.expiredStatus=ep.status;check(ep.status===403,'real_r2_expired_signature_rejected');await ep.body?.cancel()
 phase='references'
 for(const binding of f.targets){
  const kind=binding.kind,url=results[kind].url,proofs={[name]:results[kind].proof}
  let body,route
  if(kind==='spot'){route='admin/locations';body={id:binding.target,expectedUpdatedAt:binding.expectedVersion,data:{image_url:url+'#focus=50,50',images:[url]},mediaProofs:proofs}}
  else{route='admin/'+(kind==='note'?'notes':'guides');body={...f.before[kind],coverImage:url,previousSlug:binding.target,expectedUpdatedAt:binding.expectedVersion,mediaProofs:proofs}}
  if(kind==='spot'){
   const wrong=await call(route,'PATCH',{...body,mediaProofs:{[name]:results.guide.proof}},true);check(wrong.status===409,'cross_content_receipt_rejected')
   const absent=await call(route,'PATCH',{...body,mediaProofs:{}},true);check(absent.status===403,'missing_context_proof_rejected')
  }
  r=await call(route,kind==='spot'?'PATCH':'POST',body,true);check(r.status===200,kind+'_private_reference_saved')
  const read=await call(route+(kind==='spot'?'?id='+binding.target:''),'GET',undefined,true)
  const row=kind==='spot'?read.data.data:read.data[kind==='note'?'notes':'guides'].find(v=>v.slug===binding.target)
  check(read.status===200&&(kind==='spot'?row.image_url.startsWith(url)&&row.publication_status==='hidden':row.coverImage===url&&row.published===false),kind+'_private_reference_readback')
  results[kind].current=row
 }
 phase='failure-and-revocation'
 r=await call('presign','POST',{type:'image/png',size:bytes.length,sha256:f.sha256,rightsEvidence:'Generated test',binding:{...f.targets[0],expectedVersion:'stale'}});check(r.status===409,'stale_upload_content_revision_rejected')
 const b=db.storage.from('jnq-admin-formal-publication'),master=await b.download('_media/'+name+'.json');assert.ok(!master.error);const receipt=JSON.parse(await master.data.text());check(receipt.sha256===f.sha256&&receipt.size===bytes.length&&receipt.type==='image/png'&&/^"?[a-f0-9]{32}"?$/.test(receipt.etag),'trusted_receipt_size_mime_sha_etag')
 const revoked=await b.upload('_media/'+name+'.json',JSON.stringify({...receipt,revoked:true,revokedReason:'Approved bounded generated-media revocation acceptance'}),{upsert:true,contentType:'application/json',cacheControl:'0'});assert.ok(!revoked.error)
 r=await call('complete','POST',results.spot.proof);check(r.status===404||r.status===403,'revoked_object_cannot_confirm_complete')
 for(const binding of f.targets){const kind=binding.kind,current=results[kind].current,route='admin/'+(kind==='spot'?'locations':kind==='note'?'notes':'guides');let body=kind==='spot'?{id:binding.target,expectedUpdatedAt:current.updated_at,data:{image_url:results[kind].url}}:{...current,previousSlug:binding.target,expectedUpdatedAt:current.updatedAt,coverImage:results[kind].url}
  r=await call(route,kind==='spot'?'PATCH':'POST',body,true);check([403,404,409].includes(r.status),kind+'_revoked_reference_rejected')
  body=kind==='spot'?{id:binding.target,expectedUpdatedAt:current.updated_at,data:{image_url:'',images:[]}}:{...current,previousSlug:binding.target,expectedUpdatedAt:current.updatedAt,coverImage:''}
  r=await call(route,kind==='spot'?'PATCH':'POST',body,true);check(r.status===200,kind+'_text_editing_preserved_after_removing_revoked_test_reference')
 }
 const denied=await fetch(base+'/functions/v1/jnq-admin-media-check/bytes?name='+name,{headers:{apikey:publicKey,Authorization:'Bearer '+access},redirect:'error'});result.edgeCalls++;check(denied.status===404,'revoked_private_bytes_denied');await denied.body?.cancel()
 result.result='FORMAL_MEDIA_ADMISSION_PASS';result.testPhotoFinalState='revoked_private_retained';result.referenceDraftsUnpublished=true
}catch{
 result.result='FORMAL_MEDIA_ADMISSION_FAIL';result.failedPhase=phase;result.lastResponse=last
 try{await promisify(execFile)(process.execPath,['scripts/cloudflare/formal-media-release.mjs','--stop',ref],{windowsHide:true,timeout:60000,maxBuffer:1024*1024,env:process.env});result.uploadStoppedTextOn=true}catch{result.stopState='UNKNOWN_RECONCILE_REQUIRED'}
 process.exitCode=1
}finally{
 if(browser)await browser.close()
 if(access){const out=await client.auth.signOut({scope:'local'});result.testSessionRevoked=!out.error}
 await writeFile(path.join(dir,'acceptance.json'),JSON.stringify(result,null,2),{flag:'wx'})
 console.log(JSON.stringify(result))
}
