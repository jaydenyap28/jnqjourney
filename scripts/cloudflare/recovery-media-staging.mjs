import assert from 'node:assert/strict'
import {constants} from 'node:fs'
import {copyFile,link,lstat,mkdir,readFile,readdir,statfs,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {CDN,RECOVERY,RECOVERY_BASE,SUPABASE} from './recovery-sources.mjs'
import {FINAL_DIR,mediaIdentity} from './recovery-media-inventory-final.mjs'
import {assertApprovedImageBytes,readMediaApproval,validateMediaApproval} from './recovery-media-release-gate.mjs'
import {readApprovedAdditions,rewriteApprovedAdditions,rewriteApprovedAdditionValues} from './full-release-media.mjs'

const placeholder='/placeholder-image.jpg'
const candidates=/https:\/\/[^\s"'<>\x60\\\[\]{}]+/g
const videoThumbnail=/^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\/hqdefault\.jpg$/
const r2Host=new URL(CDN).hostname
const cacheOrigins=new Set([CDN,SUPABASE,'https://i.ibb.co','https://i.ytimg.com','https://img.youtube.com'])

export function mediaPlan(inventory,approval){
  const {authorized,pending}=validateMediaApproval(inventory,approval)
  const byUrl=new Map(),images=new Map(),videoPosters={}
  for(const row of inventory.records){
    const decision=authorized.get(row.sha256)
    if(!decision)continue
    if(decision.disposition==='provider-reference')assert.match(row.identity,videoThumbnail,'VIDEO_PROVIDER_REFERENCE_NOT_EXACT')
    byUrl.set(row.identity,decision)
    const video=row.identity.match(videoThumbnail)?.[1]
    if(video)videoPosters[video]=decision.disposition==='exclude'?placeholder:decision.disposition==='provider-reference'?row.identity:decision.path
    if(decision.disposition!=='static-copy')continue
    const prior=images.get(decision.path)
    assert.ok(!prior||prior.bytes===decision.bytes,'MEDIA_DIGEST_SIZE_CONFLICT')
    if(!prior)images.set(decision.path,{...decision,source:row.identity})
  }
  const addedBytes=[...images.values()].reduce((total,item)=>total+item.bytes,0)
  assert.ok(inventory.summary.files+images.size<=20000,'PAGES_FILE_COUNT_LIMIT')
  function rewrite(text){
    return text.replace(candidates,token=>{
      const raw=token.replace(/[),.;]+$/,'')
      let url,decision
      try{url=new URL(raw.replaceAll('&amp;','&'));decision=byUrl.get(mediaIdentity(raw))}
      catch{return token}
      if(!decision||decision.disposition==='provider-reference')return token
      const focus=/^#focus=[\d.]+,[\d.]+$/.test(url.hash)?url.hash:''
      const result=decision.disposition==='exclude'?placeholder:decision.path+focus
      return result+token.slice(raw.length)
    })
  }
  function rewriteValue(value){
    if(typeof value==='string')return rewrite(value)
    if(Array.isArray(value))return value.map(rewriteValue)
    if(!value||typeof value!=='object')return value
    const entries=new Map()
    for(const [key,item] of Object.entries(value)){
      // Preserve URL-keyed metadata for copied objects. Exclusions must not
      // assign the retired image's metadata to the shared placeholder.
      const next=rewrite(key)
      if(next===placeholder&&key!==next)continue
      const payload=rewriteValue(item)
      if(entries.has(next))assert.deepEqual(entries.get(next),payload,'MEDIA_METADATA_KEY_COLLISION')
      entries.set(next,payload)
    }
    return Object.fromEntries(entries)
  }
  return {pending,images,addedBytes,videoPosters,rewrite,rewriteValue}
}

function hasImageSignature(file,bytes){
  const extension=path.extname(file)
  const prefix=(start,end)=>bytes.subarray(start,end).toString('ascii')
  if(extension==='.png')return bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
  if(extension==='.webp')return prefix(0,4)==='RIFF'&&prefix(8,12)==='WEBP'
  if(extension==='.gif')return ['GIF87a','GIF89a'].includes(prefix(0,6))
  if(extension==='.avif')return prefix(4,8)==='ftyp'&&['avif','avis'].includes(prefix(8,12))
  return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
}
export async function verifyCachedMedia(directory,decision){
  const file=path.join(directory,path.basename(decision.path))
  const entry=await lstat(file)
  assert.ok(entry.isFile()&&!entry.isSymbolicLink()&&entry.size===decision.bytes,'MEDIA_CACHE_FILE_INVALID')
  const bytes=await readFile(file)
  assertApprovedImageBytes(decision,bytes)
  assert.ok(hasImageSignature(decision.path,bytes),'MEDIA_SIGNATURE_EXTENSION_MISMATCH')
  return file
}

export async function readFinalMediaPlan({verifyCache=true,reuseExistingMedia=false}={}){
  const json=async name=>JSON.parse(await readFile(path.join(FINAL_DIR,name),'utf8'))
  const inventory=await json('inventory.private.json')
  const {approval}=await readMediaApproval(inventory)
  const plan=mediaPlan(inventory,approval)
  const additions=await readApprovedAdditions()
  assert.equal(plan.pending.length,0,`MEDIA_DECISIONS_PENDING_${plan.pending.length}`)
  const cache=path.join(FINAL_DIR,'approved-image-cache')
  const disk=await statfs(reuseExistingMedia?RECOVERY:RECOVERY_BASE)
  // Next's public tree, export and Pages package may temporarily coexist.
  const availableBytes=disk.bavail*disk.bsize
  const requiredBuildBytes=reuseExistingMedia?2*1024**3:3*plan.addedBytes+1024**3
  assert.ok(availableBytes>=requiredBuildBytes,'MEDIA_BUILD_DISK_HEADROOM')
  if(verifyCache)for(const decision of plan.images.values())await verifyCachedMedia(cache,decision)
  return {...plan,cache,approval,additions,availableBytes,requiredBuildBytes,inventorySha256:inventory.summary.inventorySha256,
    rewrite:text=>rewriteApprovedAdditions(plan.rewrite(text),additions),
    rewriteValue:value=>rewriteApprovedAdditionValues(plan.rewriteValue(value),additions)}
}
export async function linkFinalMediaToExport(directory,plan){
  const target=path.join(directory,'media/static')
  await mkdir(target,{recursive:true})
  const verifiedRoot=process.env.JNQ_RECOVERY_VERIFIED_MEDIA
  if(verifiedRoot){
    const paths=await renderedStaticMedia(directory)
    for(const name of paths){
      const addition=plan.additions.get(name)
      if(addition){
        const source=await verifyCachedMedia(path.join(RECOVERY,'approved-incremental-media'),addition)
        await link(source,path.join(target,name))
        continue
      }
      const decision=plan.images.get('/media/static/'+name)
      assert.ok(decision,'RENDERED_IMAGE_NOT_APPROVED')
      const source=path.join(verifiedRoot,name)
      const entry=await lstat(source)
      assert.ok(entry.isFile()&&!entry.isSymbolicLink()&&entry.size===decision.bytes,'VERIFIED_BASELINE_MEDIA_CHANGED')
      await link(source,path.join(target,name))
    }
    return paths.size
  }
  for(const decision of plan.images.values()){
    const source=await verifyCachedMedia(plan.cache,decision)
    await link(source,path.join(target,path.basename(decision.path)))
  }
}

export async function renderedStaticMedia(directory){
  const names=new Set()
  async function visit(relative=''){
    for(const entry of await readdir(path.join(directory,relative),{withFileTypes:true})){
      const name=path.posix.join(relative,entry.name)
      assert.ok(!entry.isSymbolicLink(),'UNEXPECTED_EXPORT_LINK')
      if(entry.isDirectory()){await visit(name);continue}
      if(!/\.(html|json|txt|js|css|xml)$/.test(name))continue
      const text=(await readFile(path.join(directory,name),'utf8')).replaceAll('\\/','/').replaceAll('\\u002F','/')
      for(const match of text.matchAll(/\/media\/static\/([a-f0-9]{64}\.(?:webp|png|jpe?g|avif|gif))/g))names.add(match[1])
    }
  }
  await visit()
  return names
}
export async function stageFinalMedia(directory,plan){
  const target=path.join(directory,'public/media/static')
  await mkdir(target,{recursive:true})
  for(const decision of plan.images.values()){
    const source=await verifyCachedMedia(plan.cache,decision)
    await copyFile(source,path.join(target,path.basename(decision.path)),constants.COPYFILE_EXCL)
  }
}

async function populateApprovedCache(){
  const {cache,images,availableBytes,requiredBuildBytes}=await readFinalMediaPlan({verifyCache:false})
  await mkdir(cache,{recursive:true})
  let missingBytes=0
  for(const decision of images.values()){
    try{await lstat(path.join(cache,path.basename(decision.path)))}
    catch(error){if(error.code!=='ENOENT')throw error;missingBytes+=decision.bytes}
  }
  assert.ok(availableBytes>=requiredBuildBytes+missingBytes,'MEDIA_CACHE_AND_BUILD_DISK_HEADROOM')
  const stats={reused:0,downloaded:0,downloadedBytes:0}
  for(const decision of images.values()){
    try{await verifyCachedMedia(cache,decision);stats.reused++;continue}
    catch(error){if(error.code!=='ENOENT')throw error}
    const url=new URL(decision.source)
    assert.ok(cacheOrigins.has(url.origin)&&!url.username&&!url.password,'MEDIA_SOURCE_ORIGIN_NOT_APPROVED')
    if(url.origin===SUPABASE)assert.ok(url.pathname.startsWith('/storage/v1/object/public/location-images/'),'SUPABASE_MEDIA_SOURCE_NOT_PUBLIC')
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)})
    assert.ok(response.ok&&response.body,`APPROVED_MEDIA_HTTP_${response.status}`)
    const chunks=[]
    let size=0
    for await(const chunk of response.body){
      size+=chunk.byteLength
      assert.ok(size<=decision.bytes,'MEDIA_EXCEEDS_APPROVED_BYTES')
      chunks.push(chunk)
    }
    const bytes=Buffer.concat(chunks,size)
    assertApprovedImageBytes(decision,bytes)
    assert.ok(hasImageSignature(decision.path,bytes),'MEDIA_SIGNATURE_EXTENSION_MISMATCH')
    await writeFile(path.join(cache,path.basename(decision.path)),bytes,{flag:'wx'})
    stats.downloaded++;stats.downloadedBytes+=size
  }
  console.log(JSON.stringify(stats))
}

// A source literal known to be a legacy image must be accounted for before
// rendering. Non-image runtime configuration is checked in the final package.
export function assertNoLegacyImageLiteral(text){
  for(const [url] of text.matchAll(candidates)){
    const raw=url.replace(/[),.;]+$/,'')
    if(raw.includes(r2Host)&&/\.(png|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(raw)){
      throw new Error('LEGACY_IMAGE_MISSING_MEDIA_DECISION')
    }
  }
}
if(process.argv[1]?.endsWith('recovery-media-staging.mjs')){
  assert.deepEqual(process.argv.slice(2),['--populate-approved-cache'])
  await populateApprovedCache()
}
