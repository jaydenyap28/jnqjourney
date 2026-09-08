import fs from 'node:fs/promises'
import {createHash,createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3'
import env from '@next/env'
import {publicSpotFromSupabaseRow} from '../lib/public-spot.ts'
import {normalizeUnassignedVisits} from '../lib/guide-unassigned.ts'

env.loadEnvConfig(process.cwd())
const dir='artifacts/langkawi-build/targeted-patch',slug='malaysia-langkawi-5d4n',pointer='_system/guides-latest.webp'
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),hash=b=>createHash('sha256').update(b).digest('hex'),semantic=v=>hash(JSON.stringify(v))
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),save=async(n,v)=>fs.writeFile(`${dir}/${n}.json`,bytes(v))
const source=await read('data/langkawi-targeted-patch.json'),before=await read(`${dir}/before.json`)
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const storage=sb.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET||'location-images')
const r2=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}}),Bucket=process.env.R2_BUCKET_NAME
const slugify=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
async function download(key){const r=await storage.download(key,{cacheNonce:String(Date.now())});if(r.error)throw r.error;return Buffer.from(await r.data.arrayBuffer())}
async function upload(key,body,upsert=false){const r=await storage.upload(key,body,{upsert,contentType:'image/webp',cacheControl:'0'});if(r.error)throw r.error;if(hash(await download(key))!==hash(body))throw Error(`Storage readback ${key}`)}
async function object(Key){const r=await r2.send(new GetObjectCommand({Bucket,Key}));return{body:Buffer.from(await r.Body.transformToByteArray()),etag:r.ETag}}
async function put(Key,body,etag){await r2.send(new PutObjectCommand({Bucket,Key,Body:body,...(etag?{IfMatch:etag}:{IfNoneMatch:'*'}),ContentType:'application/json; charset=utf-8',CacheControl:'public, max-age=3600, stale-while-revalidate=86400'}));if(hash((await object(Key)).body)!==hash(body))throw Error(`R2 readback ${Key}`)}
async function locations(){const r=await sb.from('locations').select('*').order('id').range(0,1999);if(r.error)throw r.error;if(r.data.length>=1999)throw Error('Pagination required');return r.data}
async function revalidate(result){const calls=[...result.spots.map(s=>({path:`spots/${s.id}`,slug:s.slug,sha256:s.sha256})),{path:`guides/${slug}`,slug,sha256:result.snapshotHashes['public-data/guides.json']}],out=[];for(const c of calls){const body=JSON.stringify({slug:c.slug,sha256:c.sha256,issuedAt:Date.now()}),signature=createHmac('sha256',process.env.R2_SECRET_ACCESS_KEY).update(body).digest('hex');const r=await fetch(`https://www.jnqjourney.com/api/admin/public-data/${c.path}/revalidate`,{method:'POST',headers:{'Content-Type':'application/json','x-jnq-maintenance-signature':signature},body,signal:AbortSignal.timeout(45000)});out.push({path:c.path,status:r.status,body:await r.text()})}await save('revalidation',out);if(out.some(r=>r.status!==200))throw Error('Revalidation incomplete');console.log(JSON.stringify(out))}
if(process.argv.includes('--revalidate')){await revalidate(await read(`${dir}/result.json`));process.exit(0)}
const original=before.guides.find(g=>g.slug===slug),guide=structuredClone(original),displayDiff=[]
for(const a of guide.attractions){if(source.displayNames[a.spotId]){displayDiff.push({id:a.spotId,before:a.displayName,after:source.displayNames[a.spotId]});a.displayName=source.displayNames[a.spotId]}if(a.spotId===825)a.guideSummary=source.update825.description.split('\n\n')[0]}
for(const s of guide.accommodationStays){const row=before.locations.find(l=>l.id===s.accommodationId);s.displayName=source.stayDisplayNames[s.accommodationId];displayDiff.push({id:row.id,before:row.name_cn||row.name,after:s.displayName})}
const spots=source.spots.map(s=>({id:s.id,name:s.name,name_cn:null,category:s.category,address:s.address,latitude:s.latitude,longitude:s.longitude,description:s.description,tags:['Langkawi','Kedah',...s.aliases,...(s.tags||[])],region_id:92,status:'active',is_visited:true,visit_date:null,video_url:source.videoUrl,image_url:null,images:[],google_maps_url:s.sources.find(u=>u.includes('google.com/maps')),opening_hours:null,price_info:null}))
for(const s of spots)guide.attractions.push({spotId:s.id,spotSlug:`${slugify(s.name)}-${s.id}`,displayOrder:guide.attractions.length,enabled:true,displayName:s.name,guideSummary:s.description.split('\n\n')[0]})
// Correct only obsolete identity notes resolved by this patch; preserve transport/shopping facts.
guide.notes=guide.notes.map(n=>n.startsWith('红树林：')?'红树林：本次船游实际从 Tanjung Rhu Mangrove Jetty 出发；具体产品与费用请向预订方确认。':n.startsWith('Crab Langkawi')?'Crab Langkawi Farm and Restaurant：本次实际用餐的餐厅，精确地点已核实，可由地点卡片查看导航。':n.startsWith('Gua MAHA：')?'Gua MAHA 与 GM Farm Seafood Restaurant 为本次到访的同一地点，统一记录为 Gua MAHA & GM Farm Seafood Restaurant。':n.startsWith('地点列表沿用')?'以下为实际到访地点总览；每日分组尚待确认。':n)
normalizeUnassignedVisits(guide)
if(guide.days.length||guide.itineraryMode!=='unassigned')throw Error('Duration guard')
const allowed=new Set(['attractions','accommodationStays','notes'])
for(const key of Object.keys(original))if(!allowed.has(key)&&semantic(original[key])!==semantic(guide[key]))throw Error(`Forbidden Guide change ${key}`)
const aliases={...before.aliases,'825':'gm-farm-seafood-restaurant'}
const oldLight=await read(`${dir}/${before.r2Before['public-data/locations.json'].file}`),index=await read(`${dir}/${before.r2Before['public-data/spots/index.json'].file}`)
const nearMatches=spots.map(s=>({id:s.id,nearbyExisting:before.locations.filter(l=>Math.hypot((l.latitude-s.latitude)*111,(l.longitude-s.longitude)*110)<0.15).map(l=>({id:l.id,name:l.name}))}))
for(const s of spots){if(before.locations.some(l=>l.id===s.id)||index.slugs.includes(`${slugify(s.name)}-${s.id}`))throw Error('ID/slug collision');const names=[s.name,...source.spots.find(x=>x.id===s.id).aliases].map(x=>x.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''));if(before.locations.some(l=>[l.name,l.name_cn,...(l.tags||[])].some(x=>names.includes(String(x||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')))))throw Error(`Duplicate entity ${s.name}`)}
const plan={sourceHash:semantic(source),beforeVersion:before.version,spots,update825:source.update825,alias825:{before:before.aliases['825']??null,after:aliases['825']},displayDiff,nearMatches,guide,notesDiff:{before:original.notes,after:guide.notes},unresolved:source.unresolved}
if(!process.argv.includes('--apply')){await save('diff',plan);console.log(JSON.stringify({created:spots.length,updated:825,displayDiff,nearMatches,days:guide.days,attractions:guide.attractions.length}));process.exit(0)}
for(const file of ['journal','result']){try{await fs.access(`${dir}/${file}.json`);throw Error(`Existing ${file}; inspect completed mutations, do not replay`)}catch(e){if(e.code!=='ENOENT')throw e}}
if(semantic(await read(`${dir}/diff.json`))!==semantic(plan))throw Error('Persisted diff changed')
if(semantic(await locations())!==semantic(before.locations)||(await download(pointer)).toString().trim()!==before.version||semantic(JSON.parse(await download(before.version)))!==semantic(before.guides)||semantic(JSON.parse(await download('_system/location-slugs.webp')))!==semantic(before.aliases))throw Error('Authoritative drift')
for(const[k,v]of Object.entries(before.r2Before))if(hash((await object(k)).body)!==v.sha256)throw Error(`R2 drift ${k}`)
const journal=[],record=async(step,details={})=>{journal.push({step,...details,at:new Date().toISOString()});await save('journal',journal)}
await record('begin',{sourceHash:plan.sourceHash})
const contentVersion=`_system/langkawi/patch-${Date.now()}.webp`
await upload(contentVersion,bytes({source,plan}));await record('immutable-evidence',{contentVersion})
await upload('_system/location-slugs.webp',bytes(aliases),true);await record('canonical-slug-pinned',{id:825})
const updated=await sb.from('locations').update(source.update825).eq('id',825).select('*').single();if(updated.error)throw updated.error;await record('spot-updated',{id:825})
const created=await sb.from('locations').insert(spots).select('*').order('id');if(created.error)throw created.error;await record('spots-created',{ids:created.data.map(s=>s.id)})
for(const proposed of [...spots,{id:825,...source.update825}]){const actual=[...created.data,updated.data].find(s=>s.id===proposed.id);for(const[k,v]of Object.entries(proposed))if(semantic(actual[k])!==semantic(v))throw Error(`Row readback ${proposed.id}.${k}`)}
const nextGuides=before.guides.map(g=>g.slug===slug?guide:g),guideVersion=`_system/guides/${Date.now()}.webp`
await upload(guideVersion,bytes(nextGuides));if((await download(pointer)).toString().trim()!==before.version)throw Error('Concurrent pointer change');await upload(pointer,Buffer.from(guideVersion),true);await record('guide-published',{guideVersion})
const sourceInfo={type:'supabase-langkawi-targeted-patch',generatedAt:new Date().toISOString()},old825=oldLight.locations.find(l=>l.id===825)
const publicLocations=[updated.data,...created.data].map(s=>({id:s.id,slug:s.id===825?old825.slug:`${slugify(s.name)}-${s.id}`,name:s.name,region:old825.region,category:s.category,latitude:s.latitude,longitude:s.longitude,thumbnail:null,shortSummary:s.description.split('\n\n')[0].slice(0,180)}))
const regionResult=await sb.from('regions').select('*').eq('id',92).single();if(regionResult.error)throw regionResult.error
const spotResults=[]
for(const l of publicLocations){const row=[updated.data,...created.data].find(s=>s.id===l.id),key=`public-data/spots/${l.slug}.json`,body=bytes({schemaVersion:1,source:sourceInfo,spot:publicSpotFromSupabaseRow(row,l,regionResult.data)});await put(key,body,before.r2Before[key]?.etag);spotResults.push({id:l.id,slug:l.slug,sha256:hash(body)});await record('spot-snapshot',{id:l.id})}
const outputs={'public-data/locations.json':{...oldLight,source:sourceInfo,locations:[...oldLight.locations.map(l=>l.id===825?publicLocations[0]:l),...publicLocations.slice(1)]},'public-data/spots/index.json':{...index,source:sourceInfo,slugs:[...index.slugs,...publicLocations.slice(1).map(l=>l.slug)].sort()},'public-data/guides.json':{schemaVersion:1,generatedAt:sourceInfo.generatedAt,guides:nextGuides}}
const snapshotHashes={}
for(const[key,value]of Object.entries(outputs)){const b=bytes(value);await put(key,b,before.r2Before[key].etag);snapshotHashes[key]=hash(b);await record('collection-published',{key})}
const current=await locations(),newIds=new Set(spots.map(s=>s.id))
if(semantic(current.filter(s=>s.id!==825&&!newIds.has(s.id)))!==before.nonTargetSpotHash||semantic(current.filter(s=>s.region_id!==92))!==before.nonLangkawiSpotHash)throw Error('Non-target Spot changed')
for(const g of before.nonTargetGuideHashes)if(semantic(nextGuides.find(x=>x.slug===g.slug))!==g.hash)throw Error('Non-target Guide changed')
if(hash((await object('public-data/regions.json')).body)!==before.r2Before['public-data/regions.json'].sha256)throw Error('Regions changed')
const result={guideVersion,contentVersion,snapshotHashes,spots:spotResults,nonTargetGuideChanges:0,nonTargetExistingSpotChanges:0,days:[],itineraryMode:guide.itineraryMode,attractions:guide.attractions.length,displayDiff}
await save('result',result);console.log(JSON.stringify(result))
