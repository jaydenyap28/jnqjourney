// Read-only, single-fixture Edge -> authenticated Cloudflare identity probe.
import config from './pilot-config.json' with {type:'json'}
import {signBridge} from './bridge-auth.mjs'
const ORIGIN='https://rnamstwwbzknwbjwdgrf.supabase.co'
const BROWSER='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const BRIDGE='https://codex-r2-identity-bridge.jnqjourney-spot-loop-migration-candidate.pages.dev/internal/r2-identity'
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':BROWSER,'Vary':'Origin'}
Deno.serve(async(request:Request)=>{
  const started=performance.now()
  try{
    if(Deno.env.get('SUPABASE_URL')!==ORIGIN||Date.now()>=config.expiresAt*1000)return Response.json({error:'PILOT_EXPIRED_OR_MISCONFIGURED'},{status:503,headers})
    if(request.method!=='POST'||request.headers.get('Origin')!==BROWSER)return Response.json({error:'PILOT_REQUEST_REFUSED'},{status:403,headers})
    const authorization=request.headers.get('Authorization')||''
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))return Response.json({error:'SIGN_IN_REQUIRED'},{status:401,headers})
    const userResponse=await fetch(ORIGIN+'/auth/v1/user',{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:authorization},redirect:'manual',signal:AbortSignal.timeout(8000)})
    if(!userResponse.ok)return Response.json({error:'INVALID_SESSION'},{status:401,headers})
    const user=await userResponse.json()
    if(!user.email_confirmed_at||user.id!==config.adminId||String(user.email).toLowerCase()!==config.adminEmail||user.role!=='authenticated')return Response.json({error:'ADMIN_REQUIRED'},{status:403,headers})
    const marker=request.headers.get('X-JnQ-Acceptance')||''
    if(!/^[0-9-]{1,40}$/.test(marker))return Response.json({error:'MARKER_REQUIRED'},{status:400,headers})
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const lookup=await fetch(ORIGIN+'/rest/v1/rpc/jnq_media_lookup',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_spot:92005,p_key:config.key}),redirect:'manual',signal:AbortSignal.timeout(8000)})
    if(!lookup.ok)return Response.json({error:'LOOKUP_UNAVAILABLE'},{status:503,headers})
    const expected=await lookup.json()
    if(!expected||expected.key!==config.key)return Response.json({error:'REGISTERED_MEDIA_REQUIRED'},{status:409,headers})
    const secret=Deno.env.get('CANDIDATE_IDENTITY_BRIDGE_KEY')||''
    if(!/^[A-Za-z0-9_-]{43}$/.test(secret))return Response.json({error:'BRIDGE_KEY_REQUIRED'},{status:503,headers})
    const body=JSON.stringify({key:config.key})
    const signed=await signBridge(secret,BRIDGE,body,marker)
    const response=await fetch(BRIDGE,{method:'POST',headers:signed,body,redirect:'manual',signal:AbortSignal.timeout(10000)})
    if(!response.ok)return Response.json({error:'BRIDGE_UPSTREAM_REJECTED',bridgeStatus:response.status},{status:503,headers})
    const result=await response.json(),identity=result.identity
    if(result.acceptanceId!==marker||result.nonce!==signed['X-JnQ-Bridge-Nonce']||result.headOperations!==2||result.listOperations!==0||!identity)return Response.json({error:'BRIDGE_RESPONSE_INVALID'},{status:503,headers})
    const pairs=[['key','key'],['size','size'],['mime','mime'],['etag','etag'],['version','version'],['receipt_size','receiptSize'],['receipt_etag','receiptEtag'],['receipt_version','receiptVersion']]
    const matches=Object.fromEntries(pairs.map(([observed,registered])=>[observed,identity[observed]===expected[registered]]))
    const pass=Object.values(matches).every(Boolean)
    return Response.json({verdict:pass?'BRIDGE_IDENTITY_MATCH':'BRIDGE_IDENTITY_MISMATCH',identity,matches,acceptanceId:marker,bridgeRequests:1,registryLookup:1,serverElapsedMs:Math.round(performance.now()-started),cpuMs:'UNKNOWN'},{status:pass?200:409,headers})
  }catch{return Response.json({error:'PILOT_UNAVAILABLE'},{status:503,headers})}
})
