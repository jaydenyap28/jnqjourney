// Bounded, read-only content-source check. No database/admin/storage secrets.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import path from 'node:path'
const base=process.argv[2]
if(!base||new URL(base).protocol!=='https:')throw new Error('Pass the existing public R2/CDN HTTPS origin explicitly')
const output=path.resolve('artifacts/cloudflare-full-inventory')
await mkdir(path.join(output,'snapshots'),{recursive:true})
const sources=[['locations','public-data/locations.json','locations'],['regions','public-data/regions.json','regions'],['guides','public-data/guides.json','guides'],['notes','public-data/notes.json','notes'],['spots','public-data/spots/index.json','slugs'],['english','public-data/i18n/en/records.json','records'],['tripCosts','public-data/guide-trip-costs.json',null]]
const captured={}
const settled=await Promise.allSettled(sources.map(async([name,key,collection])=>{
  const url=new URL(key,`${base.replace(/\/$/,'')}/`);url.searchParams.set('migration-readonly',Date.now())
  const start=performance.now()
  const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)})
  if(!response.ok)return {name,key,status:response.status,available:false,elapsedMs:Math.round(performance.now()-start)}
  const text=await response.text()
  if(Buffer.byteLength(text)>16*1024*1024)throw new Error(`${name} exceeds bounded source size`)
  const payload=JSON.parse(text)
  if(payload.schemaVersion!==1||(collection&&!Array.isArray(payload[collection])))throw new Error(`${name} schema mismatch`)
  captured[name]=payload
  await writeFile(path.join(output,'snapshots',`${name}.json`),text)
  return {name,key,status:response.status,available:true,bytes:Buffer.byteLength(text),count:collection?payload[collection].length:null,generatedAt:payload.generatedAt||null,version:payload.version||null,etag:response.headers.get('etag'),elapsedMs:Math.round(performance.now()-start)}
}))
const results=settled.map((r,i)=>r.status==='fulfilled'?r.value:{name:sources[i][0],available:false,error:r.reason.message})
const bundled=JSON.parse(await readFile('data/travel-packages-snapshot.json','utf8'))
const slugs=JSON.parse(await readFile('data/location-slugs.json','utf8'))
const fallback=JSON.parse(await readFile('public-data/fallback/2026-10-30.json','utf8'))
const spotSlugs=captured.spots?.slugs||[]
const activeSlugs=spotSlugs.filter(slug=>!/-450$/.test(slug))
const unresolvedIndex450=spotSlugs.length!==activeSlugs.length
const english=captured.english?.records||[]
const counts={spots:activeSlugs.length,regions:captured.regions?.regions?.length||0,guides:captured.guides?.guides?.length||0,notes:captured.notes?.notes?.length||0,englishRecords:english.length,englishComplete:english.filter(r=>r.translationStatus==='complete').length,packagesBundled:bundled.packages.length,optionsBundled:bundled.options.length,customSlugsBundled:Object.keys(slugs).length,fallbackVersion:fallback.version}
const publicDetailPages=counts.spots+counts.regions+counts.guides+counts.notes+counts.packagesBundled+counts.optionsBundled
const englishPageUpper=counts.spots+counts.englishRecords+6
const adminPageUpper=counts.spots+3*counts.guides+counts.packagesBundled
async function walk(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):path.join(dir,e.name)))).flat()}
const sampleFiles=await walk('artifacts/cloudflare-candidate/source/out')
// Overestimate by retaining every sample file and adding all full route outputs.
const conservativeFiles=sampleFiles.length+2*(publicDetailPages+englishPageUpper+adminPageUpper+32)
let sampleBuildMs=null
try {
  const trace=await readFile('artifacts/cloudflare-candidate/source/.next/trace','utf8')
  const events=trace.trim().split('\n').flatMap(line=>JSON.parse(line))
  const build=events.filter(e=>e.name==='next-build').at(-1)
  if(build)sampleBuildMs=Math.round(build.duration/1000)
}catch{/* Existing build need not be repeated just to obtain a trace. */}
const report={capturedAt:new Date().toISOString(),origin:base,requestCount:sources.length,sources:results,counts,withdrawn450StillInIndex:unresolvedIndex450,estimate:{conservativeFiles,maxFreeFiles:20000,underFreeFileLimit:conservativeFiles<=20000,measuredSampleBuildMs:sampleBuildMs,measuredFullBuildMs:null,method:'Keep all current sample files plus two outputs per conservatively counted public/English/admin route; not an actual full export.'},missingAuthority:['Current service-authorized publication/redirect states for every Spot (public CDN index is not a live visibility authority).','Current location slug map from Supabase Storage _system/location-slugs.webp and legacy aliases.','Current travel_packages and travel_package_options from PostgREST; bundled package snapshot is not a fresh live source.','Atomic revision-consistent export across DB, Storage and independently updated R2 snapshots.'],productionReady:false}
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,sources:results.map(({name,status,available,count,generatedAt,version,error})=>({name,status,available,count,generatedAt,version,error}))},null,2))
