// SigV4 canonicalization reused from the accepted Spot presigned PUT pilot.
// No browser has final-object write authority. No credential or URL logging.
import { FormalError } from './formal-runtime.mjs'
export const MEDIA_MAX = 10 * 1024 * 1024
export const MEDIA_MIME = { png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif' }
const host='41feff7cd62964f2eb33bb82508509a1.r2.cloudflarestorage.com',bucket='jnqjourney-admin-private-media'
const enc=s=>new TextEncoder().encode(s),hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('')
export const mediaSha=async b=>hex(await crypto.subtle.digest('SHA-256',typeof b==='string'?enc(b):b))
const aws=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())
const keyPattern=/^_admin-formal-drafts\/(?:[a-f0-9]{64}|_staging\/[a-f0-9-]{36})\.(png|jpg|webp|gif)$/
async function hmac(key,value){const k=await crypto.subtle.importKey('raw',typeof key==='string'?enc(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',k,enc(value))}
export function imageSignature(b,type){if(b.length<12)return false;const s=String.fromCharCode(...b.subarray(0,12));return type==='image/png'?b.subarray(0,8).join(',')==='137,80,78,71,13,10,26,10':type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:type==='image/gif'?/^GIF8[79]a/.test(s):type==='image/webp'&&s.startsWith('RIFF')&&s.slice(8,12)==='WEBP'}
export function createFormalR2(env,fetcher=fetch){
 async function signed(method,key,headers={},query={},now=new Date(),targetBucket=bucket){
  const access=env('FORMAL_R2_ACCESS_KEY_ID'),secret=env('FORMAL_R2_SECRET_ACCESS_KEY')
  if(!access||!secret)throw new FormalError(503,'FORMAL_R2_SECRET_MISSING')
  const date=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),scope=`${day}/auto/s3/aws4_request`
  const path='/'+targetBucket+(key?'/'+key.split('/').map(aws).join('/'):'')
  const presigned=Object.keys(query).length>0
  const digest=presigned?'UNSIGNED-PAYLOAD':await mediaSha('')
  headers={...headers,host,...(presigned?{}:{'x-amz-content-sha256':digest,'x-amz-date':date})}
  const names=Object.keys(headers).sort(),list=names.join(';')
  if(presigned)query={...query,'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Content-Sha256':digest,'X-Amz-Credential':access+'/'+scope,'X-Amz-Date':date,'X-Amz-SignedHeaders':list}
  const q=Object.keys(query).sort().map(n=>aws(n)+'='+aws(query[n])).join('&')
  const canonical=[method,path,q,names.map(n=>`${n}:${String(headers[n]).trim()}\n`).join(''),list,digest].join('\n')
  let k=await hmac('AWS4'+secret,day);for(const p of ['auto','s3','aws4_request'])k=await hmac(k,p)
  const signature=hex(await hmac(k,`AWS4-HMAC-SHA256\n${date}\n${scope}\n${await mediaSha(canonical)}`))
  if(!presigned)headers.authorization=`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${list}, Signature=${signature}`
  delete headers.host
  return {url:'https://'+host+path+(presigned?'?'+q+'&X-Amz-Signature='+signature:''),headers}
 }
 async function request(method,key,headers={}){
  if(!keyPattern.test(key)||!['GET','HEAD','PUT'].includes(method))throw new FormalError(400,'FORMAL_R2_SCOPE_INVALID')
  const s=await signed(method,key,headers)
  try{return await fetcher(s.url,{method,headers:s.headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)})}catch{throw new FormalError(503,'FORMAL_R2_REQUEST_UNCONFIRMED')}
 }
 async function head(key){const r=await request('HEAD',key);if(r.status===404)return null
  const size=Number(r.headers.get('content-length')),type=r.headers.get('content-type')?.split(';')[0],etag=r.headers.get('etag')
  if(!r.ok||!Number.isSafeInteger(size)||size<12||size>MEDIA_MAX||!Object.values(MEDIA_MIME).includes(type)||!/^"?[a-f0-9]{32}"?$/i.test(etag||''))throw new FormalError(409,'FORMAL_R2_OBJECT_IDENTITY_INVALID')
  return {size,type,etag}
 }
 async function get(key,proof){
  const r=await request('GET',key),size=Number(r.headers.get('content-length')),type=r.headers.get('content-type')?.split(';')[0],etag=r.headers.get('etag')
  if(!r.ok||size!==proof.size||size<12||size>MEDIA_MAX||type!==proof.type){await r.body?.cancel();throw new FormalError(409,'FORMAL_R2_SIZE_OR_MIME_MISMATCH')}
  const reader=r.body.getReader(),chunks=[];let count=0
  for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>size){await reader.cancel();throw new FormalError(413,'FORMAL_R2_BODY_LIMIT')};chunks.push(value)}
  const bytes=new Uint8Array(count);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length}
  if(count!==size||await mediaSha(bytes)!==proof.sha256||!imageSignature(bytes,type))throw new FormalError(415,'FORMAL_R2_BYTES_SIGNATURE_OR_SHA_MISMATCH')
  return {bytes,size,type,etag}
 }
 async function presign(key,type,size,now=new Date()){
  if(!/^_admin-formal-drafts\/_staging\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(key)||!Object.values(MEDIA_MIME).includes(type)||!Number.isSafeInteger(size)||size<12||size>MEDIA_MAX)throw new FormalError(400,'FORMAL_UPLOAD_CAPABILITY_INVALID')
  const s=await signed('PUT',key,{'content-type':type,'content-length':String(size),'if-none-match':'*'},{'X-Amz-Expires':'120'},now)
  return {putUrl:s.url,headers:{'Content-Type':type,'If-None-Match':'*'},expiresIn:120}
 }
 async function copy(staging,key,etag){const r=await request('PUT',key,{'x-amz-copy-source':'/'+bucket+'/'+staging,'x-amz-copy-source-if-match':etag})
  const body=await r.text();if(!r.ok||/<Error[>\s]/.test(body))throw new FormalError(503,'FORMAL_R2_COPY_UNCONFIRMED')
 }
 async function probeScope(){
  // Metadata-only denial check. Never enumerate/read/modify original media.
  const signedOld=await signed('HEAD','',{}, {},new Date(),'jnqjourney-img')
  const r=await fetcher(signedOld.url,{method:'HEAD',headers:signedOld.headers,redirect:'error',signal:AbortSignal.timeout(15000)})
  if(r.status!==403)throw new FormalError(503,'FORMAL_R2_TOKEN_SCOPE_NOT_CONFIRMED')
  return {otherBucketDenied:403}
 }
 return {head,get,presign,copy,probeScope}
}
