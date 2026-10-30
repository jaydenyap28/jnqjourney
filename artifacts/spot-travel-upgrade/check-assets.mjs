// Only the seven reviewed Spots. HEAD validates transport status/type, not photo identity.
import fs from 'node:fs/promises'
const bundle = JSON.parse(await fs.readFile('public-data/fallback/2026-10-30.json','utf8'))
const ids=[480,357,375,336,343,364,411]
const assets=new Map()
for(const id of ids) {
  const spot=bundle.spots[id]
  for(const url of [spot.image_url,...(spot.images||[])].filter(Boolean)) {
    if(!assets.has(url))assets.set(url,{url,kind:'image',spotIds:[]})
    assets.get(url).spotIds.push(id)
  }
  for(const url of [spot.video_url,spot.facebook_video_url,...[...String(spot.description||'').matchAll(/https?:\/\/[^\s)]+/g)].map(m=>m[0])].filter(Boolean)) {
    if(!assets.has(url))assets.set(url,{url,kind:'external-link',spotIds:[]})
    assets.get(url).spotIds.push(id)
  }
}
const inputs=[...assets.values()],rows=[];let cursor=0
async function worker(){while(cursor<inputs.length){const asset=inputs[cursor++];try{const r=await fetch(asset.url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(15000)});const type=r.headers.get('content-type')||'';rows.push({...asset,status:r.status,type,result:r.status===404||r.status===410?'confirmed-unavailable':r.ok?(asset.kind==='image'&&!type.startsWith('image/')?'unexpected-content-type':'reachable'):'unverified-provider-response'})}catch(e){rows.push({...asset,result:'unverified-network-error',error:e.message})}}}
await Promise.all([worker(),worker(),worker()])
await fs.writeFile('artifacts/spot-travel-upgrade/asset-check.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:ids,method:'HEAD only; no content/rights/identity acceptance',rows},null,2))
console.log(JSON.stringify({assets:rows.length,counts:rows.reduce((a,x)=>(a[x.result]=(a[x.result]||0)+1,a),{})}))
