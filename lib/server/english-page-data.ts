import priceHighlights from '@/data/guide-price-highlights.json'
import { readPublishedPackagesUncached } from '@/lib/server/travel-packages'
import { toPublicGuidePriceHighlight, type GuidePriceHighlight } from '@/lib/guide-price-highlights'
import type { LongformNote } from '@/lib/notes'
import type { TravelPackage } from '@/lib/server/travel-packages'
import type { PublicLocation, PublicRegion } from '@/lib/public-data'
import type { SearchLocation } from '@/components/PublicSearch'
import type { PublicSpotRecord } from '@/lib/public-spot'
import type { TravelGuide } from '@/lib/guides'
import { resolvePublicGuideTripCost, type PublicGuideTripCost } from '@/lib/guide-budget'
import { applyLocalization, localizationRecord, type TranslationStatus, type LocalizationSnapshot } from '@/lib/localization'
import { resolveEntityDisplayName } from '@/lib/entity-display-name'
import { resolvePublicRegionMedia } from '@/lib/public-region-media'
import { resolveGuidePublicMedia, resolveNotePublicMedia } from '@/lib/server/public-content-media'
import { readBilingualSnapshot, readBundledJson, readLocalizationSnapshot } from './localization-snapshot'

export interface EnglishPageData {
  priceHighlights?: NonNullable<ReturnType<typeof toPublicGuidePriceHighlight>>[]
  fullGuides?:TravelGuide[]
  notes?:LongformNote[]
  packages?:TravelPackage[]
  kind: 'home' | 'region' | 'regions' | 'guide' | 'guides' | 'spot' | 'search' | 'about' | 'fallback'
  path: string
  status: TranslationStatus
  title: string
  description: string
  locations: PublicLocation[]
  searchLocations?:SearchLocation[]
  regions: PublicRegion[]
  guides: Array<Pick<TravelGuide,'slug'|'title'|'duration'|'tagline'|'coverImage'> & { translationStatus: TranslationStatus }>
  region?: PublicRegion
  spot?: PublicSpotRecord & { title: string }
  guide?: TravelGuide
  tripCost?: PublicGuideTripCost
}
export function compactEnglishPageData(data:EnglishPageData):EnglishPageData {
  const result={...data}
  if(data.kind==='search') result.searchLocations=data.locations.map(({id,name,slug,region})=>({id,name,slug,region:region?{name:region.name}:null}))
  if(['search','regions','guides','about','fallback'].includes(data.kind)) result.locations=[]
  if(!['home','regions','search'].includes(data.kind)) result.regions=[]
  if(!['home','guides','spot','search'].includes(data.kind)) result.guides=[]
  return result
}
export async function readEnglishCollections() {
  const [locationData, regionData, guideData, localization, slugMap] = await Promise.all([
    readBilingualSnapshot<{locations:PublicLocation[]}>('locations.json', () => readBundledJson('public-data/locations.json'), x => Array.isArray((x as any)?.locations)),
    readBilingualSnapshot<{regions:PublicRegion[]}>('regions.json', () => readBundledJson('public-data/regions.json'), x => Array.isArray((x as any)?.regions)),
    readBilingualSnapshot<{guides:TravelGuide[]}>('guides.json', async () => { const raw = await readBundledJson<any>('data/guides.json'); return {guides:Array.isArray(raw)?raw:raw.guides} }, x => Array.isArray((x as any)?.guides)),
    readLocalizationSnapshot('en'),
    readBundledJson<Record<string,string>>('data/location-slugs.json'),
  ])
  const snapshotSlugs=Object.fromEntries(locationData.locations.map(location=>[location.id,location.slug]))
  const locations=locationData.locations.map(location=>slugMap[String(location.id)]?{...location,slug:`${slugMap[String(location.id)]}-${location.id}`}:location)
  return { locations, snapshotSlugs, regions: resolvePublicRegionMedia(regionData.regions,locations), guides: guideData.guides.map(guide=>resolveGuidePublicMedia(guide,locations)), localization }
}
function localizedGuide(guide: TravelGuide, snapshot: LocalizationSnapshot) {
  const result = applyLocalization(guide, localizationRecord(snapshot,'guide',guide.slug))
  const {slug,title,duration,tagline,coverImage}=result.value
  return {slug,title,duration,tagline,coverImage,translationStatus:result.status}
}

