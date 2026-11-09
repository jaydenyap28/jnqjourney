// Single isolated pilot. Stage one has no SQL or R2 mutation path.
import config from './pilot-config.json' with {type:'json'}

const PROJECT='rnamstwwbzknwbjwdgrf'
const ORIGIN=`https://${PROJECT}.supabase.co`
const ACCOUNT='41feff7cd62964f2eb33bb82508509a1'
const BUCKET='jnqjourney-spot-loop-isolated-media'
const BROWSER_ORIGIN='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const FIXTURE=92005
class Rejected extends Error {
  constructor(public status:number,public code:string){super(code)}
}
const reject=(status:number,code:string):never=>{throw new Rejected(status,code)}
const encode=(value:string)=>new TextEncoder().encode(value)
const hex=(value:ArrayBuffer)=>Array.from(new Uint8Array(value),v=>v.toString(16).padStart(2,'0')).join('')
const awsEncode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`)
async function hmac(key:string|ArrayBuffer,value:string){
  const imported=await crypto.subtle.importKey('raw',typeof key==='string'?encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return crypto.subtle.sign('HMAC',imported,encode(value))
}
async function upstream(url:string,init:RequestInit){
  const response=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(10000)})
  if(response.status>=300&&response.status<400)reject(503,'UPSTREAM_REDIRECT_REFUSED')
  return response
}
function secret(name:string){const value=Deno.env.get(name);if(!value)reject(503,'PILOT_SECRET_MISSING');return value}
async function admin(request:Request){
  const authorization=request.headers.get('Authorization')||''
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))reject(401,'SIGN_IN_REQUIRED')
  const response=await upstream(ORIGIN+'/auth/v1/user',{headers:{apikey:secret('SUPABASE_ANON_KEY'),Authorization:authorization}})
  if(!response.ok)reject(401,'INVALID_SESSION')
  const user=await response.json()
  if(!user.email_confirmed_at||user.role!=='authenticated'||user.id!==config.adminId||String(user.email).toLowerCase()!==config.adminEmail)reject(403,'ADMIN_REQUIRED')
}
async function rpcLookup(key:string){
  const service=secret('SUPABASE_SERVICE_ROLE_KEY')
  const response=await upstream(ORIGIN+'/rest/v1/rpc/jnq_media_lookup',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_spot:FIXTURE,p_key:key})})
  if(!response.ok)reject(503,'REGISTRY_LOOKUP_FAILED')
  const data=await response.json()
  if(!data||data.key!==key)reject(409,'MEDIA_NOT_REGISTERED')
  return data
}
async function s3(method:'HEAD'|'GET',key:string,range?:string){
  const access=secret('CANDIDATE_R2_ACCESS_KEY_ID'),privateKey=secret('CANDIDATE_R2_SECRET_ACCESS_KEY')
  const host=`${ACCOUNT}.r2.cloudflarestorage.com`,path=`/${BUCKET}/${key.split('/').map(awsEncode).join('/')}`
  const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8)
  const payload=hex(await crypto.subtle.digest('SHA-256',encode('')))
  const names='host;x-amz-content-sha256;x-amz-date',scope=`${day}/auto/s3/aws4_request`
  const canonical=[method,path,'',`host:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n`,names,payload].join('\n')
  let signing=await hmac('AWS4'+privateKey,day)
  for(const part of ['auto','s3','aws4_request'])signing=await hmac(signing,part)
  const signature=hex(await hmac(signing,`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hex(await crypto.subtle.digest('SHA-256',encode(canonical)))}`))
  return upstream(`https://${host}${path}`,{method,headers:{'x-amz-date':date,'x-amz-content-sha256':payload,
    Authorization:`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${names}, Signature=${signature}`,...(range?{Range:range}:{})}})
}
function identity(response:Response){
  const length=response.headers.get('content-length')
  const etag=response.headers.get('etag')
  // Only representation syntax is normalized. An absent or null version fails.
  return {status:response.status,size:length&&/^\d+$/.test(length)?Number(length):null,
    etag:etag?.replace(/^W\//,'').replace(/^"|"$/g,'')??null,
    version:response.headers.get('x-amz-version-id'),mime:response.headers.get('content-type')?.split(';')[0]??null}
}
async function inspect(key:string){
  const expected=await rpcLookup(key)
  const receipt='_candidate-validation/'+key.slice('media/candidate/'.length)+'.json'
  const [finalResponse,receiptResponse]=await Promise.all([s3('HEAD',key),s3('HEAD',receipt)])
  const final=identity(finalResponse),proof=identity(receiptResponse)
  const comparisons={
    finalStatus:final.status===200,receiptStatus:proof.status===200,
    finalSize:final.size===expected.size,finalEtag:final.etag===expected.etag,
    finalVersion:!!final.version&&final.version!=='null'&&final.version===expected.version,
    finalMime:final.mime===expected.mime,
    receiptSize:proof.size===expected.receiptSize,receiptEtag:proof.etag===expected.receiptEtag,
    receiptVersion:!!proof.version&&proof.version!=='null'&&proof.version===expected.receiptVersion,
    receiptMime:proof.mime==='application/json',
  }
  const result={final,receipt:proof,expected:{size:expected.size,etag:expected.etag,version:expected.version,mime:expected.mime,
    receiptSize:expected.receiptSize,receiptEtag:expected.receiptEtag,receiptVersion:expected.receiptVersion},comparisons,
    verdict:Object.values(comparisons).every(Boolean)?'S3_IDENTITY_PASS':'S3_IDENTITY_NO_GO',s3Requests:2,registryRpc:1}
  if(result.verdict==='S3_IDENTITY_NO_GO')return result
  const [bytesResponse,proofResponse]=await Promise.all([s3('GET',key,'bytes=0-11'),s3('GET',receipt)])
  const bytesIdentity=identity(bytesResponse),proofIdentity=identity(proofResponse)
  const sample=new Uint8Array(await bytesResponse.arrayBuffer())
  const receiptBytes=await proofResponse.text()
  let body
  try{body=JSON.parse(receiptBytes)}catch{reject(409,'RECEIPT_INVALID')}
  const valid=bytesResponse.status===206&&sample.length===12&&sample.subarray(0,8).join(',')==='137,80,78,71,13,10,26,10'&&
    bytesIdentity.version===expected.version&&bytesIdentity.etag===expected.etag&&proofResponse.status===200&&
    proofIdentity.version===expected.receiptVersion&&proofIdentity.etag===expected.receiptEtag&&
    encode(receiptBytes).length===expected.receiptSize&&body.schemaVersion===1&&body.key===key&&body.fixtureId===String(FIXTURE)&&
    body.size===expected.size&&body.etag===expected.etag&&body.version===expected.version&&body.contentType===expected.mime&&body.signatureChecked===true
  return {...result,getReadbackMatched:valid,verdict:valid?'S3_IDENTITY_PASS':'S3_IDENTITY_NO_GO',s3Requests:4}
}
Deno.serve(async(request:Request)=>{
  const started=performance.now()
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':BROWSER_ORIGIN,'Vary':'Origin'}
  try{
    if(Deno.env.get('SUPABASE_URL')!==ORIGIN)reject(503,'ISOLATED_PROJECT_REQUIRED')
    if(request.headers.get('Origin')!==BROWSER_ORIGIN)reject(403,'ORIGIN_REFUSED')
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST'}})
    if(request.method!=='POST')reject(405,'METHOD_REFUSED')
    await admin(request)
    const raw=await request.text()
    if(encode(raw).length>2048)reject(413,'BODY_TOO_LARGE')
    let body
    try{body=JSON.parse(raw)}catch{reject(400,'INVALID_JSON')}
    if(body?.action!=='identity'||Object.keys(body).some(k=>!['action','key'].includes(k))||typeof body.key!=='string'||!/^media\/candidate\/92005\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.png$/.test(body.key))reject(400,'IDENTITY_PROBE_REQUIRED')
    const result=await inspect(body.key)
    return Response.json({...result,serverElapsedMs:Math.round(performance.now()-started),cpuMs:'UNKNOWN'},{status:result.verdict==='S3_IDENTITY_PASS'?200:409,headers})
  }catch(error){
    return Response.json({error:error instanceof Rejected?error.code:'PILOT_UPSTREAM_UNAVAILABLE',serverElapsedMs:Math.round(performance.now()-started),cpuMs:'UNKNOWN'},{status:error instanceof Rejected?error.status:503,headers})
  }
})
