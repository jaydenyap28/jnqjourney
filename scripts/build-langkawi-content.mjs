import fs from 'node:fs/promises'
import { createHash, createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import env from '@next/env'
import { normalizeUnassignedVisits } from '../lib/guide-unassigned.ts'
import { publicSpotFromSupabaseRow } from '../lib/public-spot.ts'

env.loadEnvConfig(process.cwd())
const required = key => { if (!process.env[key]) throw Error(`Missing ${key}`); return process.env[key] }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n')
const stable = value => hash(bytes(value))
const sb = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession:false, autoRefreshToken:false } })
const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const r2 = new S3Client({ region:'auto', endpoint:`https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials:{accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')} })
const Bucket = required('R2_BUCKET_NAME')
const dir = 'artifacts/langkawi-build'
const slug = 'malaysia-langkawi-5d4n'
const pointer = '_system/guides-latest.webp'
const source = JSON.parse(await fs.readFile('data/langkawi-content-build.json','utf8'))
const apply = process.argv.includes('--apply')
const revalidateOnly = process.argv.includes('--revalidate')
const slugify = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
async function download(key) { const r=await sb.storage.from(bucket).download(key,{cacheNonce:String(Date.now())}); if(r.error)throw Error(r.error.message);return Buffer.from(await r.data.arrayBuffer()) }
async function upload(key, body, upsert=false) { const r=await sb.storage.from(bucket).upload(key,body,{upsert,contentType:'image/webp',cacheControl:'0'});if(r.error)throw Error(r.error.message);if(hash(await download(key))!==hash(body))throw Error(`Storage readback mismatch ${key}`) }
async function object(key) { const r=await r2.send(new GetObjectCommand({Bucket,Key:key})); return {body:Buffer.from(await r.Body.transformToByteArray()),etag:r.ETag} }
async function rows(table) { const r=await sb.from(table).select('*').order('id').range(0,1999);if(r.error)throw Error(r.error.message);if(r.data.length>=1999)throw Error('Audit pagination required');return r.data }
async function put(key, body, etag) { await r2.send(new PutObjectCommand({Bucket,Key:key,Body:body,...(etag?{IfMatch:etag}:{IfNoneMatch:'*'}),ContentType:'application/json; charset=utf-8',CacheControl:'public, max-age=3600, stale-while-revalidate=86400'}));if(hash((await object(key)).body)!==hash(body))throw Error(`R2 readback mismatch ${key}`) }
async function revalidate(result) {
  const calls = []
  for(const spot of result.spots) calls.push({path:`spots/${spot.id}`,slug:spot.slug,sha256:spot.sha256})
  calls.push({path:`guides/${slug}`,slug,sha256:result.r2GuideHash})
  const results=[]
  for(const call of calls) {
    const body=JSON.stringify({slug:call.slug,sha256:call.sha256,issuedAt:Date.now()})
    const signature=createHmac('sha256',required('R2_SECRET_ACCESS_KEY')).update(body).digest('hex')
    const r=await fetch(`https://www.jnqjourney.com/api/admin/public-data/${call.path}/revalidate`,{method:'POST',headers:{'Content-Type':'application/json','x-jnq-maintenance-signature':signature},body,signal:AbortSignal.timeout(45000)})
    results.push({path:call.path,status:r.status,ok:r.ok})
  }
  await fs.writeFile(`${dir}/revalidation.json`,bytes(results))
  console.log(JSON.stringify(results))
  if(results.some(result=>!result.ok))throw Error('Some revalidation calls failed; inspect revalidation.json before retrying')
}
if(revalidateOnly){await revalidate(JSON.parse(await fs.readFile(`${dir}/result.json`)));process.exit(0)}

