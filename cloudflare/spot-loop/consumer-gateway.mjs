// Isolated read adapters only. Never serves stale static HTML or raw snapshots
// for Spot data. The existing byte gate remains the only image implementation.
import {PUBLIC_SPOT_FIELDS} from './publication-gate.mjs'
import {integrationImage} from './worker.mjs'
export const CONSUMER_ORIGIN='https://codex-p0-consumers.jnqjourney-spot-loop-migration-candidate.pages.dev'
const SOURCE='https://rnamstwwbzknwbjwdgrf.supabase.co'
const IDS=[92061,92062]
const HEADERS={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}
const FEEDS=new Set(['regions.json','guides.json','notes.json','guide-trip-costs.json','i18n/en/records.json'])
export function createConsumerGateway(transport=(...args)=>fetch(...args)){
  return {async fetch(request,env){
    const counts={r2:{get:0,head:0,list:0},supabaseRpc:0}
    const marker=request.headers.get('X-JnQ-Acceptance')
    const rpc=async(name,args)=>{
      counts.supabaseRpc++
      const response=await transport(SOURCE+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8000)})
      if(!response.ok){await response.body?.cancel();throw Error('SOURCE_UNAVAILABLE')}
      return response.json()
    }
    try{
      const url=new URL(request.url)
      const reject=()=>new Response('Not Found',{status:404,headers:HEADERS})
      if(url.origin!==CONSUMER_ORIGIN||!['GET','HEAD'].includes(request.method)||url.search)return reject()
      if(env.SUPABASE_URL!==SOURCE||!env.SUPABASE_SERVICE_ROLE_KEY||!env.TEST_MEDIA||!/^candidate-consumers\/[0-9]{13}\/$/.test(env.CONSUMER_FEED_PREFIX||'')||!/^\d+$/.test(env.CONSUMER_EXPIRES_AT||'')||Date.now()>=Number(env.CONSUMER_EXPIRES_AT)*1000)throw Error('BOUNDARY')
      const key=url.pathname.startsWith('/public-data/')?url.pathname.slice(13):null
      if(FEEDS.has(key)){
        counts.r2.get++
        const object=await env.TEST_MEDIA.get(env.CONSUMER_FEED_PREFIX+key)
        if(!object||object.size<1||object.size>4194304||object.httpMetadata?.contentType!=='application/json'){
          await object?.body?.cancel();throw Error('FEED_UNAVAILABLE')
        }
        // Only the controlled server preseed writes these private feed keys.
        // Current object GET is authoritative; there is no fallback or cache.
        if(request.method==='HEAD')await object.body.cancel()
        return new Response(request.method==='HEAD'?null:object.body,{headers:{...HEADERS,'Content-Type':'application/json','Content-Length':String(object.size)}})
      }
      const media=url.pathname.match(/^\/media\/candidate\/(92061|92062)\/[a-f0-9-]+\.png$/)
      if(media){
        const bucket={};for(const method of ['get','head'])bucket[method]=(...args)=>{counts.r2[method]++;return env.TEST_MEDIA[method](...args)}
        return await integrationImage(request,{...env,TEST_MEDIA:bucket},null,media[1],url.pathname.slice(1),(url,init)=>{counts.supabaseRpc++;return transport(url,init)})
      }
      if(!['/public-data/spots/records.json','/api/locations'].includes(url.pathname))return reject()
      const rows=await rpc('jnq_public_spots',{p_ids:IDS})
      if(!Array.isArray(rows)||rows.length>IDS.length||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some(row=>!IDS.includes(row.id)||row.status!=='active'||![null,'published'].includes(row.publication_status)||Object.keys(row).some(key=>!PUBLIC_SPOT_FIELDS.includes(key))||PUBLIC_SPOT_FIELDS.some(key=>!Object.hasOwn(row,key))))throw Error('INVALID_PROJECTION')
      return Response.json({locations:rows},{headers:HEADERS})
    }catch(error){return new Response(error?.status===404?'Not Found':'Public source unavailable',{status:error?.status===404?404:503,headers:HEADERS})}
    finally{if(/^[0-9-]+$/.test(marker||''))console.log(JSON.stringify({type:'jnq-registry-native-operations',acceptanceId:marker,...counts}))}
  }}
}
export default createConsumerGateway()
