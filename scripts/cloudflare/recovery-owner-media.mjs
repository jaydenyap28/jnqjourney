// Read and cache only owner-confirmed objects with current published consumers.
import assert from 'node:assert/strict'
import {mkdir,readFile,statfs,writeFile} from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {CDN,PROJECT,RECOVERY,RECOVERY_BASE,fingerprint} from './recovery-sources.mjs'
import {FINAL_DIR,hash,mediaIdentity} from './recovery-media-inventory-final.mjs'
import {verifyCachedMedia} from './recovery-media-staging.mjs'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'

const json=async file=>JSON.parse(await readFile(file,'utf8'))
const approval=await json(new URL('../../cloudflare/static-recovery/review/travel-owner-confirmation-2026-11-11.json',import.meta.url))
const [inventory,collections,sizes,baseline,current,oldAssets,newAssets]=await Promise.all([
  json(path.join(FINAL_DIR,'inventory.private.json')),
  json(path.resolve('artifacts/cloudflare-static-cutover-final/manual-exceptions-by-collection.json')),
  json(path.join(FINAL_DIR,'r2-size-measurements.json')),
  json(path.join(RECOVERY_BASE,'source-manifest.json')),json(path.join(RECOVERY,'source-manifest.json')),
  json(path.join(RECOVERY_BASE,'source-media-inventory.json')),json(path.join(RECOVERY,'source-media-inventory.json')),
])
assert.notEqual(RECOVERY,RECOVERY_BASE,'NEW_CAPTURE_REQUIRED')
assert.equal(approval.inventorySha256,inventory.summary.inventorySha256)
assert.equal(collections.inventorySha256,approval.inventorySha256)
assert.equal(approval.status,'OWNER_CONFIRMED')
assert.equal(current.databaseFingerprint,baseline.databaseFingerprint,'DATABASE_PUBLICATION_CHANGED_REFRESH_REVIEW')
for(const name of ['guides.json','notes.json','english.json','location-slugs.json','guide-trip-costs.json']){
  assert.equal(current.files[name].sha256,baseline.files[name].sha256,'PUBLIC_SOURCE_CHANGED_REFRESH_REVIEW_'+name)
}
const normalizeAssets=assets=>assets.map(item=>({...item,owners:item.owners.toSorted(),fields:item.fields.toSorted()})).sort((a,b)=>a.url.localeCompare(b.url))
assert.equal(fingerprint(normalizeAssets(newAssets.assets)),fingerprint(normalizeAssets(oldAssets.assets)),'PUBLIC_MEDIA_REFERENCES_CHANGED')
const allowedOwners=new Map()
for(const item of newAssets.assets){
  const identity=mediaIdentity(item.url)
  if(!allowedOwners.has(identity))allowedOwners.set(identity,new Set())
  for(const owner of item.owners)allowedOwners.get(identity).add(owner)
}
const group=collections.groups.find(item=>item.group===approval.group)
assert.equal(group.identitySha256.length,approval.count)
const approvedIds=new Set(group.identitySha256)
assert.equal(approvedIds.size,approval.count)
const metadata=new Map(sizes.values.map(row=>[row.identitySha256,row]))
const expectedFormat={'image/webp':'webp','image/jpeg':'jpeg','image/png':'png'}
const selected=[],decisions=[]
for(const row of inventory.records){
  if(row.status==='EXCLUDED_CLOSED_ONLY')continue
  const verifiedOwners=[...(allowedOwners.get(row.identity)??[])].sort()
  const decision={identitySha256:row.sha256,contentOwners:row.owners,approvedBy:'Current cutover instruction'}
  if(approvedIds.has(row.sha256)){
    assert.deepEqual(verifiedOwners,row.owners,'CONFIRMED_MEDIA_CONSUMER_CHANGED')
    assert.ok(verifiedOwners.length&&!row.closedOwners.length&&row.identity.startsWith(CDN+'/'))
    const {bytes,type}=metadata.get(row.sha256)
    assert.ok(bytes>0&&bytes<=25*1024**2&&expectedFormat[type],'R2_IMAGE_METADATA_UNSUPPORTED')
    selected.push({row,bytes,format:expectedFormat[type],decision:{...decision,rightsEvidence:approval.statement,rightsStatus:'OWNER_CONFIRMED'}})
  }else if(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/.test(row.identity)
    &&!collections.groups.some(g=>g.identitySha256.includes(row.sha256))){
    decisions.push({...decision,disposition:'provider-reference',rightsEvidence:'Existing public video provider thumbnail, exact video ID verified in frozen audit. No copy.'})
  }else{
    decisions.push({...decision,disposition:'exclude',rightsEvidence:'Missing image state selected for this cutover. No permission to copy or new public reference inferred.'})
  }
}
assert.equal(selected.length,approval.count)
assert.equal(inventory.records.filter(row=>row.status==='EXCLUDED_CLOSED_ONLY').length,33)
assert.equal(decisions.filter(item=>item.disposition==='provider-reference').length,41)
const bytes=selected.reduce((n,row)=>n+row.bytes,0)
const disk=await statfs(RECOVERY_BASE)
const estimatedFiles=inventory.summary.files+selected.length
assert.ok(estimatedFiles<=20_000,'PAGES_FILE_COUNT_LIMIT')
assert.ok(disk.bavail*disk.bsize>=4*bytes+1024**3,'MEDIA_CACHE_AND_BUILD_DISK_HEADROOM')
const mode=process.argv[2]
assert.ok(['--check','--download'].includes(mode))
const token=await privateWranglerToken()
const projectResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`,{
  headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
const project=await projectResponse.json()
assert.ok(projectResponse.ok&&project.success&&project.result.name===PROJECT&&!project.result.canonical_deployment
  &&project.result.production_branch==='main'&&!project.result.source&&project.result.domains.every(name=>name===PROJECT+'.pages.dev'),'PAGES_PROJECT_BOUNDARY_FAILED')
const report={checkedAt:new Date().toISOString(),capturedAt:current.capturedAt,counts:current.counts,inventorySha256:approval.inventorySha256,
  rightsStatus:approval.status,eligible:selected.length,closedExcluded:33,retainedExternal:41,missingDisplay:decisions.length-41,
  mediaBytes:bytes,estimatedFiles,largestImage:Math.max(...selected.map(row=>row.bytes)),availableDisk:disk.bavail*disk.bsize,
  downloaded:0,reused:0,failures:[],finished:false}
const evidence=path.join(RECOVERY,'owner-media-copy.json')
const save=()=>writeFile(evidence,JSON.stringify(report,null,2))
await save()
console.log(JSON.stringify(report))
if(mode==='--check')process.exit(0)

const cache=path.join(FINAL_DIR,'approved-image-cache'),state=path.join(FINAL_DIR,'owner-copy-receipts')
await mkdir(cache,{recursive:true});await mkdir(state,{recursive:true})
let index=0,stopped=false
async function processItem(item){
  const {row,bytes,format,decision}=item
  const receipt=path.join(state,row.sha256+'.json')
  const prior=await json(receipt).catch(error=>{if(error.code==='ENOENT')return null;throw error})
  if(prior){
    assert.equal(prior.identitySha256,row.sha256)
    assert.equal(prior.bytes,bytes)
    await verifyCachedMedia(cache,prior)
    report.reused++
    return {...decision,disposition:'static-copy',approvedBytesSha256:prior.approvedBytesSha256,bytes,path:prior.path}
  }
  let response
  for(let attempt=0;attempt<3;attempt++){
    try{
      response=await fetch(row.identity,{redirect:'error',signal:AbortSignal.timeout(45000)})
      if(response.ok||![429,502,503,504].includes(response.status))break
      await response.body?.cancel()
    }catch(error){if(attempt===2)throw error}
    await new Promise(resolve=>setTimeout(resolve,(attempt+1)*2000))
  }
  assert.ok(response?.ok&&response.body,`R2_OBJECT_HTTP_${response?.status}`)
  assert.equal(response.headers.get('content-type')?.split(';')[0],format==='jpeg'?'image/jpeg':'image/'+format,'R2_CONTENT_TYPE_CHANGED')
  const chunks=[]
  let read=0
  for await(const chunk of response.body){
    read+=chunk.byteLength
    assert.ok(read<=bytes,'R2_OBJECT_SIZE_CHANGED')
    chunks.push(chunk)
  }
  assert.equal(read,bytes,'R2_OBJECT_SIZE_CHANGED')
  const body=Buffer.concat(chunks,read)
  const info=await sharp(body,{limitInputPixels:100_000_000}).metadata()
  assert.ok(info.format===format&&info.width>0&&info.height>0,'R2_IMAGE_SIGNATURE_INVALID')
  const digest=hash(body),file=digest+'.'+(format==='jpeg'?'jpg':format)
  const next={...decision,disposition:'static-copy',approvedBytesSha256:digest,bytes,path:'/media/static/'+file}
  await writeFile(path.join(cache,file),body,{flag:'wx'}).catch(async error=>{
    if(error.code!=='EEXIST')throw error
    await verifyCachedMedia(cache,next)
  })
  await writeFile(receipt,JSON.stringify({...next,sourceEtag:response.headers.get('etag')},null,2),{flag:'wx'})
  report.downloaded++
  return next
}
async function worker(){
  while(!stopped&&index<selected.length){
    const item=selected[index++]
    try{decisions.push(await processItem(item))}
    catch(error){
      stopped=true
      report.failures.push({identitySha256:item.row.sha256,error:String(error.message).split('\n')[0],code:error.cause?.code??error.code??null})
    }
  }
}
const progress=setInterval(()=>console.log(JSON.stringify({downloaded:report.downloaded,reused:report.reused,failed:report.failures.length})),30_000)
try{
  await Promise.all(Array.from({length:10},()=>worker()))
  if(!report.failures.length){
    decisions.sort((a,b)=>a.identitySha256.localeCompare(b.identitySha256))
    await writeFile(path.join(FINAL_DIR,'owner-approved-media.json'),JSON.stringify({inventorySha256:approval.inventorySha256,decisions},null,2),{flag:'wx'})
    report.finished=true
  }
}finally{clearInterval(progress);await save()}
console.log(JSON.stringify(report))
if(!report.finished)process.exitCode=1
