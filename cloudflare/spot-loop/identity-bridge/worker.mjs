import {mediaIdentity} from '../media-identity.mjs'
import {bridgeKey,bridgeMacInput,BRIDGE_PATH} from './auth.mjs'
const FIXTURE='92005'
const HOST='codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev'
const HEADERS={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Content-Type':'application/json','X-Content-Type-Options':'nosniff'}
class Denied extends Error {constructor(status,code){super(code);this.status=status}}
const fail=(status,code)=>{throw new Denied(status,code)}
async function limitedText(request){
  const length=request.headers.get('content-length')
  if(length&&(!/^\d+$/.test(length)||Number(length)>2048))fail(413,'BODY_TOO_LARGE')
  const reader=request.body?.getReader()
  if(!reader)fail(400,'BODY_REQUIRED')
  const bytes=new Uint8Array(2048)
  let size=0
  try{
    while(true){
      const {value,done}=await reader.read()
      if(done)break
      if(size+value.length>bytes.length){await reader.cancel();fail(413,'BODY_TOO_LARGE')}
      bytes.set(value,size);size+=value.length
    }
  }finally{reader.releaseLock()}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size))}catch{fail(400,'INVALID_ENCODING')}
}
export default {async fetch(request,env){
  try{
    const url=new URL(request.url)
    if(env.BRIDGE_PROJECT_REF!=='rnamstwwbzknwbjwdgrf'||env.BRIDGE_BUCKET!=='jnqjourney-spot-loop-isolated-media'||env.BRIDGE_FIXTURE!==FIXTURE||!env.TEST_MEDIA)fail(503,'ISOLATED_BINDING_REQUIRED')
    if(url.protocol!=='https:'||url.hostname!==HOST||url.pathname!==BRIDGE_PATH||url.search||request.method!=='POST')fail(404,'ROUTE_REFUSED')
    if(request.headers.has('Origin')||request.headers.has('Cookie'))fail(403,'SERVER_ONLY')
    const secret=env.CANDIDATE_IDENTITY_BRIDGE_KEY
    const expires=Number(env.BRIDGE_EXPIRES_AT)
    const now=Math.floor(Date.now()/1000)
    if(!/^[A-Za-z0-9_-]{43}$/.test(secret||'')||!Number.isSafeInteger(expires)||now>=expires)fail(503,'BRIDGE_EXPIRED_OR_UNCONFIGURED')
    const timestamp=request.headers.get('X-JnQ-Bridge-Time'),nonce=request.headers.get('X-JnQ-Bridge-Nonce'),signature=request.headers.get('X-JnQ-Bridge-Signature'),marker=request.headers.get('X-JnQ-Acceptance')
    if(!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp))>30||!/^[a-f0-9-]{36}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(signature||'')||!/^[0-9-]{1,40}$/.test(marker||''))fail(401,'BRIDGE_AUTH_REQUIRED')
    if(request.headers.get('content-type')!=='application/json')fail(415,'JSON_REQUIRED')
    const raw=await limitedText(request)
    const macKey=await bridgeKey(secret,['verify'])
    const valid=await crypto.subtle.verify('HMAC',macKey,Uint8Array.from(signature.match(/../g),v=>parseInt(v,16)),await bridgeMacInput(url.href,raw,timestamp,nonce,marker))
    if(!valid)fail(401,'BRIDGE_SIGNATURE_INVALID')
    let body
    try{body=JSON.parse(raw)}catch{fail(400,'INVALID_JSON')}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||typeof body.key!=='string'||!/^media\/candidate\/92005\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.png$/.test(body.key))fail(400,'FIXTURE_KEY_REFUSED')
    // Reuse the Registry Worker's live object/receipt identity projection.
    // Exactly two HEADs, one key, no LIST, body reads, cursor or fallback.
    const receiptKey='_candidate-validation/'+body.key.slice('media/candidate/'.length)+'.json'
    const [object,receipt]=await Promise.all([env.TEST_MEDIA.head(body.key),env.TEST_MEDIA.head(receiptKey)])
    const identity=mediaIdentity(body.key,object,receipt)
    if(!identity)fail(409,'MEDIA_IDENTITY_UNAVAILABLE')
    return Response.json({identity,nonce,acceptanceId:marker,headOperations:2,listOperations:0},{headers:HEADERS})
  }catch(error){return Response.json({error:error instanceof Denied?error.message:'IDENTITY_BRIDGE_UNAVAILABLE'},{status:error instanceof Denied?error.status:503,headers:HEADERS})}
}}