await fs.mkdir(dir,{recursive:true})
if(!apply) {
  const locations=await rows('locations'), regions=await rows('regions')
  const version=(await download(pointer)).toString().trim(), guides=JSON.parse((await download(version)).toString())
  if(guides.some(g=>g.slug===slug)||regions.some(r=>/^(langkawi|kedah)$/i.test(r.name)))throw Error('Existing Langkawi data requires a new audit; no duplicate creation')
  const names=new Set(source.spots.flatMap(s=>[s.name,s.name_cn,...s.aliases]).map(s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')))
  const candidates=locations.filter(l=>[l.name,l.name_cn,...(Array.isArray(l.tags)?l.tags:[])].some(s=>names.has(String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))) || /langkawi|兰卡威|浮罗交怡/i.test(l.address||'') || (l.latitude>6.15&&l.latitude<6.55&&l.longitude>99.55&&l.longitude<100))
  if(candidates.length)throw Error(`Identity audit required: ${candidates.map(x=>x.id)}`)
  const nextRegion=Math.max(...regions.map(r=>r.id))+1
  const regionRows=[{id:nextRegion,name:'Kedah',name_cn:'吉打',code:'KDH',country:'Malaysia',parent_id:null,description:'吉打位于马来西亚半岛北部，兰卡威群岛属于吉打州。',image_url:null,slug:'kedah'}, {id:nextRegion+1,name:'Langkawi',name_cn:'兰卡威',code:'LGK',country:'Malaysia',parent_id:nextRegion,description:'兰卡威位于吉打州，以海滩、森林、山景与海岛自驾行程为主。',image_url:null,slug:'langkawi'}]
  const nextId=Math.max(...locations.map(l=>l.id))+1
  const spots=source.spots.map((s,index)=>{
    if(!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude)||s.latitude<6.15||s.latitude>6.55||s.longitude<99.55||s.longitude>100)throw Error(`Unverified coordinates: ${s.name}`)
    const practical=[s.phone?`电话：${s.phone}`:'',s.website?`网站：${s.website}`:'',s.duration||''].filter(Boolean).join('；')
    return {id:nextId+index,name:s.name,name_cn:s.name_cn,category:s.category,address:s.address,latitude:s.latitude,longitude:s.longitude,description:s.description+(practical?`\n\n${practical}`:''),tags:['Langkawi','Kedah',...(s.entityType?[s.entityType]:[]),...s.aliases],region_id:nextRegion+1,status:'active',is_visited:true,visit_date:null,video_url:source.videoUrl,image_url:null,images:[],google_maps_url:`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`,opening_hours:s.hours?JSON.stringify({isUnknown:false,is24Hours:false,scheduleGroups:[],...s.hours}):null,price_info:s.prices?JSON.stringify({currency:'RM',isFree:false,...s.prices,priceSource:s.website,lastCheckedAt:source.checkedAt}):null}
  })
  const refs=spots.filter(s=>s.category!=='accommodation').map((s,displayOrder)=>({spotId:s.id,spotSlug:`${slugify(s.name)}-${s.id}`,displayOrder,enabled:true,displayName:s.name_cn,guideSummary:s.description.split('\n\n')[0]}))
  const guide={slug,title:'Langkawi 5D4N 自驾游',shortTitle:'兰卡威 5天4夜',tagline:'天空之桥、森林夜游、海滩与岛上餐桌',summary:'从士乃直飞兰卡威，机场取车开启五天四夜自驾。这篇游记整理影片中实际到访的地点、两间住宿及交通提醒；每日行程分组仍待补充。',duration:'5 Days / 4 Nights',budget:'',budgetScope:'unspecified',travelStyle:'Self-drive / 自驾',route:[{name:'Langkawi',summary:'吉打州兰卡威；影片地点总览，具体分日待补充。'}],coverAccent:'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.34),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))]',coverImage:'',highlightTags:['Langkawi','Kedah','自驾','5天4夜'],heroBullets:['士乃直飞兰卡威，机场取车','Villa Paddy 与 Airis Sanctuary 两间住宿','影片中的实际到访地点'],budgetItems:[],days:[],itineraryMode:'unassigned',attractions:refs,accommodationStays:spots.filter(s=>s.category==='accommodation').map(s=>({accommodationId:s.id,note:'本次旅程实际入住；具体入住日与晚数待补充。'})),bestFor:['自驾自由行','海滩与森林体验','想结合影片查地点的旅客'],notes:['交通：影片说明记载从 Senai International Airport 直飞 Langkawi International Airport，抵达机场取车。5 天租车实际支付 RM290，属于本次历史消费，不是当前报价或整趟旅行总预算。','红树林：影片确认参加船游，但实际码头与产品尚未确认；不把它直接绑定为 Kilim 的某个码头。','免税购物：影片包含免税购物记录，但具体店铺尚未确认。可作为购物安排参考，不列出未证实到访的商店。','Crab Langkawi Farm and Restaurant：本次吃过的餐厅，位于 Jalan Teluk Yu、Kampung Kelubi。精确地图点尚待核实，暂不提供可能错误的导航。','Gua MAHA：与 GM Farm 餐厅在相同场地附近；独立参观范围尚待核实，进入前请向现场人员确认。','地点列表沿用影片介绍顺序；请勿将其理解为 Day 1–5 的真实分日。'],videoUrl:source.videoUrl}
  normalizeUnassignedVisits(guide)
  const newSlugs=refs.map(x=>x.spotSlug)
  if(new Set(spots.map(x=>x.id)).size!==spots.length||new Set(newSlugs).size!==newSlugs.length)throw Error('Duplicate ID/slug')
  const r2Before={}
  for(const key of ['public-data/guides.json','public-data/locations.json','public-data/regions.json','public-data/spots/index.json']){
    const o=await object(key);const file=key.replaceAll('/','_');await fs.writeFile(`${dir}/${file}.before`,o.body);r2Before[key]={file,hash:hash(o.body),etag:o.etag}
  }
  const plan={createdAt:new Date().toISOString(),sourceHash:stable(source),before:{locationsHash:stable(locations),regionsHash:stable(regions),version,guidesHash:stable(guides),locationCount:locations.length,guideCount:guides.length},r2Before,regions:regionRows,spots,guide,existingExact:0,existingProbable:0,unresolved:source.unresolved,unchangedGuides:guides.map(g=>({slug:g.slug,sha256:stable(g)}))}
  await fs.writeFile(`${dir}/diff.json`,bytes(plan))
  await fs.writeFile(`${dir}/authoritative-guides-before.json`,bytes(guides))
  console.log(JSON.stringify({diff:`${dir}/diff.json`,spots:spots.length,attractions:refs.length,stays:guide.accommodationStays.length,existing:0,duplicate:0,unresolved:source.unresolved.map(x=>x.name)}))
  process.exit(0)
}

