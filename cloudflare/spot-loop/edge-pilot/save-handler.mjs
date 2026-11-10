import {signBridge} from '../identity-bridge/auth.mjs'
import {SPOT_FIELDS,validateSpotFields,validVersion,validSpotRow} from '../spot-contract.mjs'
const ORIGIN='https://rnamstwwbzknwbjwdgrf.supabase.co'
const BROWSER='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const INTEGRATION='https://codex-spot-media-integration.jnqjourney-spot-loop-migration-candidate.pages.dev'
const BRIDGE='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev/internal/r2-identity'
const KEY=/^media\/candidate\/(92005|92017|92030)\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(png|jpg|webp|gif)$/
const MIME={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'}
class Refused extends Error {constructor(status,code){super(code);this.status=status}}
const fail=(status,code)=>{throw new Refused(status,code)}
async function readBody(request){
  const length=request.headers.get('content-length')
  if(length&&(!/^\d+$/.test(length)||Number(length)>262144))fail(413,'BODY_TOO_LARGE')
  const reader=request.body?.getReader()
  if(!reader)fail(400,'BODY_REQUIRED')
  const chunks=[];let size=0
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();fail(413,'BODY_TOO_LARGE')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail(400,'INVALID_JSON')}
}
export function createSaveHandler({config,env,transport=fetch}){
  const origin=config.browserIntegration?INTEGRATION:BROWSER
  return async request=>{
    const started=performance.now(),counts={auth:0,locations:0,registryRpc:0,bridge:0}
    let bridgeOperations=null,sqlstate=null
    const headers={'Cache-Control':'private, no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Vary':'Origin',...(!config.browserIntegration?{'Access-Control-Allow-Origin':origin}:{})}
    const respond=(data,status=200)=>Response.json({...data,counts,bridgeOperations,sqlstate,serverElapsedMs:Math.round(performance.now()-started),cpuMs:'UNKNOWN'},{status,headers})
    async function remote(url,options){
      const response=await transport(url,{...options,redirect:'manual',signal:AbortSignal.timeout(10000)})
      if(response.status>=300&&response.status<400)fail(503,'UPSTREAM_REDIRECT_REFUSED')
      return response
    }
    function serviceHeaders(){const key=env('SUPABASE_SERVICE_ROLE_KEY');if(!key)fail(503,'SERVICE_SECRET_MISSING');return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'}}
    async function rpc(name,args){
      counts.registryRpc++
      const response=await remote(ORIGIN+'/rest/v1/rpc/jnq_media_'+name,{method:'POST',headers:serviceHeaders(),body:JSON.stringify(args)})
      const data=await response.json()
      if(!response.ok){
        sqlstate=/^(PT(?:400|404|409|503)|23503)$/.test(data?.code??'')?data.code:null
        const status=sqlstate==='23503'?409:sqlstate?Number(sqlstate.slice(2)):503
        fail(status,sqlstate==='23503'?'FOREIGN_KEY_TRANSACTION_REJECTED':sqlstate||'REGISTRY_UNAVAILABLE')
      }
      return data
    }
    async function snapshot(id,keys,marker){
      if(!keys.length)return []
      if(keys.length>30||keys.some(key=>KEY.exec(key)?.[1]!==String(id)))fail(400,'MEDIA_SCOPE_REFUSED')
      const secret=env('CANDIDATE_IDENTITY_BRIDGE_KEY')||''
      if(!/^[A-Za-z0-9_-]{43}$/.test(secret))fail(503,'BRIDGE_SECRET_MISSING')
      const body=JSON.stringify({spotId:id,keys}),signed=await signBridge(secret,BRIDGE,body,marker)
      counts.bridge++
      const response=await remote(BRIDGE,{method:'POST',headers:signed,body})
      const data=await response.json()
      if(data.operations&&['list','head','get'].every(k=>Number.isSafeInteger(data.operations[k])&&data.operations[k]>=0))bridgeOperations=data.operations
      if(!response.ok)fail(response.status===409?409:503,'BRIDGE_'+(response.status===409?'IDENTITY_UNAVAILABLE':'UNAVAILABLE'))
      if(data.nonce!==signed['X-JnQ-Bridge-Nonce']||data.acceptanceId!==marker||data.spotId!==id||!Array.isArray(data.identities)||data.identities.length!==keys.length||!bridgeOperations||bridgeOperations.list!==2||bridgeOperations.head>8||bridgeOperations.get!==0)fail(503,'BRIDGE_RESPONSE_INVALID')
      if(data.identities.some((item,i)=>item.key!==keys[i]||!Number.isSafeInteger(item.size)||item.size<12||item.size>10485760||!Number.isSafeInteger(item.receipt_size)||item.receipt_size<1||item.receipt_size>1024||item.mime!==MIME[KEY.exec(keys[i])?.[2]]||![item.etag,item.version,item.receipt_etag,item.receipt_version].every(v=>typeof v==='string'&&v.length>0&&v!=='null')))fail(409,'MEDIA_IDENTITY_INVALID')
      return data.identities
    }
    try{
      if(env('SUPABASE_URL')!==ORIGIN||Date.now()>=config.expiresAt*1000)fail(503,'PILOT_EXPIRED_OR_MISCONFIGURED')
      if(request.headers.get('Origin')!==origin)fail(403,'ORIGIN_REFUSED')
      if(request.method==='OPTIONS'&&!config.browserIntegration)return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-jnq-acceptance','Access-Control-Allow-Methods':'POST'}})
      if(request.method!=='POST'||request.headers.get('content-type')!=='application/json')fail(405,'METHOD_REFUSED')
      const marker=request.headers.get('X-JnQ-Acceptance')||''
      if(!/^[0-9-]{1,40}$/.test(marker))fail(400,'MARKER_REQUIRED')
      let body=await readBody(request)
      if(config.browserIntegration){
        const fixture=request.headers.get('X-JnQ-Spot')
        if(!['92017','92030'].includes(fixture)||!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>!['expectedUpdatedAt','data'].includes(key)))fail(400,'PAYLOAD_REFUSED')
        const action=body.data?.publication_status==='hidden'&&Object.keys(body.data).length===1?'withdraw':'save'
        body=action==='withdraw'?{action,id:Number(fixture),expectedUpdatedAt:body.expectedUpdatedAt}:{...body,action,id:Number(fixture)}
      }
      const id=body?.id
      if(![92005,92017,92030].includes(id))fail(400,'FIXTURE_REFUSED')
      const allowed={save:['action','id','expectedUpdatedAt','data'],withdraw:['action','id','expectedUpdatedAt'],revoke:['action','id','key'],media:['action','id','key']}[body.action]
      if(!allowed||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'PAYLOAD_REFUSED')
      if(body.action!=='media'){
        const authorization=request.headers.get('Authorization')||''
        if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))fail(401,'SIGN_IN_REQUIRED')
        counts.auth++
        const userResponse=await remote(ORIGIN+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:authorization}})
        if(!userResponse.ok)fail(401,'INVALID_SESSION')
        const user=await userResponse.json()
        if(!user.email_confirmed_at||user.id!==config.adminId||String(user.email).toLowerCase()!==config.adminEmail||user.role!=='authenticated')fail(403,'ADMIN_REQUIRED')
      }
      if(body.action==='media'||body.action==='revoke'){
        if(KEY.exec(body.key??'')?.[1]!==String(id))fail(400,'MEDIA_SCOPE_REFUSED')
        if(body.action==='revoke'){
          if(await rpc('revoke',{p_spot:id,p_key:body.key})!==true)fail(503,'REVOKE_UNCONFIRMED')
          return respond({revoked:true})
        }
        const expected=await rpc('lookup',{p_spot:id,p_key:body.key})
        if(!expected||expected.publiclyReferenced!==true)fail(404,'MEDIA_NOT_PUBLIC')
        const [identity]=await snapshot(id,[body.key],marker)
        const pairs=[['key','key'],['size','size'],['mime','mime'],['etag','etag'],['version','version'],['receipt_size','receiptSize'],['receipt_etag','receiptEtag'],['receipt_version','receiptVersion']]
        if(pairs.some(([a,b])=>identity[a]!==expected[b]))fail(404,'MEDIA_IDENTITY_CHANGED')
        return respond({public:true})
      }
      if(!Object.hasOwn(body,'expectedUpdatedAt')||!validVersion(body.expectedUpdatedAt))fail(400,'VERSION_REQUIRED')
      if(body.action==='withdraw')return respond({spot:await rpc('withdraw',{p_spot:id,p_expected_updated_at:body.expectedUpdatedAt})})
      try{validateSpotFields(body.data)}catch{fail(400,'FIELDS_INVALID')}
      // Redirect adaptation belongs to a separate integration contract.
      if(body.data.redirect_url)fail(400,'REDIRECT_OUTSIDE_SAVE_PILOT')
      counts.locations++
      const response=await remote(ORIGIN+'/rest/v1/locations?id=eq.'+id+'&select='+SPOT_FIELDS.join(','),{headers:serviceHeaders()})
      const rows=await response.json()
      if(!response.ok||!Array.isArray(rows)||rows.length!==1||!validSpotRow(rows[0],id))fail(503,'SPOT_SOURCE_INVALID')
      if(rows[0].redirect_url)fail(400,'REDIRECT_OUTSIDE_SAVE_PILOT')
      const effective={...rows[0],...body.data}
      const paths=[...new Set([effective.image_url,...(effective.images??[])].filter(Boolean))]
      if(paths.some(path=>typeof path!=='string'||!path.startsWith('/')))fail(400,'MEDIA_SCOPE_REFUSED')
      const observed=await snapshot(id,paths.map(path=>path.slice(1)),marker)
      const saved=await rpc('save',{p_spot:id,p_expected_updated_at:body.expectedUpdatedAt,p_patch:body.data,p_observed:observed})
      if(!validSpotRow(saved,id)||SPOT_FIELDS.some(field=>!Object.hasOwn(saved,field)))fail(503,'SAVE_RESULT_INVALID')
      return respond({spot:saved})
    }catch(error){return respond({error:error instanceof Refused?error.message:'PILOT_UNAVAILABLE'},error instanceof Refused?error.status:503)}
  }
}
