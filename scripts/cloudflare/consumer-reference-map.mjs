// Offline, exact-reference replacement. Never enumerates or downloads media.
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {controlledMediaValue} from '../../lib/controlled-media.ts'
import {resolveGuidePublicMedia,resolveNotePublicMedia} from '../../lib/server/public-content-media.ts'
const root='artifacts/cloudflare-p0-consumers/'
await mkdir(root+'replacement',{recursive:true})
const load=async file=>JSON.parse(await readFile(file,'utf8'))
const base='artifacts/cloudflare-public-readiness/sources/'
const [locations,guides,notes,fallback,packages]=await Promise.all([load(base+'locations.json'),load(base+'guides.json'),load(base+'notes.json'),load('public-data/fallback/2026-10-30.json'),load('data/travel-packages-snapshot.json')])
const index=new Map(),ownerCounts={}
function add(owner,value,field='$'){
  if(typeof value==='string'){
    for(const match of value.match(/https:\/\/pub-8ecf7356fcc84618a26557ed36fc53a1\.r2\.dev\/[^\s<>"')]+/g)||[]){
      const url=new URL(match);url.hash=''
      const key=url.pathname.slice(1),entry=index.get(key)||{key,oldUrl:url.href,newPath:controlledMediaValue(url.href),owners:[],identity:'UNVERIFIED',byteAccess:'BLOCKED_UNTIL_IDENTITY_AND_ALL_OWNER_RULES_VERIFIED'}
      if(!entry.owners.some(item=>item.owner===owner&&item.field===field))entry.owners.push({owner,field})
      index.set(key,entry)
    }
  }else if(Array.isArray(value))value.forEach((child,i)=>add(owner,child,field+'['+i+']'))
  else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(key.startsWith('https://pub-'))add(owner,key,field+'.[key]');add(owner,child,field+'.'+key)}
}
for(const [kind,records,id]of [['spot-index',locations.locations,'id'],['note',notes.notes,'slug'],['guide',guides.guides,'slug'],['region-historic',fallback.regions,'id'],['package-historic',packages.packages,'slug'],['option-historic',packages.options,'slug']]){
  ownerCounts[kind]=records.length
  for(const row of records)add(kind+':'+row[id],row)
}
for(const file of ['spot274.json','spot636Canonical.json']){const value=await load(base+file);add('spot-detail:'+value.spot.id,value.spot)}
const guideResolved=guides.guides.map(guide=>resolveGuidePublicMedia(guide,locations.locations)),notesResolved=notes.notes.map(note=>resolveNotePublicMedia(note,locations.locations))
// The existing resolver can supply explicit compatibility media constants.
// Record those derived controlled paths without inferring filename ownership.
function controlledReferences(owner,value,field='$'){
  if(typeof value==='string'&&value.startsWith('/media/legacy/')){
    const encoded=value.split('#')[0].slice('/media/legacy/'.length)
    const key=decodeURIComponent(encoded)
    add(owner,'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/'+key,field)
  }else if(Array.isArray(value))value.forEach((child,i)=>controlledReferences(owner,child,field+'['+i+']'))
  else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))controlledReferences(owner,child,field+'.'+key)
}
guideResolved.forEach(guide=>controlledReferences('guide:'+guide.slug,guide));notesResolved.forEach(note=>controlledReferences('note:'+note.slug,note))
for(const [file,value]of [['locations.json',locations],['regions.json',{regions:fallback.regions}],['guides.json',{guides:guideResolved}],['notes.json',{notes:notesResolved}],['packages.json',packages]]){
  const result=controlledMediaValue(value)
  if(JSON.stringify(result).includes('pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'))throw Error('UNREWRITTEN_REFERENCE')
  await writeFile(root+'replacement/'+file,JSON.stringify(result)+'\n',{flag:'wx'})
}
const entries=[...index.values()].sort((a,b)=>a.key.localeCompare(b.key))
const normalizeOwner = owner => owner.replace(/^spot-(?:index|detail):/,'spot:').replace(/^region-historic:/,'region:').replace(/^(?:package|option)-historic:/,'package:')
const shared=entries.filter(entry=>new Set(entry.owners.map(item=>normalizeOwner(item.owner).split(':')[0])).size>1)
const report={provenance:{spotIndex:'Captured public projection 2026-11-10; not a complete private DB export',noteAndGuide:'Captured public feeds 2026-11-10',regions:'Bundled 2026-10-30 public fallback, HISTORIC ONLY',packages:'Bundled 2026-10-09 public package snapshot, HISTORIC ONLY'},ownerCounts,mappedUniqueKeys:entries.length,sharedAcrossModuleKinds:shared.length,formalObjectsCopied:0,formalWrites:0,entries,
  qualification:'Any current explicitly authorized public consumer may retain a shared asset; one Spot withdrawal must never revoke all owners. Current frozen Spot-bound Registry does not implement this rule for historical shared keys. Such bytes remain blocked.',
  externalOldLinks:'Every oldUrl below will cease working if the bucket public URL is disabled. This is a lower bound from captured references; unknown external hotlinks and uncaptured private drafts remain UNKNOWN.',
  completeness:'BLOCKED: not a full media identity inventory; no production URL is claimed verified.'}
await writeFile(root+'reference-replacements.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({ownerCounts,mappedUniqueKeys:entries.length,sharedAcrossModuleKinds:shared.length,formalObjectsCopied:0,completeness:report.completeness}))