// Mutations only consume the exact persisted and reviewed diff. Stop on drift.
try{await fs.access(`${dir}/result.json`);throw Error('Already applied; use --revalidate only')}catch(e){if(e.code!=='ENOENT')throw e}
try{await fs.access(`${dir}/journal.json`);throw Error('A prior mutation journal exists; inspect and recover completed steps before any retry')}catch(e){if(e.code!=='ENOENT')throw e}
const plan=JSON.parse(await fs.readFile(`${dir}/diff.json`,'utf8'))
if(stable(source)!==plan.sourceHash||stable(await rows('locations'))!==plan.before.locationsHash||stable(await rows('regions'))!==plan.before.regionsHash||(await download(pointer)).toString().trim()!==plan.before.version)throw Error('Authoritative data drift; regenerate diff')
const guides=JSON.parse((await download(plan.before.version)).toString())
if(stable(guides)!==plan.before.guidesHash)throw Error('Guide content drift')
for(const [key,value] of Object.entries(plan.r2Before))if(hash((await object(key)).body)!==value.hash)throw Error(`R2 drift: ${key}`)
const journal=[]
async function record(step,details={}){journal.push({step,...details,at:new Date().toISOString()});await fs.writeFile(`${dir}/journal.json`,bytes(journal))}
for(const region of plan.regions){const r=await sb.from('regions').insert(region).select().single();if(r.error)throw Error(r.error.message);await record('region-created',{id:r.data.id})}
const created=await sb.from('locations').insert(plan.spots).select('*').order('id');if(created.error)throw Error(created.error.message)
await record('spots-created',{ids:created.data.map(x=>x.id)})
for(const proposed of plan.spots){const actual=created.data.find(s=>s.id===proposed.id);for(const [key,value]of Object.entries(proposed))if(JSON.stringify(actual[key])!==JSON.stringify(value))throw Error(`Spot readback ${proposed.id}.${key}`)}
const contentVersion=`_system/langkawi/${Date.now()}.webp`
await upload(contentVersion,bytes({source,spots:created.data,regions:plan.regions,guide:plan.guide}))
await record('content-evidence-version',{contentVersion})
const nextGuides=[...guides,plan.guide],guideVersion=`_system/guides/${Date.now()}.webp`
await upload(guideVersion,bytes(nextGuides))
if((await download(pointer)).toString().trim()!==plan.before.version)throw Error('Concurrent Guide pointer change')
await upload(pointer,Buffer.from(guideVersion),true)
await record('guide-pointer-updated',{guideVersion})
const persisted=JSON.parse((await download(guideVersion)).toString())
const sourceInfo={type:'supabase-langkawi-content-build',generatedAt:new Date().toISOString()}
const locationBefore=JSON.parse(await fs.readFile(`${dir}/${plan.r2Before['public-data/locations.json'].file}.before`))
const regionBefore=JSON.parse(await fs.readFile(`${dir}/${plan.r2Before['public-data/regions.json'].file}.before`))
const indexBefore=JSON.parse(await fs.readFile(`${dir}/${plan.r2Before['public-data/spots/index.json'].file}.before`))
const publicRegions=plan.regions.map(r=>({id:r.id,slug:`${slugify(r.name)}-${r.id}`,name:`${r.name_cn} / ${r.name}`,country:r.country,thumbnail:null,shortSummary:r.description,parentId:r.parent_id,code:r.code}))
const region=publicRegions[1],regionRef={id:region.id,slug:region.slug,name:region.name,country:region.country,code:region.code}
const publicLocations=created.data.map(s=>({id:s.id,slug:`${slugify(s.name)}-${s.id}`,name:`${s.name_cn} / ${s.name}`,region:regionRef,category:s.category,latitude:s.latitude,longitude:s.longitude,thumbnail:null,shortSummary:s.description.split('\n\n')[0].slice(0,180)}))
const spotResults=[]
for(const l of publicLocations){const row=created.data.find(s=>s.id===l.id);const body=bytes({schemaVersion:1,source:sourceInfo,spot:publicSpotFromSupabaseRow(row,l,plan.regions[1])});await put(`public-data/spots/${l.slug}.json`,body);spotResults.push({id:l.id,slug:l.slug,sha256:hash(body)});await record('spot-snapshot',{id:l.id,sha256:hash(body)})}
const outputs={
  'public-data/locations.json':{...locationBefore,source:sourceInfo,locations:[...locationBefore.locations,...publicLocations]},
  'public-data/regions.json':{...regionBefore,source:sourceInfo,regions:[...regionBefore.regions,...publicRegions]},
  'public-data/spots/index.json':{...indexBefore,source:sourceInfo,slugs:[...indexBefore.slugs,...publicLocations.map(s=>s.slug)].sort()},
  'public-data/guides.json':{schemaVersion:1,generatedAt:sourceInfo.generatedAt,guides:persisted}
}
const snapshotHashes={}
for(const [key,value]of Object.entries(outputs)){const b=bytes(value);await put(key,b,plan.r2Before[key].etag);snapshotHashes[key]=hash(b);await record('collection-published',{key,sha256:hash(b)})}
const current=await rows('locations')
if(current.filter(x=>!created.data.some(s=>s.id===x.id)).length!==plan.before.locationCount)throw Error('Unexpected location count')
const originals=current.filter(x=>!created.data.some(s=>s.id===x.id))
if(stable(originals)!==plan.before.locationsHash)throw Error('Existing locations changed')
if(stable((await rows('regions')).filter(r=>!plan.regions.some(n=>n.id===r.id)))!==plan.before.regionsHash)throw Error('Existing regions changed')
const result={guideVersion,contentVersion,r2GuideHash:snapshotHashes['public-data/guides.json'],snapshotHashes,spots:spotResults,counts:{created:created.data.length,updated:0,existing:0,attractions:plan.guide.attractions.length,stays:2,duplicate:0},unchangedGuides:plan.unchangedGuides,dayGrouping:'pending',unresolved:source.unresolved}
await fs.writeFile(`${dir}/result.json`,bytes(result))
console.log(JSON.stringify(result))
