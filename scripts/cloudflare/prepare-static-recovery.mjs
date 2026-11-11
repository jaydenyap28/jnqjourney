import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { buildLocationSlug } from '../../lib/location-routing.ts'
import { buildRegionSlug } from '../../lib/region-routing.ts'
import { explicitNoteAffiliateIds } from '../../lib/note-affiliates.ts'
import { getRenderableNoteBlocks } from '../../lib/notes.ts'
import { RECOVERY, SOURCE, fingerprint } from './recovery-sources.mjs'
import { normalizeRecoveryCanonical } from './recovery-launch-policy.mjs'
import { localizeLegacyFeedLinks } from './recovery-delivery-feeds.mjs'

const load = async file => JSON.parse(await readFile(path.join(RECOVERY, 'sources', file), 'utf8'))
const [db, guidesData, notesData, slugMap, english, costs, sourceManifest] = await Promise.all([
  load('database.json'), load('guides.json'), load('notes.json'), load('location-slugs.json'), load('english.json'), load('guide-trip-costs.json'),
  readFile(path.join(RECOVERY, 'source-manifest.json'), 'utf8').then(JSON.parse),
])
assert.equal(db.projectRef, 'vrufunuomioczocdsoer')
const guides = guidesData.guides
const notes = notesData.notes
const canonicalSpot = row => (slugMap[String(row.id)] ? `${slugMap[String(row.id)]}-${row.id}` : buildLocationSlug(row.name,row.id))
const publicEnglish=localizeLegacyFeedLinks(english,{
  spotSlugs:new Map(db.locations.filter(row=>!row.redirect_url).map(row=>[String(row.id),canonicalSpot(row)])),
  guideSlugs:new Set(guides.map(row=>row.slug)),regionIds:new Set(db.regions.map(row=>String(row.id))),
})
assert.ok(db.locations.every(row => row.status === 'active' && [null, 'published'].includes(row.publication_status)))
assert.ok(notes.every(note => note.published === true))
await mkdir(SOURCE, { recursive: true })
assert.equal((await readdir(SOURCE)).length, 0, 'RECOVERY_STAGING_ALREADY_POPULATED')
for (const file of execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
  if (!/^(app\/|pages\/|components\/|lib\/|data\/|public\/|public-data\/|types\/|cloudflare\/spot-loop\/[^/]+\.mjs$|(?:package(?:-lock)?\.json|tsconfig\.json|postcss\.config\.mjs)$)/.test(file)) continue
  if (/^app\/(?:api|admin|media|public-data)\/|^pages\/api\/|public-data\/fallback\//.test(file)) continue
  const target = path.join(SOURCE, file)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(file, target)
}
const write = async (file, value) => writeFile(path.join(SOURCE, file), value)
const json = async (file, value) => write(file, JSON.stringify(value))
async function edit(file, needle, replacement) {
  const text = await readFile(path.join(SOURCE, file), 'utf8')
  assert.ok(text.includes(needle), 'STATIC_ADAPTER_NO_MATCH_' + file)
  await write(file, text.replace(needle, replacement))
}
async function bodies(file, replacements, importLine = '') {
  const text = await readFile(path.join(SOURCE, file), 'utf8')
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const changes = []
  for (const node of parsed.statements) if (ts.isFunctionDeclaration(node) && replacements[node.name?.text]) {
    assert.ok(node.body)
    changes.push({ start: node.body.getStart(parsed), end: node.body.end, text: '{\n' + replacements[node.name.text] + '\n}' })
  }
  assert.equal(changes.length, Object.keys(replacements).length, 'STATIC_FUNCTION_ADAPTER_MISMATCH_' + file)
  let next = text
  for (const change of changes.sort((a,b) => b.start-a.start)) next = next.slice(0, change.start) + change.text + next.slice(change.end)
  await write(file, importLine + next)
}
await json('data/recovery-locations.json', db.locations)
await json('data/recovery-feeds.json', { 'regions.json': { regions: db.regions }, 'guides.json': guidesData, 'notes.json': notesData,
  'i18n/en/records.json': publicEnglish, 'guide-trip-costs.json': costs })
// Normalize local build metadata, never the authoritative database records.
const canonicalPackage = item => ({...item,canonical_url:normalizeRecoveryCanonical(item.canonical_url)})
await json('data/recovery-packages.json', { packages: db.packages.map(canonicalPackage), options: db.options.map(canonicalPackage) })
await json('data/location-slugs.json', slugMap)
await json('data/notes.json', notes)
await json('data/guides.json', guides)
await json('public-data/guide-trip-costs.json', costs)
await json('public-data/i18n/en/records.json', publicEnglish)
await bodies('lib/server/public-spot-projection.ts', {
  readPublicRows: `const rows = ids ? recoveryRows.filter(row => ids.includes(row.id)) : recoveryRows\nreturn validatePublicRows(rows, ids || rows.map(row => row.id))`,
}, "import recoveryRows from '@/data/recovery-locations.json'\n")
await write('lib/server/public-read-source.ts', `import './assert-server'
import feeds from '@/data/recovery-feeds.json'
export { PublicReadUnavailable, PUBLIC_READ_LIMITS, publicServiceClient, readPublicRows, validatePublicRows } from './public-spot-projection'
export async function readPrivatePublicFeed<T>(key:string):Promise<T> {
  if (!Object.hasOwn(feeds,key)) throw new Error('Static public feed unavailable')
  return feeds[key as keyof typeof feeds] as T
}
`)
await write('lib/controlled-media.ts', `// Captured public URLs remain explicit. Formal legacy exposure cutover is blocked.
export function controlledMediaUrl(value:string) { return value }
export function controlledMediaValue<T>(value:T):T { return value }
`)
await bodies('lib/server/travel-packages.ts', {
  readPublishedPackagesUncached: 'return recoveryPackages.packages as TravelPackage[]',
  readPublishedPackage: 'return (recoveryPackages.packages.find(item=>item.slug===slug) || null) as TravelPackage | null',
  readPublishedPackageOptions: 'return recoveryPackages.options.filter(item=>item.package_id===packageId) as TravelPackageOption[]',
  readPublishedPackageOption: 'return (recoveryPackages.options.find(item=>item.package_id===packageId && item.slug===optionSlug) || null) as TravelPackageOption | null',
}, "import recoveryPackages from '@/data/recovery-packages.json'\n")

const spotParams = db.locations.filter(row => !row.redirect_url).map(row => ({ slug: canonicalSpot(row) }))
const regionParams = db.regions.map(row => ({ slug: buildRegionSlug(row.name, row.id) }))
const byPackageId = new Map(db.packages.map(item => [item.id,item]))
const params = {
  'spot/[slug]': spotParams, 'region/[slug]': regionParams,
  'guide/[slug]': guides.map(item=>({slug:item.slug})), 'notes/[slug]': notes.map(item=>({slug:item.slug})),
  'packages/[slug]': db.packages.filter(item=>item.slug!=='hainan').map(item=>({slug:item.slug})),
  'packages/[slug]/[optionSlug]': db.options.filter(item=>byPackageId.get(item.package_id).slug==='batam-3d2n').map(item=>({slug:byPackageId.get(item.package_id).slug,optionSlug:item.slug})),
  'packages/hainan/[optionSlug]': db.options.filter(item=>byPackageId.get(item.package_id).slug==='hainan').map(item=>({optionSlug:item.slug})),
}
async function walk(directory) {
  return (await Promise.all((await readdir(directory,{withFileTypes:true})).map(entry => entry.isDirectory() ? walk(path.join(directory,entry.name)) : path.join(directory,entry.name)))).flat()
}
const routes = []
for (const file of await walk(path.join(SOURCE,'app'))) {
  if (!/\.(tsx?|jsx?)$/.test(file)) continue
  let text = await readFile(file,'utf8')
  text = text.replace(/export const dynamic\s*=\s*['"]force-dynamic['"]/g,"export const dynamic = 'force-static'")
    .replace(/export const revalidate\s*=\s*\d+/g,'export const revalidate = false')
    .replace('// No persisted HTML/RSC response may outlive current publication eligibility.', '// Static recovery captures publication eligibility at build time. Withdrawal requires republishing; formal migration remains HOLD.')
  if (file.endsWith(path.sep+'page.tsx')) {
    const route = path.relative(path.join(SOURCE,'app'),path.dirname(file)).replaceAll('\\','/')
    if (route.includes('[')) {
      assert.ok(params[route], 'UNMAPPED_PUBLIC_ROUTE_' + route)
      text = text.replace(/export function generateStaticParams\(\)\s*\{ return \[\] \}/g,'')
      assert.ok(!text.includes('function generateStaticParams'), 'DUPLICATE_STATIC_PARAMS')
      text += '\nexport function generateStaticParams() { return ' + JSON.stringify(params[route]) + ' }\n'
      for (const item of params[route]) routes.push('/'+route.replace(/\[([^\]]+)\]/g,(_,key)=>item[key]))
    } else routes.push(route ? '/'+route : '/')
  }
  await writeFile(file,text)
}
const englishPaths = [...new Set(['/en','/en/about','/en/search','/en/region','/en/region/malaysia','/en/guide','/en/notes','/en/packages','/en/disclaimer',
  ...spotParams.map(item=>'/en/spot/'+item.slug), ...regionParams.map(item=>'/en/region/'+item.slug),
  ...guides.map(item=>'/en/guide/'+item.slug),...notes.map(item=>'/en/notes/'+item.slug),
  ...['contact','privacy','editorial-policy','affiliate-disclosure','copyright'].map(p=>'/en/'+p),
  ...db.packages.map(item=>'/en/packages/'+item.slug)])]
// Reuse the existing non-indexed translation-missing policy page for disclaimer.
await edit('lib/server/english-page-data.ts', "['contact','privacy','editorial-policy','affiliate-disclosure','copyright'].includes(parts[0])", "['contact','privacy','editorial-policy','affiliate-disclosure','copyright','disclaimer'].includes(parts[0])")
await write('pages/en/[[...path]].tsx', `import type {GetStaticPaths,GetStaticProps} from 'next'
import EnglishRouteAdapter from '@/components/EnglishRouteAdapter'
import type {EnglishPageData} from '@/lib/server/english-page-data'
export const getStaticPaths:GetStaticPaths=async()=>({paths:${JSON.stringify(englishPaths)},fallback:false})
export const getStaticProps:GetStaticProps=async({params})=>{
  const {englishPageData,compactEnglishPageData}=await import('@/lib/server/english-page-data')
  const value=await englishPageData(Array.isArray(params?.path)?params.path:[],true)
  if(!value) return {notFound:true}
  if('redirect' in value) throw new Error('Canonical-only English static inventory contains alias')
  return {props:JSON.parse(JSON.stringify({data:compactEnglishPageData(value.data)}))}
}
export default function Page({data}:{data:EnglishPageData}) {return <EnglishRouteAdapter data={data}/>}
`)
await copyFile('scripts/cloudflare/static-recovery-link.tsx',path.join(SOURCE,'components/StaticRecoveryLink.tsx'))
for (const file of [...await walk(path.join(SOURCE,'components')), ...await walk(path.join(SOURCE,'app'))]) {
  if (!file.endsWith('.tsx')) continue
  const text=await readFile(file,'utf8')
  if (text.includes("from 'next/link'")) await writeFile(file,text.replaceAll("from 'next/link'","from '@/components/StaticRecoveryLink'"))
}
// The anchor's type-only NextLink import must keep the original type contract.
await copyFile('scripts/cloudflare/static-recovery-link.tsx',path.join(SOURCE,'components/StaticRecoveryLink.tsx'))
await write('components/AppHomePageClient.tsx', `'use client'
import HomePageClient from './HomePageClient'
import type {ComponentProps} from 'react'
export default function AppHomePageClient(props:ComponentProps<typeof HomePageClient>) {
 return <HomePageClient {...props} navigate={url=>window.location.assign(url)}/>
}
`)
for (const file of ['app/layout.tsx','pages/_app.tsx']) {
  let text=await readFile(path.join(SOURCE,file),'utf8')
  text=text.replace(/import \{ Analytics \} from '@vercel\/analytics\/react'\s*/,'').replace(/import \{ SpeedInsights \} from '@vercel\/speed-insights\/next'\s*/,'')
    .replace(/<Analytics\s*\/>/g,'').replace(/<SpeedInsights\s*\/>/g,'')
  if(file==='app/layout.tsx') text=text.replace(/<script\s+async\s+src=\{`https:\/\/pagead2[\s\S]*?crossOrigin="anonymous"\s*\/>/,'')
  await write(file,text)
}
await edit('lib/client/public-data.ts', "fetch('/api/locations'", "fetch('/public-data/locations.json'")
const noteIds = Object.fromEntries(notes.map(note=>[note.slug,explicitNoteAffiliateIds(getRenderableNoteBlocks(note))]))
await json('data/recovery-note-affiliates.json',noteIds)
let affiliates = (await readFile(path.join(SOURCE,'components/AffiliateCard.tsx'),'utf8')).replace(/\r\n/g,'\n')
affiliates = affiliates.replace("import {PublicCopy}", "import noteAffiliateIds from '@/data/recovery-note-affiliates.json'\nimport {PublicCopy}")
affiliates = affiliates.replace('    const data = Array.isArray(result?.links) ? result.links : []', `    const selectedIds = linkIds?.length ? linkIds : noteSlug ? (noteAffiliateIds as Record<string,number[]>)[noteSlug] || [] : []
    const data = (Array.isArray(result?.links) ? result.links : []).filter((item:AffiliateLink) => {
      if (provider && provider!=='all' && item.provider!==provider) return false
      if (selectedIds.length) return selectedIds.includes(item.id)
      if (noteSlug) return false
      return Boolean(locationId && item.location_id===locationId || regionId && item.region_id===regionId)
    }).slice(0,Math.min(Math.max(limit*3,12),50))`)
affiliates = affiliates.replace('`/api/affiliate-links?${params.toString()}`', "'/public-data/affiliate-links.json'")
const previewStart=affiliates.indexOf('      const entries = await Promise.all(')
const previewEnd=affiliates.indexOf('\n\n      if (!cancelled)',previewStart)
assert.ok(previewStart>0 && previewEnd>previewStart)
affiliates=affiliates.slice(0,previewStart)+`      const entries = links.map(link=>[link.id,{
        title:link.title || undefined, image:link.locations?.image_url || link.regions?.image_url || undefined,
        finalUrl:link.url,hostname:new URL(link.url).hostname,
      }] as const)`+affiliates.slice(previewEnd)
const trackingStart=affiliates.indexOf('    try {\n      const tracking = getAnalyticsTrackingContext()')
const trackingEnd=affiliates.indexOf("    window.open(link.url",trackingStart)
assert.ok(trackingStart>0 && trackingEnd>trackingStart)
affiliates=affiliates.slice(0,trackingStart)+affiliates.slice(trackingEnd)
await write('components/AffiliateCard.tsx',affiliates)
const publicLocations=new Map(db.locations.map(item=>[item.id,item]))
const publicRegions=new Map(db.regions.map(item=>[item.id,item]))
const links=db.affiliateLinks.filter(item=>!item.location_id||publicLocations.has(item.location_id)).map(item=>({...item,locations:publicLocations.get(item.location_id)||null,regions:publicRegions.get(item.region_id)||null}))
// Only the original API's joined public fields are exposed with an affiliate.
const joined=links.map(item=>({...item,locations:item.locations?{name:item.locations.name,name_cn:item.locations.name_cn,image_url:item.locations.image_url,images:item.locations.images}:null,
  regions:item.regions?{name:item.regions.name,name_cn:item.regions.name_cn,country:item.regions.country,image_url:item.regions.image_url}:null}))
await mkdir(path.join(SOURCE,'public/public-data'),{recursive:true})
await json('public/public-data/affiliate-links.json',{links:joined})
const fx=await load('fx.json')
await mkdir(path.join(SOURCE,'public/public-data/fx'),{recursive:true})
for(const base of Object.keys(fx.rates)) await json('public/public-data/fx/'+base+'.json',{date:fx.date,rates:Object.fromEntries(Object.entries(fx.rates).filter(([quote])=>quote!==base).map(([quote,rate])=>[quote,rate/fx.rates[base]]))})
await edit('components/GuideTripCost.tsx','`/api/fx?base=${sourceCurrency}`','`/public-data/fx/${sourceCurrency}.json`')
async function staticJsonRoute(route,body) {
  const directory=path.join(SOURCE,'app',route)
  await mkdir(directory,{recursive:true})
  await writeFile(path.join(directory,'route.ts'),`export const dynamic='force-static'\n${body}\n`)
}
await staticJsonRoute('public-data/locations.json',`import {resolvePublicData} from '@/lib/server/public-data-resolver'\nexport async function GET(){return Response.json(await resolvePublicData())}`)
for(const [file,key] of [['regions.json','regions.json'],['guides.json','guides.json'],['notes.json','notes.json'],['i18n/en/records.json','i18n/en/records.json'],['guide-trip-costs.json','guide-trip-costs.json']]) {
  await staticJsonRoute('public-data/'+file,`import {readPrivatePublicFeed} from '@/lib/server/public-read-source'\nexport async function GET(){return Response.json(await readPrivatePublicFeed('${key}'))}`)
}
await staticJsonRoute('public-data/spots/index.json',`export async function GET(){return Response.json({schemaVersion:1,slugs:${JSON.stringify(spotParams.map(item=>item.slug))}})}`)
await staticJsonRoute('public-data/spots/[file]',`import {getPublicSpotBySlug} from '@/lib/server/public-spot-resolver'
export function generateStaticParams(){return ${JSON.stringify(spotParams.map(item=>({file:item.slug+'.json'})))}}
export async function GET(_:Request,{params}:{params:{file:string}}){const value=await getPublicSpotBySlug(params.file.replace(/\\.json$/,''));if(!value)throw new Error('Static Spot missing');return Response.json({schemaVersion:1,spot:value.spot})}`)
await write('next.config.mjs',`export default {output:'export',images:{unoptimized:true},experimental:{cpus:2},eslint:{ignoreDuringBuilds:true},typescript:{ignoreBuildErrors:false}}\n`)
await write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2017',lib:['dom','dom.iterable','esnext'],allowJs:true,allowImportingTsExtensions:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,isolatedModules:true,jsx:'preserve',incremental:true,plugins:[{name:'next'}],paths:{'@/*':['./*']}},include:['next-env.d.ts','app/**/*.ts','app/**/*.tsx','pages/**/*.tsx','components/**/*.tsx','lib/**/*.ts','types/**/*.ts','.next/types/**/*.ts'],exclude:['node_modules']},null,2))
await edit('lib/supabase.ts','process.env.NEXT_PUBLIC_SUPABASE_URL!',"(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://static-recovery.invalid')")
await edit('lib/supabase.ts','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!',"(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'static-no-access')")
const manifest={mode:'full-public-static-recovery',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),capturedAt:sourceManifest.capturedAt,
  sourceFingerprint:fingerprint(sourceManifest.files),counts:sourceManifest.counts,routes:[...new Set([...routes,...englishPaths])].sort(),params,englishPaths,
  realtimeRevocation:false,formalMigration:'HOLD',admin:'PENDING',publication:'PENDING'}
await writeFile(path.join(RECOVERY,'manifest.json'),JSON.stringify(manifest,null,2))
console.log(JSON.stringify({prepared:true,routes:manifest.routes.length,counts:manifest.counts}))
