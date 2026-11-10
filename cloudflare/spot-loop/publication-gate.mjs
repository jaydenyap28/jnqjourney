// Isolated publication gate. Reuses the verified renderer and byte gate.
import {document,integrationImage} from './worker.mjs'
import {publishedSpot,SPOT_FIELDS} from './spot-contract.mjs'
import {legacyPath} from './legacy-media-preview.mjs'

export const PUBLIC_SPOT_FIELDS=SPOT_FIELDS.filter(field=>!['review_jayden','review_qing','is_visited','created_at'].includes(field))
export const GATE_ORIGIN='https://codex-p0-publication-gate.jnqjourney-spot-loop-migration-candidate.pages.dev'
export const FAULT_ORIGIN='https://codex-p0-source-fault.jnqjourney-spot-loop-migration-candidate.pages.dev'
const SOURCE='https://rnamstwwbzknwbjwdgrf.supabase.co'
const FIXTURES=[92005,92017]
const HEADERS={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const canonical=id=>'/spot/cloudflare-loop-registry-'+id
class SourceUnavailable extends Error {}

async function publicRows(env,ids,transport){
  const endpoint=env.P0_SOURCE_FAULT==='true'?'jnq_public_spots_unavailable_test':'jnq_public_spots'
  let response,rows
  try{
    response=await transport(SOURCE+'/rest/v1/rpc/'+endpoint,{
      method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_ids:ids}),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000),
    })
    if(!response.ok){await response.body?.cancel();throw new SourceUnavailable()}
    rows=await response.json()
  }catch{throw new SourceUnavailable()}
  if(!Array.isArray(rows)||rows.length>ids.length||new Set(rows.map(row=>row.id)).size!==rows.length||
    rows.some(row=>!ids.includes(row.id)||!publishedSpot(row)||PUBLIC_SPOT_FIELDS.some(field=>!Object.hasOwn(row,field))||
      Object.keys(row).some(field=>!PUBLIC_SPOT_FIELDS.includes(field))))throw new SourceUnavailable()
  return rows
}

export function createPublicationGate(transport=(...args)=>fetch(...args)){
  return {
    async fetch(request,env){
      const marker=request.headers.get('X-JnQ-Acceptance')
      const counts={r2:{list:0,get:0,head:0,put:0,delete:0},supabaseRpc:0,supabaseRead:0,auth:0,copy:0}
      const source=(url,init)=>{counts.supabaseRpc++;return transport(url,init)}
      const bucket={}
      for(const method of ['get','head'])bucket[method]=(...args)=>{counts.r2[method]++;return env.TEST_MEDIA[method](...args)}
      const notFound=()=>new Response('Not Found',{status:404,headers:HEADERS})
      try{
        const url=new URL(request.url)
        const origin=env.P0_SOURCE_FAULT==='true'?FAULT_ORIGIN:GATE_ORIGIN
        if(url.origin!==origin||!['GET','HEAD'].includes(request.method))return notFound()
        if(env.SUPABASE_URL!==SOURCE||!env.SUPABASE_SERVICE_ROLE_KEY||!env.TEST_MEDIA||
          !Number.isSafeInteger(Number(env.P0_EXPIRES_AT))||Date.now()>=Number(env.P0_EXPIRES_AT)*1000||
          !/^media\/candidate\/92005\/[a-f0-9-]{36}\.webp$/.test(env.P0_MEDIA_KEY||''))throw new SourceUnavailable()
        if(url.pathname==='/candidate.css')return env.ASSETS.fetch(request)
        if(url.search)return notFound()
        if(['/', '/spot', '/api/locations'].includes(url.pathname)){
          const rows=await publicRows(env,FIXTURES,source)
          if(url.pathname==='/api/locations')return Response.json({locations:rows},{headers:HEADERS})
          const body='<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>隔离发布门控</title><h1>隔离景点</h1>'+rows.map(row=>`<article><a href="${canonical(row.id)}">${escape(row.name)}</a></article>`).join('')+'</html>'
          return new Response(request.method==='HEAD'?null:body,{headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8'}})
        }
        const media=url.pathname===legacyPath||url.pathname==='/'+env.P0_MEDIA_KEY
        const detail=url.pathname.match(/^\/(en\/)?spot\/(cloudflare-loop-registry-920(?:05|17)|spot-920(?:05|17))$/)
        const api=url.pathname.match(/^\/api\/(spots|spot-routing)\/(cloudflare-loop-registry-920(?:05|17)|spot-920(?:05|17))$/)
        if(!media&&!detail&&!api)return notFound()
        const id=media?92005:Number((detail?.[2]||api?.[2]).match(/-(\d+)$/)[1])
        const [row]=await publicRows(env,[id],source)
        if(!row)return notFound()
        if(media){
          const path='/'+env.P0_MEDIA_KEY
          if(row.image_url!==path&&!row.images?.includes(path))return notFound()
          return await integrationImage(request,{...env,TEST_MEDIA:bucket},null,String(id),env.P0_MEDIA_KEY,source)
        }
        const prefix=detail?.[1]?'en/':''
        const slug=detail?.[2]||api?.[2]
        if(slug!=='cloudflare-loop-registry-'+id)return new Response(null,{status:301,headers:{...HEADERS,Location:'/'+prefix+'spot/cloudflare-loop-registry-'+id}})
        if(row.redirect_url)throw new SourceUnavailable()
        if(api)return Response.json(api[1]==='spot-routing'?{visible:true,canonical:canonical(id)}:{spot:row},{headers:HEADERS})
        return new Response(request.method==='HEAD'?null:document(row,slug,prefix?'en':'zh'),{headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8'}})
      }catch(error){
        if(error?.status===404)return notFound()
        return new Response('Publication source unavailable',{status:503,headers:{...HEADERS,'Retry-After':'30'}})
      }finally{
        if(/^[0-9-]+$/.test(marker||''))console.log(JSON.stringify({type:'jnq-registry-native-operations',acceptanceId:marker,...counts}))
      }
    },
  }
}
export default createPublicationGate()
