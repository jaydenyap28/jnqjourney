// Exact source references, grouped by content owner rather than guessed filenames.
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
const json=async name=>JSON.parse(await readFile(path.join(RECOVERY,'sources',name),'utf8'))
const db=await json('database.json'),notes=(await json('notes.json')).notes,guides=(await json('guides.json')).guides
const entries=new Map()
function inspect(value,owner,field='') {
  if(typeof value==='string') {
    for(const match of value.matchAll(/https?:\/\/[^\s"'<>\\]+/g)) {
      const raw=match[0].replaceAll('&amp;','&').replace(/[),.;]+$/,'')
      let url;try{url=new URL(raw)}catch{continue}
      if(!/\.(?:webp|png|jpe?g|gif|avif|svg)$/i.test(url.pathname))continue
      const item=entries.get(url.href)||{url:url.href,owners:[],fields:[],legacyR2:url.hostname==='pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'}
      if(!item.owners.includes(owner))item.owners.push(owner)
      if(!item.fields.includes(field))item.fields.push(field)
      entries.set(url.href,item)
    }
  } else if(Array.isArray(value))value.forEach((child,index)=>inspect(child,owner,field+'['+index+']'))
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))inspect(child,owner,field?field+'.'+key:key)
}
for(const [type,records,key] of [['spot',db.locations,'id'],['region',db.regions,'id'],['note',notes,'slug'],['guide',guides,'slug'],['package',db.packages,'id'],['package-option',db.options,'id']]) {
  for(const record of records)inspect(record,type+':'+record[key])
}
const assets=[...entries.values()]
const shared=assets.filter(item=>new Set(item.owners.map(owner=>owner.split(':')[0])).size>1)
const report={checkedAt:new Date().toISOString(),sourceReferencedImages:assets.length,legacyR2:assets.filter(item=>item.legacyR2).length,
  sharedAcrossModules:shared.length,definition:'Exact image URL references in captured public records. Locale duplicates are one content owner. Source references can differ from existing renderer normalization.',
  availabilityScope:'Only the separate rendered-image HEAD report is availability-tested; other gallery/source URLs are not.',nativeIdentity:'UNVERIFIED_FORMAL_MEDIA',assets}
await writeFile(path.join(RECOVERY,'source-media-inventory.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({sourceReferencedImages:report.sourceReferencedImages,legacyR2:report.legacyR2,sharedAcrossModules:report.sharedAcrossModules}))
