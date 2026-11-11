import assert from 'node:assert/strict'
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {CDN,RECOVERY_BASE,SUPABASE} from './recovery-sources.mjs'
import {FINAL_DIR,hash,mediaIdentity} from './recovery-media-inventory-final.mjs'

const output=path.resolve('artifacts/cloudflare-static-cutover-final')
const json=async file=>JSON.parse(await readFile(file,'utf8'))
const [inventory,measured,external,db,notes,guides,csv]=await Promise.all([
  json(path.join(FINAL_DIR,'inventory.private.json')),json(path.join(FINAL_DIR,'r2-size-measurements.json')),
  json(path.join(FINAL_DIR,'external-image-audit.json')),json(path.join(RECOVERY_BASE,'sources/database.json')),
  json(path.join(RECOVERY_BASE,'sources/notes.json')),json(path.join(RECOVERY_BASE,'sources/guides.json')),
  readFile(path.join(FINAL_DIR,'public-media-review.csv'),'utf8'),
])
const csvRows=new Map(csv.trimEnd().split(/\r?\n/).slice(1).map(line=>{
  const fields=[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"'))
  assert.equal(fields.length,7)
  return [fields[0],fields]
}))
const publicOwners=new Set([
  ...db.locations.filter(row=>row.status==='active'&&[null,'published'].includes(row.publication_status)).map(row=>`spot:${row.id}`),
  ...db.regions.map(row=>`region:${row.id}`),...db.packages.filter(row=>row.status==='published').map(row=>`package:${row.id}`),
  ...db.options.filter(row=>row.status==='active').map(row=>`package-option:${row.id}`),
  ...notes.notes.filter(row=>row.published===true).map(row=>`note:${row.slug}`),...guides.guides.map(row=>`guide:${row.slug}`),
])
const metadata=new Map(measured.values.map(row=>[row.identitySha256,row]))
const available=new Map(external.results.map(row=>[row.identitySha256,row]))
const previousReadback=new Set()
let provenanceSources=0
const batches=path.resolve('artifacts/spot-media-batches')
for(const directory of await readdir(batches,{withFileTypes:true})){
  if(!directory.isDirectory()||!/^phase-[123]-\d+$/.test(directory.name))continue
  const root=path.join(batches,directory.name)
  const index=await json(path.join(root,'verified.json')).catch(error=>error.code==='ENOENT'?null:Promise.reject(error))
  if(!['verified','completed-with-skips'].includes(index?.status)||!Array.isArray(index.records))continue
  for(const record of index.records){
    if(record.stage!=='verified'||!Number.isSafeInteger(record.id))continue
    const bytes=await readFile(path.join(root,`${record.id}-readback.json`)).catch(error=>error.code==='ENOENT'?null:Promise.reject(error))
    if(!bytes||hash(bytes)!==record.sha256)continue
    const historical=JSON.parse(bytes)
    if(historical.spot?.id!==record.id||historical.source?.authoritativeSpotId!==record.id||historical.source?.authoritativeTable!=='locations')continue
    provenanceSources++
    for(const url of [historical.spot.image_url,...(historical.spot.images||[])]){
      if(typeof url==='string'&&url.startsWith(CDN+'/'))previousReadback.add(mediaIdentity(url))
    }
  }
}
const groups=new Map(),shared=[]
const unknownProvider=[]
const existingPublicVideos=new Set()
function collectVideos(value,key=''){
  if(typeof value==='string'){
    if(/^(?:video_?id|youtube_?(?:video_?)?id)$/i.test(key)&&/^[\w-]{11}$/.test(value))existingPublicVideos.add(value)
    for(const m of value.matchAll(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})(?![\w-])/g))existingPublicVideos.add(m[1])
  }else if(Array.isArray(value))value.forEach(item=>collectVideos(item,key))
  else if(value&&typeof value==='object')for(const [name,item] of Object.entries(value))collectVideos(item,name)
}
collectVideos([db.locations,db.packages,notes.notes,guides.guides])
let publishedR2=0,closedOnly=0,approvedCopies=0,providerContinuation=0,recognizedReadbacks=0
for(const row of inventory.records){
  if(row.status==='EXCLUDED_CLOSED_ONLY'){closedOnly++;continue}
  const review=csvRows.get(row.sha256)
  assert.ok(review&&review[1]===row.identity&&review[2]===row.owners.join('|'),'MEDIA_CSV_IDENTITY_MISMATCH')
  assert.ok(row.owners.every(owner=>publicOwners.has(owner)),'UNPUBLISHED_OWNER_IN_PUBLIC_INVENTORY')
  const url=new URL(row.identity),probe=available.get(row.sha256)
  const previous=previousReadback.has(row.identity)
  if(previous)recognizedReadbacks++
  let group,question
  if(url.origin===CDN){
    assert.ok(metadata.has(row.sha256),'R2_OBJECT_METADATA_MISSING')
    publishedR2++
    if(row.owners.some(owner=>/^package(?:-option)?:/.test(owner))){
      group='R2_PACKAGE_PROVIDER_SCOPE';question='Confirm the existing supplier grant permits same-site static hosting. Confirm exceptions by package or supplier.'
    }else{
      group='R2_TRAVEL_PUBLISHER_SCOPE';question='Confirm the publisher-owned/cleared collection and the excluded rights or revocation groups once. An upload or historical publish record does not establish rights.'
    }
  }else if(probe&&!probe.decode){
    group='SOURCE_UNAVAILABLE';question='Recover the documented same image or approve a missing-image treatment.'
  }else if(url.hostname==='i.ytimg.com'){
    const video=url.pathname.match(/^\/vi\/([\w-]{11})\//)?.[1]
    if(video&&existingPublicVideos.has(video)){providerContinuation++;continue}
    unknownProvider.push(row.sha256)
    group='UNMATCHED_PROVIDER_REFERENCE';question='Verify the provider thumbnail belongs to the published video or omit the thumbnail.'
  }else if(url.origin===SUPABASE){
    group='SUPABASE_LEGACY_COLLECTION';question='Confirm the legacy collection rights or named exceptions before mirroring and making its mixed bucket private.'
  }else{
    group='THIRD_PARTY_IMAGE_COLLECTION';question='Confirm permission by source collection or supplier. Use an approved replacement or omit unsupported items.'
  }
  if(row.crossModule)shared.push({identitySha256:row.sha256,owners:row.owners})
  if(!groups.has(group))groups.set(group,{group,question,identities:[],owners:new Set(),archivedPublishedReadback:0,examples:[]})
  const bucket=groups.get(group)
  bucket.identities.push(row.sha256)
  for(const owner of row.owners)bucket.owners.add(owner)
  bucket.archivedPublishedReadback+=Number(previous)
  if(group==='SOURCE_UNAVAILABLE'||group==='UNMATCHED_PROVIDER_REFERENCE'){
    bucket.examples.push({identitySha256:row.sha256,owners:row.owners,host:url.hostname,http:probe?.status??null})
  }
}
assert.equal(csvRows.size,4751)
assert.equal(publishedR2,4657)
assert.equal(closedOnly,33)
const exceptions=[...groups.values()].map(({identities,owners,...group})=>({
  ...group,objects:identities.length,ownerCount:owners.size,identitySha256:identities,
  individualResolution:group.group==='SOURCE_UNAVAILABLE'||group.group==='UNMATCHED_PROVIDER_REFERENCE',
}))
const report={generatedAt:new Date().toISOString(),sourceUrls:inventory.summary.sourceUrlsAccountedFor,publicIdentityRows:csvRows.size,
  verifiedPublishedOwners:publicOwners.size,controlledR2Objects:publishedR2,previousReadbackRecords:provenanceSources,
  matchedHistoricalPublishedReferences:recognizedReadbacks,providerHostedContinuation:providerContinuation,approvedCopies,
  closedOnly,shared,explicitRevokedPrivateTotal:'UNKNOWN',unknownProvider:unknownProvider.length,
  reviewGroupCount:exceptions.length,groups:exceptions.map(({identitySha256,...group})=>group),
  limit:'Provider continuation is an existing official video reference; no rehosting licence is inferred. Public state and exact storage/publisher records do not prove copyright.'}
await mkdir(output,{recursive:true})
await writeFile(path.join(output,'media-group-summary.json'),JSON.stringify(report,null,2))
await writeFile(path.join(output,'manual-exceptions-by-collection.json'),JSON.stringify({inventorySha256:inventory.summary.inventorySha256,groups:exceptions},null,2))
console.log(JSON.stringify(report))
