// Classify exact references, not filenames. Do not fetch nonpublic image bytes.
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
const root='artifacts/cloudflare-static-launch-p0'
const sources=JSON.parse(await readFile('artifacts/cloudflare-static-recovery/source-media-inventory.json','utf8'))
const rendered=JSON.parse(await readFile('artifacts/cloudflare-static-recovery/media-inventory.json','utf8'))
const current=JSON.parse(await readFile(root+'/nonpublic-media-readonly.json','utf8'))
const hash=value=>createHash('sha256').update(value).digest('hex')
const identity=value=>{try{const url=new URL(value);return url.origin+url.pathname}catch{return null}}
const isR2=value=>{try{return new URL(value).hostname==='pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'}catch{return false}}
const map=new Map()
function record(url){const id=identity(url);if(!id)return null;let item=map.get(id);if(!item){item={id,hash:hash(id),r2:isR2(id),publicOwners:new Set(),nonPublicOwners:new Set(),renderedConsumers:new Set()};map.set(id,item)}return item}
for(const source of sources.assets){const item=record(source.url);if(item)source.owners.forEach(owner=>item.publicOwners.add(owner))}
for(const source of rendered){const item=record(source.url);if(item)source.owners.forEach(owner=>item.renderedConsumers.add(owner))}
for(const row of current.nonPublicMedia) {
  for(const url of [row.image_url,...(Array.isArray(row.images)?row.images:[]),...(Array.isArray(row.infoImages)?row.infoImages:[])]) {
    if(typeof url!=='string')continue
    const item=record(url);if(item)item.nonPublicOwners.add('spot:'+row.id)
  }
}
const r2=[...map.values()].filter(item=>item.r2)
const publicR2=r2.filter(item=>item.publicOwners.size||item.renderedConsumers.size)
const closedOnly=r2.filter(item=>item.nonPublicOwners.size&&!item.publicOwners.size&&!item.renderedConsumers.size)
const shared=r2.filter(item=>new Set([...item.publicOwners].map(owner=>owner.split(':')[0])).size>1)
const both=r2.filter(item=>item.nonPublicOwners.size&&(item.publicOwners.size||item.renderedConsumers.size))
const safeRow=item=>({objectIdentitySha256:item.hash,publicOwners:[...item.publicOwners],nonPublicOwners:[...item.nonPublicOwners],renderedConsumerCount:item.renderedConsumers.size})
const report={checkedAt:new Date().toISOString(),sourceCheckedAt:current.checkedAt,projectRef:current.projectRef,
  rules:'Exact origin/path, strip focus fragment/query for native public R2 object identity. Published references are not permanent-public rights approval. Index pages are consumers, not independent owner consent.',
  sourceImageUrls:sources.sourceReferencedImages,sourceR2Urls:sources.legacyR2,knownR2Objects:r2.length,publicReferencedR2Objects:publicR2.length,
  nonPublicSpotRecords:current.nonPublicMedia.map(row=>({id:row.id,status:row.status,publication_status:row.publication_status})),
  closedOnlyR2Objects:closedOnly.length,closedAndPublicSharedR2Objects:both.length,explicitCrossModuleR2Objects:shared.length,
  closedOnly:closedOnly.map(safeRow),closedAndPublicShared:both.map(safeRow),crossModuleShared:shared.map(safeRow),
  permanentPublicConsent:'NOT_ESTABLISHED',privateOrRevokedObjectCount:'UNKNOWN',unattributedBucketObjectCount:'UNKNOWN',
  draftNotesGuideMedia:'NOT_READ',productionRegistryExists:current.registrySchemaExists,nonPublicBytesFetched:0,productionWrites:0,
  staticMirrorLowerBound:{currentSiteFiles:3621,additionalPublicR2Images:publicR2.length,combinedFiles:3621+publicR2.length,allImageSizesAndAggregateBytes:'UNKNOWN',copyApproved:false},
  classification:'PUBLIC_REFERENCE_CANDIDATE / NONPUBLIC_REFERENCE_ONLY / SHARED / UNKNOWN_PRIVATE_OR_REVOKED'}
await writeFile(root+'/media-risk-assessment.json',JSON.stringify(report,null,2))
// Private local map permits later owner review; it is never a browser artifact.
await writeFile(root+'/media-owner-map.private.json',JSON.stringify([...map.values()].map(item=>({...safeRow(item),identity:item.id,r2:item.r2,renderedConsumers:[...item.renderedConsumers]})),null,2))
console.log(JSON.stringify({knownR2Objects:report.knownR2Objects,publicReferencedR2Objects:publicR2.length,closedOnly:closedOnly.length,closedAndPublic:both.length,crossModuleShared:shared.length,nonPublicRecords:report.nonPublicSpotRecords,privateOrRevoked:'UNKNOWN',candidateStaticFileCount:report.staticMirrorLowerBound.combinedFiles}))