export async function englishPageData(parts: string[] = []): Promise<{data:EnglishPageData} | {redirect:string} | null> {
  if (parts[0] === 'regions') return {redirect:`/en/region${parts.length > 1 ? `/${parts.slice(1).join('/')}` : ''}`}
  const collection = await readEnglishCollections()
  const { locations, regions, guides, localization } = collection
  const path = `/${parts.join('/')}`
  const data: EnglishPageData = {kind:'home',path,status:'partial', title:'See the world together', description:'Travel maps, places, routes and stories, collected along the way by Jayden & Qing.', locations, regions, guides:guides.map(g=>localizedGuide(g,localization))}
  if (!parts.length || ['region','guide','spot'].includes(parts[0])) data.packages=await readPublishedPackagesUncached()
  if (!parts.length || ['guide','region'].includes(parts[0])) data.fullGuides=guides.map(g=>applyLocalization(g,localizationRecord(localization,'guide',g.slug)).value)
  if (!parts.length) {
    data.fullGuides=data.fullGuides!.slice(0,6)
    data.regions=regions.map(region=>applyLocalization(region,localizationRecord(localization,'region',region.id)).value)
    const notes=await readBilingualSnapshot<{notes:LongformNote[]}>('notes.json',()=>readBundledJson('data/notes.json').then(raw=>({notes:Array.isArray(raw)?raw:[]})),value=>Array.isArray((value as {notes?:unknown})?.notes))
    data.notes=notes.notes.filter(note=>note.published && note.slug && note.title).map(note=>resolveNotePublicMedia(note,locations))
    return {data}
  }
  if((parts.length===1 && ['contact','privacy','editorial-policy','affiliate-disclosure','copyright'].includes(parts[0])) || (parts.length<=2 && ['notes','packages'].includes(parts[0]))) {
    data.kind='fallback';data.status='missing';data.title='English translation in progress';data.description='This page is available in its original Chinese version.'
    return {data}
  }
  if(parts.join('/')==='region/malaysia') {
    data.kind='regions';data.title='Malaysia';data.regions=regions.filter(r=>r.country==='Malaysia');data.description='Explore regions in Malaysia.'
    return {data}
  }
  if (parts.length === 1 && ['region','guide','search','about'].includes(parts[0])) {
    data.kind = ({region:'regions',guide:'guides',search:'search',about:'about'} as const)[parts[0] as 'region'|'guide'|'search'|'about']
    data.title = ({regions:'Regions',guides:'Travel Guides',search:'Search',about:'About JnQ Journey'} as const)[data.kind]
    data.status = 'partial'
    return {data}
  }
  if (parts.length !== 2) return null
  const slug = parts[1]
  if (parts[0] === 'region') {
    const source = regions.find(r=>r.slug===slug || String(r.id)===slug.match(/-(\d+)$/)?.[1])
    if (!source) return null
    if (source.slug !== slug) return {redirect:`/en/region/${source.slug}`}
    const result = applyLocalization(source,localizationRecord(localization,'region',source.id))
    const ids = new Set([source.id])
    for(let i=0;i<regions.length;i++) for(const region of regions) if(region.parentId && ids.has(region.parentId)) ids.add(region.id)
    data.kind='region'; data.region=result.value; data.status=result.status; data.title=resolveEntityDisplayName(source,'en').primary; data.description=result.value.shortSummary || ''
    data.locations=locations.filter(l=>l.region && ids.has(l.region.id))
    return {data}
  }
  if (parts[0] === 'spot') {
    const summary = locations.find(l=>l.slug===slug || String(l.id)===slug.match(/-(\d+)$/)?.[1])
    if (!summary) return null
    if (summary.slug !== slug) return {redirect:`/en/spot/${summary.slug}`}
    const snapshotSlug=collection.snapshotSlugs[summary.id]
    const snapshot = await readBilingualSnapshot<{spot:PublicSpotRecord}>(`spots/${snapshotSlug}.json`,()=>readBundledJson(`public-data/spots/${snapshotSlug}.json`),x => (x as any)?.spot?.id===summary.id)
    const source = {...snapshot.spot,title:snapshot.spot.name}
    const result = applyLocalization(source,localizationRecord(localization,'spot',source.id))
    data.kind='spot'; data.spot=result.value; data.status=result.status; data.title=result.value.title!==source.name ? result.value.title : resolveEntityDisplayName(source,'en').primary
    data.description=result.value.description || result.value.review || ''
    data.locations=locations.filter(l=>l.id!==source.id && l.region?.id===source.region_id).slice(0,6)
    const matchingGuides=new Set(guides.filter(g=>[...(g.attractions||[]),...g.days.flatMap(d=>d.attractions||[]),...(g.itinerarySegments||[]).flatMap(s=>s.verifiedRoutes.flatMap(r=>r.attractions||[]))].some(ref=>ref.enabled!==false && ref.spotId===source.id) || g.accommodationStays?.some(s=>s.accommodationId===source.id)).map(g=>g.slug))
    data.guides=data.guides.filter(g=>matchingGuides.has(g.slug))
    return {data}
  }
  if (parts[0] === 'guide') {
    const source=guides.find(g=>g.slug===slug || g.aliases?.includes(slug))
    if (!source) return null
    if (source.slug!==slug) return {redirect:`/en/guide/${source.slug}`}
    const result=applyLocalization(source,localizationRecord(localization,'guide',source.slug))
    data.kind='guide'; data.guide=result.value; data.status=result.status; data.title=result.value.title; data.description=result.value.summary || result.value.tagline
    data.priceHighlights=(priceHighlights as GuidePriceHighlight[]).filter(item=>item.guideSlug===source.slug).sort((a,b)=>a.displayPriority-b.displayPriority).map(toPublicGuidePriceHighlight).filter((item):item is NonNullable<typeof item>=>Boolean(item))
    const refs = [...(source.attractions||[]),...source.days.flatMap(d=>d.attractions||[]),...(source.itinerarySegments||[]).flatMap(s=>s.verifiedRoutes.flatMap(r=>r.attractions||[]))]
    const ids=new Set([...refs.map(r=>r.spotId),...(source.accommodationStays||[]).map(s=>s.accommodationId),...(source.itinerarySegments||[]).flatMap(s=>(s.accommodationStays||[]).map(a=>a.accommodationId))])
    const legacyNames=new Set([...source.days.map(d=>d.stay),...(source.featuredSpotNames||[]),...source.days.flatMap(d=>d.linkedSpots||[])].filter(Boolean))
    data.locations=locations.filter(l=>ids.has(l.id)||legacyNames.has(resolveEntityDisplayName(l,'en').primary)||legacyNames.has(resolveEntityDisplayName(l,'zh').primary))
    const costs=await readBilingualSnapshot<{tripCosts:Array<{slug:string;tripCost:PublicGuideTripCost}>}>('guide-trip-costs.json',()=>readBundledJson('public-data/guide-trip-costs.json'),x=>Array.isArray((x as any)?.tripCosts))
    data.tripCost=costs.tripCosts.find(c=>c.slug===source.slug)?.tripCost || resolvePublicGuideTripCost(null,source.budgetItems)
    return {data}
  }
  return null
}
