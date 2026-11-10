// Public HTTPS reads only. Raw public snapshots stay in the run artifact directory.
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'

const output='artifacts/cloudflare-public-readiness/'
const cdn='https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'
const site='https://www.jnqjourney.com'
const max=8*1024*1024
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const sources={
  locations:'public-data/locations.json',notes:'public-data/notes.json',guides:'public-data/guides.json',
  spots:'public-data/spots/index.json',english:'public-data/i18n/en/records.json',
  spot636:'public-data/spots/turtle-alley-turtle-alley-636.json',
  spot636Canonical:'public-data/spots/turtle-alley-636.json',
  spot274:'public-data/spots/bukit-tun-razak-274.json',
}
const pages=['/','/spot/turtle-alley-turtle-alley-636','/en/spot/turtle-alley-turtle-alley-636','/notes/malaysia-turtle-night-terengganu','/en/notes/malaysia-turtle-night-terengganu','/spot/spot-636','/sitemap.xml','/robots.txt']
const approved=new Set([cdn,site,'https://jnqjourney.com','https://vrufunuomioczocdsoer.supabase.co'])
async function read(url,method='GET',maxBytes=max){
  if(!approved.has(new URL(url).origin))throw Error('PUBLIC_ORIGIN_OUT_OF_SCOPE')
  const r=await fetch(url,{method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)})
  const headers={status:r.status,contentType:r.headers.get('content-type'),length:r.headers.get('content-length'),platformError:r.headers.get('x-vercel-error'),robots:r.headers.get('x-robots-tag'),etag:r.headers.get('etag')}
  if(method==='HEAD'||!r.ok){await r.body?.cancel();return {headers}}
  if(Number(headers.length)>maxBytes){await r.body?.cancel();throw Error('PUBLIC_RESPONSE_TOO_LARGE')}
  const chunks=[];let size=0
  for await(const chunk of r.body){size+=chunk.byteLength;if(size>maxBytes)throw Error('PUBLIC_RESPONSE_TOO_LARGE');chunks.push(chunk)}
  return {headers,bytes:Buffer.concat(chunks)}
}
await mkdir(output+'sources',{recursive:true})
if(process.argv.includes('--probe-media-sample')){
  const load=async name=>JSON.parse(await readFile(output+'sources/'+name+'.json'))
  const [{spot:a},{spot:b},notes]=await Promise.all(['spot636Canonical','spot274','notes'].map(load))
  const note=notes.notes.find(record=>record.slug==='malaysia-turtle-night-terengganu')
  const references=[
    ...[a,b].flatMap(spot=>[spot.image_url,...spot.images].map(url=>({owner:'spot:'+spot.id,url}))),
    ...[note.coverImage,...note.blocks.flatMap(block=>[block.imageUrl,...(block.images||[]).map(image=>image.src)])].filter(Boolean).slice(0,6).map(url=>({owner:'note:'+note.slug,url})),
  ]
  const unique=new Map()
  for(const {owner,url} of references){
    const target=new URL(url)
    if(!approved.has(target.origin)||target.search)continue
    target.hash=''
    const entry=unique.get(target.href)||{owners:[],url:target.href}
    if(!entry.owners.includes(owner))entry.owners.push(owner)
    unique.set(target.href,entry)
  }
  const result=[]
  for(const entry of unique.values()){
    try{result.push({...entry,...(await read(entry.url,'HEAD')).headers})}
    catch{result.push({...entry,error:'PUBLIC_MEDIA_HEAD_FAILED'})}
  }
  await writeFile(output+'media-head-sample.json',JSON.stringify({scope:'Bounded HEAD; URL health only',result},null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify({checked:result.length,statuses:result.reduce((acc,item)=>(acc[item.status??'unknown']=(acc[item.status??'unknown']||0)+1,acc),{})}))
  process.exit(0)
}
if(process.argv.includes('--detail-supplement')){
  const detail={}
  for(const name of ['spot636Canonical','spot274']){
    const key=sources[name]
    const {headers,bytes}=await read(cdn+'/'+key)
    detail[name]={key,...headers}
    if(bytes){
      const payload=JSON.parse(bytes)
      if(payload.schemaVersion!==1||payload.spot?.id!==Number(key.match(/-(\d+)\.json$/)?.[1]))throw Error('DETAIL_SCOPE_INVALID')
      await writeFile(output+'sources/'+name+'.json',bytes,{flag:'wx'})
      Object.assign(detail[name],{sha256:hash(bytes),spotId:payload.spot.id,updatedAt:payload.spot.updated_at,albumCount:payload.spot.images?.length??0})
    }
  }
  const archived=await readFile('data/notes.json','utf8')
  const missing=['91ae4731-7e0d-4265-9ab6-8ec2feb7a6f8','eb47829d-ccd1-44d7-8146-f1d2afd24d6f']
  detail.knownHistoricalNoteMedia=[]
  for(const token of missing){
    const urls=archived.match(/https?:\/\/[^\s"'<>()[\]\\]+/g)||[]
    const url=urls.find(item=>item.includes(token))
    if(!url||!approved.has(new URL(url).origin)||new URL(url).search){detail.knownHistoricalNoteMedia.push({referenceToken:token,status:'NO_ELIGIBLE_PROBE'});continue}
    detail.knownHistoricalNoteMedia.push({url,...(await read(url,'HEAD')).headers})
  }
  await writeFile(output+'detail-supplement.json',JSON.stringify(detail,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(detail,null,2))
  process.exit(0)
}
const captured={}
const report={observedAt:new Date().toISOString(),publicOnly:true,snapshots:{},site:{},sourcesCompared:{},media:{},accountQuota:'UNKNOWN'}
const fetched=await Promise.allSettled(Object.entries(sources).map(async ([name,key])=>{
  const {headers,bytes}=await read(cdn+'/'+key)
  if(!bytes)return [name,{key,...headers}]
  const data=JSON.parse(bytes)
  if(data.schemaVersion!==1)throw Error('UNEXPECTED_PUBLIC_SCHEMA')
  captured[name]=data
  await writeFile(output+'sources/'+name+'.json',bytes)
  return [name,{key,...headers,bytes:bytes.length,sha256:hash(bytes),generatedAt:data.generatedAt??null,version:data.version??null}]
}))
for(const [i,result] of fetched.entries()){
  if(result.status==='fulfilled')report.snapshots[result.value[0]]=result.value[1]
  else report.snapshots[Object.keys(sources)[i]]={error:'PUBLIC_SNAPSHOT_READ_FAILED'}
}
const statuses=await Promise.allSettled(pages.map(async pathname=>[pathname,(await read(site+pathname,'HEAD')).headers]))
for(const [i,result] of statuses.entries()){
  if(result.status==='fulfilled')report.site[result.value[0]]=result.value[1]
  else report.site[pages[i]]={error:'PUBLIC_SITE_HEAD_FAILED'}
}
const bundled=JSON.parse(await readFile('public-data/fallback/2026-10-30.json'))
const old=JSON.parse(await readFile('cloudflare/spot-loop/evidence/preproduction-readonly-2026-11-09.json'))
const collections={publicLocationIndex:captured.locations?.locations,publicNotes:captured.notes?.notes,publicGuides:captured.guides?.guides,
  publicSpot636:[captured.spot636?.spot].filter(Boolean),archivedSpotDetails:Object.values(bundled.spots)}
const byUrl=new Map()
function scan(value,refs,mediaField=false){
  if(typeof value==='string'){
    const matches=value.match(/https?:\/\/[^\s"'<>()[\]\\]+|\/[^\s"'<>()[\]\\]+\.(?:avif|gif|jpe?g|png|webp)(?=[\s"'<>()[\]]|$)/gi)||[]
    for(const match of matches){
      try{
        const url=new URL(match,site)
        if(!/\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)&&!(mediaField&&matches.length===1&&match===value&&/^https?:/.test(match)))continue
        if(url.username||url.password)continue
        refs.push(url.href)
      }catch{}
    }
  }else if(Array.isArray(value))value.forEach(item=>scan(item,refs,mediaField))
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
    if(/^https?:/.test(key))scan(key,refs,true)
    scan(item,refs,/^(?:coverImage|thumbnail|image_url|imageUrl|images|src)$/i.test(key))
  }
}
for(const [name,records] of Object.entries(collections)){
  if(!records){report.sourcesCompared[name]={available:false};continue}
  const all=[]
  for(const [index,record] of records.entries()){
    const refs=[];scan(record,refs)
    const owner=String(record.id??record.slug??index)
    for(const ref of refs){
      const source=byUrl.get(ref)||new Set()
      source.add(name+':'+owner);byUrl.set(ref,source)
      all.push(ref)
    }
  }
  const unique=new Set(all)
  const hosts={}
  for(const ref of unique){const hostname=new URL(ref).hostname;hosts[hostname]=(hosts[hostname]||0)+1}
  report.sourcesCompared[name]={records:records.length,observedImageReferences:all.length,uniqueImageUrls:unique.size,repeatOccurrences:all.length-unique.size,hosts}
}
report.publicRouteInventory={spots:captured.spots?.slugs?.length??null,notes:captured.notes?.notes?.length??null,guides:captured.guides?.guides?.length??null,
  enComplete:captured.english?.records?.filter(item=>item.translationStatus==='complete').reduce((out,item)=>(out[item.entityType]=(out[item.entityType]||0)+1,out),{})??null}
report.media={uniqueAcrossScannedSources:byUrl.size,reusedAcrossRecordsOrProjections:[...byUrl.values()].filter(refs=>refs.size>1).length,objectOrphans:'UNKNOWN_NO_COMPLETE_BUCKET_MANIFEST'}
const archivedSpot=bundled.spots['636']
const note=captured.notes?.notes?.find(item=>item.slug==='malaysia-turtle-night-terengganu')
const probes=[['spot_cover_636',captured.spot636?.spot?.image_url??archivedSpot?.image_url],['note_cover',note?.coverImage]]
for(const [label,key] of [['historically_missing_note_1','91ae4731-7e0d-4265-9ab6-8ec2feb7a6f8'],['historically_missing_note_2','eb47829d-ccd1-44d7-8146-f1d2afd24d6f']]){
  const url=[...byUrl.keys()].find(ref=>ref.includes(key))
  if(url)probes.push([label,url])
}
report.samples=[]
for(const [label,url] of probes){
  if(!url||!approved.has(new URL(url).origin)||new URL(url).search){report.samples.push({label,available:false});continue}
  try{
    const response=await read(url,'HEAD')
    report.samples.push({label,url,...response.headers,referenceSources:[...(byUrl.get(url)||[])].slice(0,8)})
  }catch{report.samples.push({label,url,error:'MEDIA_HEAD_FAILED'})}
}
report.historicalDatabaseAudit={evidenceDate:old.auditDateSingapore,note:'Earlier authenticated aggregate evidence. This run uses public projections and no database credentials.'}
await writeFile(output+'inventory.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report,null,2))
