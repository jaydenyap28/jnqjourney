// Derive ownership from stored references and the existing public-media resolver.
import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {resolveGuidePublicMedia,resolveNotePublicMedia} from '../../lib/server/public-content-media.ts'
const origin='https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'
const base='artifacts/cloudflare-public-readiness/sources/'
const load=async name=>JSON.parse(await readFile(base+name+'.json'))
const [locations,guides,notes]=await Promise.all(['locations','guides','notes'].map(load))
function references(value,out=[]){
  if(typeof value==='string'){
    for(const candidate of value.match(/https:\/\/pub-8ecf7356fcc84618a26557ed36fc53a1[.]r2[.]dev\/[^\s"'<>()[\]\\]+/g)||[]){
      const url=new URL(candidate);url.hash='';out.push(url.href)
    }
  }else if(Array.isArray(value))value.forEach(child=>references(child,out))
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
    if(key.startsWith(origin))references(key,out)
    references(child,out)
  }
  return out
}
const owned=[]
for(const guide of guides.guides){
  const resolved=resolveGuidePublicMedia(guide,locations.locations)
  owned.push({kind:'guide',slug:guide.slug,directUrls:new Set(references(guide)).size,
    renderedCover:new URL(resolved.coverImage).origin===origin,renderedCoverUrl:resolved.coverImage,
    evidence:'Stored guide fields passed to the existing public-content-media resolver and current captured location projection'})
}
for(const note of notes.notes){
  const resolved=resolveNotePublicMedia(note,locations.locations)
  owned.push({kind:'note',slug:note.slug,directUrls:new Set(references(note)).size,
    renderedCover:new URL(resolved.coverImage).origin===origin,renderedCoverUrl:resolved.coverImage,
    linkedSpotIds:[...new Set([...(note.relatedSpotIds||[]),...(note.blocks||[]).map(block=>block.spotId).filter(Boolean)])],
    evidence:'Stored public note URLs, explicit relatedSpotIds/block.spotId, existing resolver'})
}
const files=execFileSync('git',['ls-files','-z','app','components','lib'],{encoding:'utf8'}).split('\0').filter(file=>/\.tsx?$/.test(file))
const readers=[]
for(const file of files){
  const lines=(await readFile(file,'utf8')).split('\n')
  const matching=lines.flatMap((line,i)=>/\.from\(['"]locations['"]\)/.test(line)?[i+1]:[])
  if(!matching.length)continue
  const body=lines.join('\n')
  readers.push({file,lines:matching,client:file.startsWith('app/admin/'),
    usesServiceRole:/SUPABASE_SERVICE_ROLE_KEY/.test(body),usesAnon:/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(body),
    scope:file.startsWith('app/admin/')?'Authenticated admin client direct reads need an authenticated server API before revoke':
      /spot-routing|spot-english-sync|spot-description-optimizer|system|api\/admin/.test(file)?'Server path; confirm service-only credentials':'Public reader/fallback; migrate to bounded projection and live publication gate'})
}
await writeFile('artifacts/cloudflare-p0-cutover/reference-impact.json',JSON.stringify({
  capturedInputs:'Public snapshots captured 2026-11-10; not a current private authoring export',
  bucket:'jnqjourney-img',origin,owners:owned,locationIndexAffected:locations.locations.length,
  derivedRoutes:['/','/en','/spot/*','/en/spot/*','/region/*','/guide','/en/guide','/guide/*','/en/guide/*','/notes','/en/notes','/notes/*','/en/notes/*','/packages/*','sitemap/openGraph/JSON-LD image URLs'],
  locationReaders:readers,coverage:'Tracked source direct table reads plus named public API consumers. External clients, cached bundles and private draft references remain UNKNOWN.',
},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({guides:owned.filter(owner=>owner.kind==='guide').map(({slug,directUrls,renderedCover})=>({slug,directUrls,renderedCover})),notes:owned.filter(owner=>owner.kind==='note').map(({slug,directUrls})=>({slug,directUrls})),locationReaders:readers.length,adminDirect:readers.filter(reader=>reader.client).length},null,2))
