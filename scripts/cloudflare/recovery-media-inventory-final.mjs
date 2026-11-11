import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {CDN,RECOVERY_BASE} from './recovery-sources.mjs'

export const FINAL_DIR=path.resolve('artifacts/cloudflare-static-media-final')
export const hash=value=>createHash('sha256').update(value).digest('hex')
export function mediaIdentity(value){
  const url=new URL(value.replaceAll('&amp;','&'))
  assert.equal(url.protocol,'https:')
  assert.ok(!url.username&&!url.password)
  url.hash=''
  // A Cloudflare R2 object key does not include the display query/fragment.
  if(url.origin===CDN)url.search=''
  return url.href
}
const extension=/\.(?:webp|png|jpe?g|gif|avif|svg|ico|bmp)$/i
const publicImageHosts=new Set([new URL(CDN).host,'i.ibb.co','vrufunuomioczocdsoer.supabase.co','i.ytimg.com','img.youtube.com'])

export async function inventoryFinalMedia(){
  const load=async file=>JSON.parse(await readFile(file,'utf8'))
  const previous=await load(path.join(RECOVERY_BASE,'source-media-inventory.json'))
  const closed=await load(path.resolve('artifacts/cloudflare-static-launch-p0/nonpublic-media-readonly.json'))
  assert.equal(previous.assets.length,4775)
  assert.equal(closed.projectRef,'vrufunuomioczocdsoer')
  const entries=new Map(),legacyFeeds=new Map(),literalFiles=[]
  function entry(raw){
    const identity=mediaIdentity(raw)
    if(!entries.has(identity))entries.set(identity,{identity,sha256:hash(identity),sourceUrls:new Set(),owners:new Set(),closedOwners:new Set(),representations:new Set()})
    return entries.get(identity)
  }
  for(const item of previous.assets){
    const row=entry(item.url)
    row.sourceUrls.add(item.url)
    for(const owner of item.owners)row.owners.add(owner)
  }
  for(const row of closed.nonPublicMedia){
    for(const raw of [row.image_url,...(row.images||[]),...(row.infoImages||[])]){
      if(typeof raw==='string'&&raw.startsWith(CDN+'/'))entry(raw).closedOwners.add(`spot:${row.id}`)
    }
  }
  let files=0,textFiles=0
  const artifact=path.join(RECOVERY_BASE,'deploy')
  async function visit(dir=''){
    for(const file of await readdir(path.join(artifact,dir),{withFileTypes:true})){
      const name=path.posix.join(dir,file.name)
      assert.ok(!file.isSymbolicLink(),'UNEXPECTED_ARTIFACT_LINK')
      if(file.isDirectory()){await visit(name);continue}
      files++
      if(!/\.(html|json|txt|xml|js|css)$/i.test(name))continue
      textFiles++
      const content=(await readFile(path.join(artifact,name),'utf8')).replaceAll('\\/','/').replaceAll('\\u0026','&').replaceAll('\\u002F','/')
      if(content.includes(new URL(CDN).host))literalFiles.push(name)
      const seen=new Set()
      for(const match of content.matchAll(/https:\/\/[^\s"'<>`\\\[\]{}]+/g)){
        const raw=match[0].replace(/[),.;]+$/,'')
        if(seen.has(raw))continue
        seen.add(raw)
        let url
        try{url=new URL(raw.replaceAll('&amp;','&'))}catch{continue}
        if(url.origin===CDN&&url.pathname.startsWith('/public-data/')){
          if(!legacyFeeds.has(url.pathname))legacyFeeds.set(url.pathname,new Set())
          legacyFeeds.get(url.pathname).add(name)
        } else if(extension.test(url.pathname)&&(publicImageHosts.has(url.host)||entries.has(url.href))){
          entry(raw).representations.add(name)
        }
      }
    }
  }
  await visit()
  assert.equal(files,3621)
  const records=[...entries.values()].map(row=>{
    const owners=[...row.owners].sort(),closedOwners=[...row.closedOwners].sort(),representations=[...row.representations].sort()
    return {...row,sourceUrls:[...row.sourceUrls].sort(),owners,closedOwners,representations,
      shared:owners.length>1,crossModule:new Set(owners.map(owner=>owner.split(':')[0])).size>1,
      status:closedOwners.length&&!owners.length&&!representations.length?'EXCLUDED_CLOSED_ONLY':'REVIEW_REQUIRED',
      publicationApproval:null}
  }).sort((a,b)=>a.identity.localeCompare(b.identity))
  const digest=hash(JSON.stringify(records.map(({identity,sourceUrls,owners,closedOwners,representations})=>({identity,sourceUrls,owners,closedOwners,representations}))))
  const summary={checkedAt:new Date().toISOString(),files,textFiles,sourceUrls:previous.assets.length,
    sourceUrlsAccountedFor:records.reduce((sum,row)=>sum+row.sourceUrls.length,0),
    sourceIdentities:records.filter(row=>row.sourceUrls.length).length,
    activeSourceOrArtifactIdentities:records.filter(row=>row.status==='REVIEW_REQUIRED').length,
    observedInArtifact:records.filter(row=>row.representations.length).length,
    artifactOnly:records.filter(row=>!row.sourceUrls.length&&row.representations.length).length,
    sourceOnly:records.filter(row=>row.sourceUrls.length&&!row.representations.length).length,
    excludedClosedOnly:records.filter(row=>row.status==='EXCLUDED_CLOSED_ONLY').length,
    closedWithConsumers:records.filter(row=>row.closedOwners.length&&row.status!=='EXCLUDED_CLOSED_ONLY').length,
    multiOwner:records.filter(row=>row.shared).length,crossModule:records.filter(row=>row.crossModule).length,
    approvedForStaticCopy:0,privateDraftRevokedTotal:'UNKNOWN',inventorySha256:digest,
    legacyHostTextFiles:literalFiles.length,legacyFeedReferences:[...legacyFeeds].map(([pathname,names])=>({pathname,fileCount:names.size})),
    scope:'Exact captured source URLs and known image-host literals in existing deployable HTML, JSON, RSC text, JS, CSS and XML. Source-only references are not proof of a rendered request. Rights are not inferred from public readability.'}
  assert.equal(summary.sourceUrlsAccountedFor,4775)
  await mkdir(FINAL_DIR,{recursive:true})
  await writeFile(path.join(FINAL_DIR,'inventory.private.json'),JSON.stringify({summary,records,literalFiles},null,2))
  await writeFile(path.join(FINAL_DIR,'inventory-summary.json'),JSON.stringify(summary,null,2))
  // Review sheet contains public references only. Closed URLs stay local.
  const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"'
  const lines=['identity_sha256,public_source,content_owners,output_file_count,review_state,rights_basis,approved_sha256']
  for(const row of records.filter(item=>item.status==='REVIEW_REQUIRED'&&!item.closedOwners.length)){
    lines.push([row.sha256,row.identity,row.owners.join('|'),row.representations.length,row.status,'',''].map(csv).join(','))
  }
  await writeFile(path.join(FINAL_DIR,'public-media-review.csv'),lines.join('\n')+'\n')
  console.log(JSON.stringify(summary))
  return summary
}

if(process.argv[1]?.endsWith('recovery-media-inventory-final.mjs'))await inventoryFinalMedia()
