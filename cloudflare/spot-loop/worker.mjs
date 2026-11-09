// Isolated Spot proof only. No Next.js, Node APIs, AWS SDK, SQL, or cache.
// This file and its pure contract module are packaged for Pages.
import {SPOT_FIELDS, validVersion, validSpotRow, validateSpotFields, publishedSpot, resolveCandidateRedirect} from './spot-contract.mjs'
const PRODUCTION_REF = 'vrufunuomioczocdsoer'
const SELECT = SPOT_FIELDS.join(',')
const MAX_IMAGE = 10 * 1024 * 1024
const COOKIE = '__Host-jnq-candidate'
const REFRESH = '__Host-jnq-candidate-refresh'
const HEADERS = {'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}
const R2_ACCOUNT='41feff7cd62964f2eb33bb82508509a1'
const R2_TEST_BUCKET='jnqjourney-spot-loop-isolated-media'
const UPLOAD_ORIGIN='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const CSP = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_TEST_BUCKET}/_candidate-staging/; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`
class Failure extends Error { constructor(status, message) { super(message); this.status = status } }
const fail = (status, message) => { throw new Failure(status, message) }
const json = (data, status=200, extra={}) => Response.json(data,{status,headers:{...HEADERS,...extra}})
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

export function config(env) {
  if (env.ENVIRONMENT !== 'isolated-candidate') fail(503,'Isolated candidate configuration required')
  const ref=String(env.CANDIDATE_SUPABASE_REF||'')
  if (!/^[a-z0-9]{20}$/.test(ref) || ref===PRODUCTION_REF || env.SUPABASE_URL!==`https://${ref}.supabase.co`) fail(503,'Isolated Supabase project required')
  if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.TEST_MEDIA) fail(503,'Candidate bindings are not configured')
  const emails=String(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
  if (!emails.length) fail(503,'Candidate admin allowlist required')
  let fixtures
  try { fixtures=JSON.parse(env.CANDIDATE_SPOTS||'{}') } catch { fail(503,'Invalid fixture mapping') }
  if (!fixtures || Array.isArray(fixtures) || !Object.keys(fixtures).length || Object.entries(fixtures).some(([id,slug])=>!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||typeof slug!=='string'||!new RegExp(`^cloudflare-loop-[a-z0-9-]+-${id}$`).test(slug))) fail(503,'Explicit fixture IDs and slugs required')
  return {emails,fixtures}
}
function cookie(request,name) {
  const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1)
  return raw && /^[A-Za-z0-9._~-]+$/.test(raw) ? raw : ''
}
function sameOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) fail(403,'Same-origin request required')
  if (request.headers.get('sec-fetch-site')==='cross-site') fail(403,'Cross-site request refused')
}
async function limitedBody(request,limit) {
  const length=request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length)||Number(length)>limit)) fail(413,'Request too large')
  const reader=request.body?.getReader()
  if (!reader) fail(400,'Body required')
  const chunks=[]; let size=0
  while(true) {
    const {value,done}=await reader.read(); if(done)break
    size+=value.byteLength
    if(size>limit){await reader.cancel();fail(413,'Request too large')}
    chunks.push(value)
  }
  return new Blob(chunks)
}
async function bodyJson(request,limit=65536) {
  try { return JSON.parse(await (await limitedBody(request,limit)).text()) } catch(error) { if(error instanceof Failure)throw error;fail(400,'Invalid JSON') }
}
async function remote(transport,url,init={}) {
  let response
  // Native Workers supports manual redirects. Refuse every 3xx ourselves so
  // credentials can never be forwarded to an unexpected redirect destination.
  try { response=await transport(url,{...init,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000)}) } catch(error) {
    const message=String(error?.message||'')
    // Fixed diagnostic codes only: never echo URLs, headers or token values.
    const code=/Illegal invocation/i.test(message)?'FETCH_RECEIVER':/cache/i.test(message)?'FETCH_CACHE_MODE':/redirect/i.test(message)?'FETCH_REDIRECT_MODE':/timeout|abort/i.test(message)?'UPSTREAM_TIMEOUT':'UPSTREAM_TRANSPORT'
    fail(503,`Upstream unavailable [${code}]`)
  }
  if(response.status>=300&&response.status<400)fail(503,'Upstream redirect refused')
  return response
}
async function verifiedUser(env,settings,token,transport) {
  if(!token)fail(401,'Sign in required')
  const response=await remote(transport,`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}})
  if(response.status===401||response.status===403)fail(401,'Session expired')
  if(!response.ok)fail(503,'Auth unavailable')
  const user=await response.json()
  if(!user.id||!user.email_confirmed_at||!settings.emails.includes(String(user.email||'').trim().toLowerCase()))fail(403,'Admin permission required')
  return user
}
async function admin(request,env,settings,transport) {
  return verifiedUser(env,settings,cookie(request,COOKIE),transport)
}
function checkedId(value,settings) {
  if(!Object.hasOwn(settings.fixtures,String(value)))fail(404,'Fixture not found')
  return String(value)
}
async function location(env,id,transport,mutation,remove=false) {
  const url=new URL(`${env.SUPABASE_URL}/rest/v1/locations`)
  url.searchParams.set('id',`eq.${id}`);url.searchParams.set('select',SELECT)
  if(mutation)url.searchParams.set('updated_at',mutation.expectedUpdatedAt===null?'is.null':`eq.${mutation.expectedUpdatedAt}`)
  // Own the version column; no new database trigger/SQL is needed for this path.
  const previous=mutation?.expectedUpdatedAt===null?0:Date.parse(mutation?.expectedUpdatedAt)
  const changes=mutation?{...mutation.data,updated_at:new Date(Math.max(Date.now(),previous+1)).toISOString()}:undefined
  const response=await remote(transport,url.href,{method:remove?'DELETE':mutation?'PATCH':'GET',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'},...(mutation&&!remove?{body:JSON.stringify(changes)}:{})})
  if(!response.ok)fail(503,mutation?'Save failed; reload before retry':'Spot source unavailable')
  const rows=await response.json()
  if(!Array.isArray(rows)||rows.length>1)fail(503,'Invalid Spot source')
  if(!rows.length)fail(mutation?409:404,mutation?'Spot changed; reload before saving':'Spot not found')
  const row=rows[0]
  if(!validSpotRow(row,id))fail(503,'Unverified Spot source')
  return row
}
const visible = publishedSpot
function imagePath(value,id) {
  return typeof value==='string' && new RegExp(`^/media/candidate/${id}/[a-f0-9-]+\\.(?:png|jpg|webp|gif)$`).test(value)
}
async function mutationData(body,id,env) {
  if(!body||typeof body!=='object'||Array.isArray(body)||!Object.hasOwn(body,'expectedUpdatedAt')||!validVersion(body.expectedUpdatedAt))fail(400,'Save version and fields required')
  try {validateSpotFields(body.data)} catch {fail(400,'Invalid Spot fields')}
  const mediaPaths=[...new Set([body.data.image_url,...(body.data.images||[])].filter(Boolean))]
  if(mediaPaths.some(path=>!imagePath(path,id)))fail(400,'Only verified isolated media can be saved')
  if(!await verifiedSaveMedia(env,mediaPaths,id))fail(400,'Uploaded image is missing or unverified')
  return body
}
function redirectTarget(path,settings,env) {
  if(typeof path!=='string'||!/^\/(?:en\/)?(?:spot|notes)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path))fail(400,'Invalid redirect target')
  if(/\/(?:en\/)?spot\//.test(path)) {
    const id=checkedId(path.match(/-([1-9]\d*)$/)?.[1],settings)
    return {kind:'spot',id}
  }
  let notes
  try {notes=JSON.parse(env.CANDIDATE_NOTE_PATHS||'[]')} catch {fail(503,'Invalid isolated Notes mapping')}
  if(!Array.isArray(notes)||!notes.includes(path)||!/^\/(?:en\/)?notes\/cloudflare-loop-[a-z0-9-]+$/.test(path))fail(503,'Notes target requires an isolated visibility contract')
  return {kind:'notes'}
}
async function routing(id,row,settings,env,transport) {
  try {
    return await resolveCandidateRedirect(id,async target=>{
      if(target===id)return row
      try{return await location(env,checkedId(target,settings),transport)}catch(error){if(error.status===404)return null;throw error}
    },path=>redirectTarget(path,settings,env))
  }catch(error){if(error instanceof Failure)throw error;fail(503,'Redirect chain cannot be verified')}
}
async function upload(request,env,id) {
  if(env.CANDIDATE_UPLOAD_MODE!=='stream')fail(503,'Stream upload is on HOLD; use verified direct upload')
  const type=(request.headers.get('content-type')||'').split(';')[0]
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[type]
  if(!ext)fail(415,'JPEG, PNG, WebP or GIF required')
  const declared=request.headers.get('content-length')
  if(!declared)fail(411,'Known image length required')
  if(!/^[0-9]{1,8}$/.test(declared)||Number(declared)>MAX_IMAGE)fail(413,'Image size exceeds 10 MiB')
  const length=Number(declared)
  if(length<12||!request.body)fail(400,'Empty or truncated image')
  const reader=request.body.getReader(),prefix=[]
  const bytes=new Uint8Array(12);let copied=0,consumed=0
  try {
    while(copied<12) {
      const {value,done}=await reader.read()
      if(done)fail(400,'Truncated image')
      consumed+=value.byteLength
      if(consumed>length)fail(400,'Image length mismatch')
      prefix.push(value)
      const take=Math.min(12-copied,value.byteLength)
      bytes.set(value.subarray(0,take),copied);copied+=take
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  finally{reader.releaseLock()}
  const valid=imageSignature(bytes,type)
  if(!valid){await request.body.cancel().catch(()=>{});fail(415,'Image signature does not match type')}
  const key=`media/candidate/${id}/${crypto.randomUUID()}.${ext}`
  const receipt=mediaReceiptKey(key),fixed=new FixedLengthStream(length),abort=new AbortController()
  let writer
  try {
    const store=env.TEST_MEDIA.put(key,fixed.readable,{httpMetadata:{contentType:type},customMetadata:{fixtureId:id}}).catch(error=>{
      abort.abort(error)
      if(writer)void writer.abort(error).catch(()=>{})
      throw error
    })
    const pump=(async()=>{
      writer=fixed.writable.getWriter()
      try {for(const chunk of prefix)await writer.write(chunk)}
      finally{writer.releaseLock();writer=null}
      // The remaining payload stays in the native stream pipeline. No JS loop,
      // arrayBuffer(), Blob, compression, or whole-file copy is used here.
      await request.body.pipeTo(fixed.writable,{signal:abort.signal})
    })()
    const results=await Promise.allSettled([store,pump])
    if(results.some(result=>result.status==='rejected'))throw new Error('Stream failed')
    const object=results[0].value
    if(!object||object.size!==length||!object.etag||!object.version||object.httpMetadata?.contentType!==type)throw new Error('R2 verification failed')
    // Receipt is deliberately separate: a partial/failed put can never make
    // itself publishable by having an optimistic metadata flag on its object.
    const proof={schemaVersion:1,key,fixtureId:id,size:length,etag:object.etag,version:object.version,contentType:type,signatureChecked:true}
    if(!await env.TEST_MEDIA.put(receipt,JSON.stringify(proof),{httpMetadata:{contentType:'application/json'}}))throw new Error('Receipt write failed')
  }catch {
    try {await env.TEST_MEDIA.delete([receipt,key])}catch{fail(503,'Upload failed; private cleanup requires retry')}
    fail(503,'R2 stream failed; incomplete upload removed')
  }
  return json({url:`/${key}`,key,provider:'cloudflare-r2',bytes:length,validated:true},201)
}
function imageSignature(bytes,type){
  if(bytes.length<12)return false
  const ascii=String.fromCharCode(...bytes.subarray(0,12))
  return type==='image/png'?bytes.subarray(0,8).join(',')==='137,80,78,71,13,10,26,10':type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/gif'?/^GIF8[79]a/.test(ascii):type==='image/webp'&&ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'
}
const awsEncode=value=>encodeURIComponent(value).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`)
const hex=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')
const encode=value=>new TextEncoder().encode(value)
async function hmac(key,value){const imported=await crypto.subtle.importKey('raw',typeof key==='string'?encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',imported,encode(value))}
// A browser receives only this scoped, short-lived capability, never the key.
export async function signCandidatePut(env,key,type,size,copySource=null,now=new Date()) {
  if(!env.CANDIDATE_R2_ACCESS_KEY_ID||!env.CANDIDATE_R2_SECRET_ACCESS_KEY)fail(503,'Isolated Preview signing credentials are not configured')
  if(!/^(_candidate-staging|media\/candidate)\/[1-9]\d*\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(key)||!['image/png','image/jpeg','image/webp','image/gif'].includes(type)||!Number.isSafeInteger(size)||size<0||size>MAX_IMAGE)fail(400,'Invalid upload capability')
  if(key.startsWith('media/candidate/')&&(!copySource||copySource!==stagingKey(key)||size!==0))fail(400,'Final objects require a verified server copy')
  const host=`${R2_ACCOUNT}.r2.cloudflarestorage.com`,path=`/${R2_TEST_BUCKET}/${key.split('/').map(awsEncode).join('/')}`
  const date=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),scope=`${day}/auto/s3/aws4_request`
  const headers={'content-length':String(size),'content-type':type,host}
  if(copySource)headers['x-amz-copy-source']=`/${R2_TEST_BUCKET}/${copySource}`
  const names=Object.keys(headers).sort(),signed=names.join(';')
  const query={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Content-Sha256':'UNSIGNED-PAYLOAD','X-Amz-Credential':`${env.CANDIDATE_R2_ACCESS_KEY_ID}/${scope}`,'X-Amz-Date':date,'X-Amz-Expires':'120','X-Amz-SignedHeaders':signed}
  const canonicalQuery=Object.keys(query).sort().map(name=>`${awsEncode(name)}=${awsEncode(query[name])}`).join('&')
  const canonical=['PUT',path,canonicalQuery,names.map(name=>`${name}:${headers[name].trim()}\n`).join(''),signed,'UNSIGNED-PAYLOAD'].join('\n')
  const toSign=`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hex(await crypto.subtle.digest('SHA-256',encode(canonical)))}`
  let signingKey=await hmac(`AWS4${env.CANDIDATE_R2_SECRET_ACCESS_KEY}`,day)
  for(const part of ['auto','s3','aws4_request'])signingKey=await hmac(signingKey,part)
  const signature=hex(await hmac(signingKey,toSign))
  return {url:`https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`,headers:Object.fromEntries(Object.entries(headers).filter(([name])=>name!=='host'))}
}
const ticketKey=key=>`_candidate-tickets/${key.slice('media/candidate/'.length)}.json`
const stagingKey=key=>key.replace('media/candidate/','_candidate-staging/')
async function issueDirect(request,env,id,user) {
  if(new URL(request.url).origin!==UPLOAD_ORIGIN)fail(403,'Use the approved candidate upload origin')
  // Fail before creating tickets if the operator has not provisioned secrets.
  if(!env.CANDIDATE_R2_ACCESS_KEY_ID||!env.CANDIDATE_R2_SECRET_ACCESS_KEY)fail(503,'Isolated Preview signing credentials are not configured')
  const body=await bodyJson(request),ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[body?.type]
  if(!body||Object.keys(body).some(name=>!['size','type'].includes(name))||!ext||!Number.isSafeInteger(body.size)||body.size<12||body.size>MAX_IMAGE)fail(400,'Valid image type and size up to 10 MiB required')
  const key=`media/candidate/${id}/${crypto.randomUUID()}.${ext}`
  const signed=await signCandidatePut(env,stagingKey(key),body.type,body.size)
  const ticket={schemaVersion:1,key,fixtureId:id,userId:user.id,size:body.size,type:body.type,expiresAt:Date.now()+120000}
  await env.TEST_MEDIA.put(ticketKey(key),JSON.stringify(ticket),{httpMetadata:{contentType:'application/json'}})
  return json({key,putUrl:signed.url,method:'PUT',headers:{'Content-Type':body.type},expiresIn:120,requiredBytes:body.size},201)
}
async function completeDirect(request,env,id,user,transport,cancel=false) {
  const body=await bodyJson(request),key=body?.key
  if(typeof key!=='string'||!imagePath(`/${key}`,id)||Object.keys(body).some(name=>name!=='key'))fail(400,'Invalid upload key')
  const ticketObject=await env.TEST_MEDIA.get(ticketKey(key))
  let ticket
  if(ticketObject&&ticketObject.size<=1024){try{ticket=await ticketObject.json()}catch{fail(503,'Upload ticket cannot be verified')}}
  if(!ticket||ticket.schemaVersion!==1||ticket.key!==key||ticket.fixtureId!==id||ticket.userId!==user.id)fail(403,'Upload ticket unavailable')
  if(typeof ticketObject.etag!=='string'||!ticketObject.etag)fail(503,'Upload ticket version unavailable')
  if(ticket.state==='processing') {
    const existing=await verifiedMedia(env,key,id)
    if(!existing||cancel)fail(409,'Upload is processing or already verified')
    return json({url:`/${key}`,key,provider:'cloudflare-r2',bytes:existing.size,validated:true},201)
  }
  if(ticket.state)fail(409,'Upload was already cancelled')
  // R2 conditional writes atomically select one owner across isolates. Do not
  // expire/reclaim processing tickets: ambiguous copy/receipt outcomes require
  // reconciliation, never a second writer deleting a committed object.
  const claimed=await env.TEST_MEDIA.put(ticketKey(key),JSON.stringify({...ticket,state:cancel?'cancelled':'processing'}),{
    onlyIf:{etagMatches:ticketObject.etag},httpMetadata:{contentType:'application/json'},
  })
  if(!claimed)fail(409,'Upload operation already claimed')
  if(cancel){await env.TEST_MEDIA.delete(stagingKey(key));return json({cancelled:true})}
  let receiptAttempted=false
  try {
    if(ticket.expiresAt<Date.now())fail(410,'Upload ticket expired')
    const object=await env.TEST_MEDIA.get(stagingKey(key),{range:{offset:0,length:12}})
    if(!object||object.size!==ticket.size||object.size>MAX_IMAGE||object.httpMetadata?.contentType!==ticket.type)fail(400,'Uploaded size or type does not match authorization')
    if(!imageSignature(new Uint8Array(await object.arrayBuffer()),ticket.type))fail(415,'Uploaded signature does not match type')
    // R2-to-R2 copy is performed by S3, not by reading a 10 MiB body in JS.
    const copy=await signCandidatePut(env,key,ticket.type,0,stagingKey(key))
    const result=await remote(transport,copy.url,{method:'PUT',headers:copy.headers})
    if(!result.ok||/<Error[>\s]/.test(await result.text()))fail(503,'R2 verified copy failed')
    const final=await env.TEST_MEDIA.get(key,{range:{offset:0,length:12}})
    if(!final||final.size!==ticket.size||final.httpMetadata?.contentType!==ticket.type||!imageSignature(new Uint8Array(await final.arrayBuffer()),ticket.type))fail(400,'Copied object verification failed')
    const proof={schemaVersion:1,key,fixtureId:id,size:final.size,etag:final.etag,version:final.version,contentType:ticket.type,signatureChecked:true}
    receiptAttempted=true
    if(!await env.TEST_MEDIA.put(mediaReceiptKey(key),JSON.stringify(proof),{httpMetadata:{contentType:'application/json'}}))fail(503,'Upload receipt unavailable')
    // The ticket and staging prefixes already have lifecycle cleanup. Failure
    // to clean staging must never revoke or delete a verified final object.
    await env.TEST_MEDIA.delete(stagingKey(key)).catch(()=>{})
    return json({url:`/${key}`,key,provider:'cloudflare-r2',bytes:final.size,validated:true},201)
  }catch(error){
    if(!receiptAttempted){
      try{await env.TEST_MEDIA.delete([stagingKey(key),mediaReceiptKey(key),key])}catch{fail(503,'Upload rejected; private cleanup requires reconciliation')}
    }
    throw error
  }
}
function mediaReceiptKey(key){return `_candidate-validation/${key.slice('media/candidate/'.length)}.json`}
async function mediaProof(env,key,id) {
  const proofObject=await env.TEST_MEDIA.get(mediaReceiptKey(key))
  if(!proofObject)return null
  if(proofObject.size>1024){await proofObject.body?.cancel().catch(()=>{});return null}
  let proof
  try {proof=await proofObject.json()}catch{return null}
  if(!proof||proof.schemaVersion!==1||proof.key!==key||proof.fixtureId!==id||proof.signatureChecked!==true||!Number.isSafeInteger(proof.size)||proof.size<12||proof.size>MAX_IMAGE||!['image/png','image/jpeg','image/webp','image/gif'].includes(proof.contentType))return null
  return proof
}
function matchesMediaProof(object,proof) {
  return !!object&&object.size===proof.size&&object.etag===proof.etag&&object.version===proof.version&&object.httpMetadata?.contentType===proof.contentType
}
async function verifiedSaveMedia(env,paths,id) {
  // Every submitted reference is checked, including first-save/new and unchanged
  // media. No browser proof, persisted row, cache or "already saved" shortcut.
  if(paths.length<2||typeof env.TEST_MEDIA.list!=='function') {
    for(const path of paths)if(!await verifiedMedia(env,path.slice(1),id))return false
    return true
  }
  const proofs=[]
  // Bound live R2 bodies/connections. Parse the authoritative receipt bodies;
  // never replace them with an optimistic flag or custom metadata projection.
  for(let start=0;start<paths.length;start+=4) {
    const batch=await Promise.all(paths.slice(start,start+4).map(path=>mediaProof(env,path.slice(1),id)))
    if(batch.some(proof=>!proof))return false
    proofs.push(...batch)
  }
  // List returns current object size/etag/version + HTTP metadata in one native
  // operation. Read after receipts, just as the old per-object HEAD did.
  // Keep listing bounded; exact-key HEAD handles keys beyond this first page.
  const listed=await env.TEST_MEDIA.list({prefix:`media/candidate/${id}/`,limit:Math.max(32,paths.length*2),include:['httpMetadata']})
  const objects=new Map(listed.objects.map(object=>[object.key,object]))
  for(const proof of proofs) {
    let object=objects.get(proof.key)
    if(!object&&listed.truncated)object=await env.TEST_MEDIA.head(proof.key)
    if(!matchesMediaProof(object,proof))return false
  }
  return true
}
async function verifiedMedia(env,key,id,body=false) {
  const proof=await mediaProof(env,key,id)
  if(!proof)return null
  const object=await env.TEST_MEDIA[body?'get':'head'](key)
  if(!matchesMediaProof(object,proof)) {
    if(object?.body)await object.body.cancel().catch(()=>{})
    return null
  }
  return object
}
function document(row,slug,locale,englishCurrent=false) {
  const name=locale==='en'?row.name:(row.name_cn||row.name)
  const title=(locale==='en'?row.seo_title_en:row.seo_title_zh)||name
  const description=(locale==='en'?row.seo_description_en:row.seo_description_zh)||row.description||''
  const narrative=(locale==='en'?row.experience_en:row.experience_zh)||row.description||''
  const prefix=locale==='en'?'/en':''
  const canonical=`https://www.jnqjourney.com${prefix}/spot/${slug}`
  const images=[...new Set([row.image_url,...(Array.isArray(row.images)?row.images:[])].filter(value=>imagePath(value,row.id)))]
  const chinese=`https://www.jnqjourney.com/spot/${slug}`
  const languageLinks=`<link rel="alternate" hreflang="zh-Hans" href="${chinese}"><link rel="alternate" hreflang="x-default" href="${chinese}">${englishCurrent?`<link rel="alternate" hreflang="en" href="https://www.jnqjourney.com/en/spot/${slug}">`:''}`
  return `<!doctype html><html lang="${locale==='en'?'en':'zh-Hans'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} | JnQ Journey</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${canonical}">${languageLinks}<link rel="stylesheet" href="/candidate.css"></head><body><main><p>JnQ Journey · 隔离发布候选</p><h1>${escape(name)}</h1><p>${escape(row.address)}</p><p class="narrative">${escape(narrative)}</p>${images.map((src,i)=>{const metadata=row.image_metadata?.[src]||{};return `<figure><img src="${src}" alt="${escape(metadata[locale==='en'?'alt_en':'alt_zh']||`${name} ${i+1}`)}" loading="${i?'lazy':'eager'}">${metadata.caption?`<figcaption>${escape(metadata.caption)}</figcaption>`:''}</figure>`}).join('')}<p>内容版本：<time>${escape(row.updated_at)}</time></p><a href="/admin/cloudflare-spot">返回测试后台</a></main></body></html>`
}
async function responseFor(request,env,transport) {
  const url=new URL(request.url)
  // Static editor files contain no injected config or credentials.
  if(['/admin/cloudflare-spot','/candidate-editor.js','/candidate.css'].includes(url.pathname))return env.ASSETS.fetch(request)
  const settings=config(env)
  if(url.protocol!=='https:')fail(400,'HTTPS required')
  const mutating=!['GET','HEAD'].includes(request.method)
  if(mutating)sameOrigin(request)
  if(url.pathname==='/api/candidate/session') {
    if(request.method==='DELETE') {
      const token=cookie(request,COOKIE)
      if(token) {
        const response=await remote(transport,`${env.SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}})
        if(!response.ok&&response.status!==401)fail(503,'Sign out unavailable')
      }
      const response=json({signedOut:true})
      for(const name of [COOKIE,REFRESH])response.headers.append('Set-Cookie',`${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
      return response
    }
    if(request.method==='GET'){await admin(request,env,settings,transport);return json({fixtures:settings.fixtures})}
    if(request.method!=='POST')fail(405,'Method not allowed')
    const body=await bodyJson(request)
    const refreshing=body?.refresh===true
    if(!refreshing&&(typeof body?.email!=='string'||typeof body?.password!=='string'||!settings.emails.includes(body.email.trim().toLowerCase())))fail(401,'Sign in failed')
    const refresh=cookie(request,REFRESH)
    if(refreshing&&!refresh)fail(401,'Sign in required')
    const auth=await remote(transport,`${env.SUPABASE_URL}/auth/v1/token?grant_type=${refreshing?'refresh_token':'password'}`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(refreshing?{refresh_token:refresh}:{email:body.email,password:body.password})})
    if(!auth.ok)fail(auth.status===429?429:401,'Sign in failed')
    const session=await auth.json()
    if(!/^[A-Za-z0-9._~-]+$/.test(session.access_token||'')||!/^[A-Za-z0-9._~-]+$/.test(session.refresh_token||''))fail(503,'Invalid Auth response')
    await verifiedUser(env,settings,session.access_token,transport)
    const response=json({signedIn:true,expiresIn:Math.min(3600,Number(session.expires_in)||3600),fixtures:settings.fixtures})
    response.headers.append('Set-Cookie',`${COOKIE}=${session.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.min(3600,Number(session.expires_in)||3600)}`)
    response.headers.append('Set-Cookie',`${REFRESH}=${session.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`)
    return response
  }
  const edit=url.pathname.match(/^\/api\/candidate\/spots\/([1-9]\d*)(\/image(?:\/(presign|complete|cancel))?)?$/)
  if(edit) {
    const user=await admin(request,env,settings,transport)
    const id=checkedId(edit[1],settings)
    if(edit[2]) {
      if(request.method!=='POST')fail(405,'Method not allowed')
      if(env.CANDIDATE_WRITES_ENABLED!=='true')fail(503,'Candidate writes are disabled')
      await location(env,id,transport)
      if(edit[3]==='presign')return issueDirect(request,env,id,user)
      if(edit[3]==='complete'||edit[3]==='cancel')return completeDirect(request,env,id,user,transport,edit[3]==='cancel')
      return upload(request,env,id)
    }
    if(request.method==='GET')return json({spot:await location(env,id,transport),publicPath:`/spot/${settings.fixtures[id]}`})
    if(!['PATCH','DELETE'].includes(request.method))fail(405,'Method not allowed')
    if(env.CANDIDATE_WRITES_ENABLED!=='true')fail(503,'Candidate writes are disabled')
    if(request.method==='DELETE') {
      const body=await bodyJson(request)
      if(!body||!Object.hasOwn(body,'expectedUpdatedAt')||!validVersion(body.expectedUpdatedAt)||Object.keys(body).some(key=>key!=='expectedUpdatedAt'))fail(400,'Delete version required')
      await location(env,id,transport,body,true)
      return json({deleted:true,id,buildsTriggered:0})
    }
    const body=await mutationData(await bodyJson(request,262144),id,env)
    if(body.data.redirect_url){
      const current=await location(env,id,transport)
      const result=await routing(id,{...current,...body.data},settings,env,transport)
      if(!result.destination)fail(400,'Redirect target is not public')
    }
    const saved=await location(env,id,transport,body)
    return json({spot:saved,publicPath:`/spot/${settings.fixtures[id]}`,publication:visible(saved)?'live':'withdrawn',buildsTriggered:0})
  }
  const media=url.pathname.match(/^\/media\/candidate\/([1-9]\d*)\/[a-f0-9-]+\.(?:png|jpg|webp|gif)$/)
  const page=url.pathname.match(/^\/(en\/)?spot\/([a-z0-9-]+?)(?:\.(html|txt))?\/?$/)
  const data=url.pathname.match(/^\/api\/candidate\/public\/spots\/([1-9]\d*)$/)
  const legacyData=url.pathname.match(/^\/_next\/data\/[^/]+\/(?:en\/)?spot\/([a-z0-9-]+)\.json$/)
  if(media||page||data||legacyData) {
    if(!['GET','HEAD'].includes(request.method))fail(405,'Method not allowed')
    const raw=media?.[1]||data?.[1]||(page?.[2]||legacyData?.[1]).match(/-(\d+)$/)?.[1]
    const id=checkedId(raw,settings)
    const row=await location(env,id,transport)
    if(!media){
      const result=await routing(id,row,settings,env,transport)
      if(result.destination)return new Response(null,{status:result.status,headers:{...HEADERS,Location:result.destination}})
      if(!result.visible)fail(404,'Spot not found')
    }
    if(!visible(row)) {
      // Only authenticated editor image previews may view unpublished media.
      if(media)await admin(request,env,settings,transport)
      else fail(404,'Spot not found')
    }
    if(media) {
      const referenced=[row.image_url,...(Array.isArray(row.images)?row.images:[])].includes(url.pathname)
      if(visible(row)&&!referenced)await admin(request,env,settings,transport)
      const object=await verifiedMedia(env,url.pathname.slice(1),id,true)
      if(!object)fail(404,'Image not found')
      if(request.method==='HEAD')await object.body.cancel().catch(()=>{})
      return new Response(request.method==='HEAD'?null:object.body,{headers:{...HEADERS,'Content-Type':object.httpMetadata?.contentType||'application/octet-stream'}})
    }
    const canonical=`/${page?.[1]||''}spot/${settings.fixtures[id]}`
    if(page&&(page[2]!==settings.fixtures[id]||page[3]||url.pathname.endsWith('/')))return new Response(null,{status:301,headers:{...HEADERS,Location:canonical}})
    if(data||legacyData)return json({spot:Object.fromEntries(SPOT_FIELDS.filter(field=>field!=='redirect_url'&&field!=='redirect_type').map(field=>[field,row[field]??null]))})
    let englishVersions
    try {englishVersions=JSON.parse(env.CANDIDATE_ENGLISH_VERSIONS||'{}')}catch{fail(503,'Invalid isolated translation versions')}
    const englishCurrent=!!row.updated_at&&englishVersions[id]===row.updated_at
    return new Response(request.method==='HEAD'?null:document(row,settings.fixtures[id],page?.[1]?'en':'zh',englishCurrent),{headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP,...(row.updated_at?{'X-JnQ-Publication-Version':row.updated_at}:{})}})
  }
  if(url.pathname.startsWith('/api/'))fail(404,'Candidate endpoint not found')
  return env.ASSETS.fetch(request)
}
export function createWorker(transport=(...args)=>globalThis.fetch(...args)) {
  return {async fetch(request,env) {
    try {
      const response=await responseFor(request,env,transport)
      // _headers does not apply to Function responses: set preview protection here.
      const safe=new Response(response.body,response)
      for(const [key,value] of Object.entries(HEADERS))safe.headers.set(key,value)
      safe.headers.set('Content-Security-Policy',CSP)
      return safe
    } catch(error) {
      return json({error:error instanceof Failure?error.message:'Candidate service unavailable'},error instanceof Failure?error.status:503)
    }
  }}
}
const worker=createWorker()
export default worker
