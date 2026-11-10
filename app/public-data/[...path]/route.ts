import { NextResponse } from 'next/server'
import { resolvePublicData, resolvePublicSnapshotBundleUncached } from '@/lib/server/public-data-resolver'
import { getPublicSpotBySlug } from '@/lib/server/public-spot-resolver'
import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { resolveGuidePublicMedia, resolveNotePublicMedia } from '@/lib/server/public-content-media'
import { readPrivatePublicFeed, publicServiceClient } from '@/lib/server/public-read-source'
import type { LocalizationSnapshot } from '@/lib/localization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}

export async function GET(request: Request, {params}: {params:{path:string[]}}) {
  const key=params.path.join('/')
  if (new URL(request.url).search || key.length>220 || !/^[a-zA-Z0-9/._-]+$/.test(key) || key.includes('..')) return new Response('Not Found',{status:404,headers})
  try {
    let value: unknown
    if (key==='locations.json' || key==='regions.json') {
      const data=await resolvePublicData()
      value=key==='locations.json'?{schemaVersion:1,locations:data.locations}:{schemaVersion:1,regions:data.regions}
    } else if (key==='guides.json' || key==='notes.json') {
      const {locations}=await resolvePublicData()
      value=key==='guides.json'?{schemaVersion:1,guides:(await readPublicGuides()).map(guide=>resolveGuidePublicMedia(guide,locations))}:
        {schemaVersion:1,notes:(await readPublicNotes()).map(note=>resolveNotePublicMedia(note,locations))}
    } else if (key==='spots/index.json') {
      value={schemaVersion:1,slugs:(await resolvePublicSnapshotBundleUncached()).spots.map(spot=>spot.slug)}
    } else if (/^spots\/[a-z0-9-]+\.json$/.test(key)) {
      const result=await getPublicSpotBySlug(key.slice(6,-5))
      if (!result) return new Response('Not Found',{status:404,headers})
      if (result.spot.slug!==key.slice(6,-5)) return new Response(null,{status:301,headers:{...headers,Location:`/public-data/spots/${result.spot.slug}.json`}})
      value={schemaVersion:1,spot:result.spot}
    } else if (key==='i18n/en/records.json') {
      const [snapshot,{locations,regions},guides,notes]=await Promise.all([readPrivatePublicFeed<LocalizationSnapshot>(key),resolvePublicData(),readPublicGuides(),readPublicNotes()])
      if (!Array.isArray(snapshot.records)) throw new Error('Invalid localization')
      const allowed: Record<string,Set<string>>={spot:new Set(locations.map(item=>String(item.id))),region:new Set(regions.map(item=>String(item.id))),guide:new Set(guides.map(item=>item.slug)),note:new Set(notes.map(item=>item.slug))}
      // Notes and Packages use entityType=page in the actual localization
      // contract. Retain current published Note aliases; never drop all Notes
      // translations by assuming an invented entityType=note.
      const notePages=notes.flatMap(note=>[note.slug,...(note.aliases||[])]).map(slug=>'notes/'+slug)
      const packages=await publicServiceClient().from('travel_packages').select('slug').eq('status','published').limit(201)
      if(packages.error||!Array.isArray(packages.data)||packages.data.length>200)throw new Error('Package translation eligibility unavailable')
      allowed.page=new Set([...notePages,...packages.data.map(item=>'packages/'+item.slug)])
      value={...snapshot,records:snapshot.records.filter(record=>allowed[record.entityType]?.has(String(record.entityId)))}
    } else if (key==='guide-trip-costs.json') {
      const [snapshot,guides]=await Promise.all([readPrivatePublicFeed<{schemaVersion:number;tripCosts:Array<{slug:string}>}>(key),readPublicGuides()])
      if (snapshot.schemaVersion!==1 || !Array.isArray(snapshot.tripCosts)) throw new Error('Invalid trip cost')
      value={...snapshot,tripCosts:snapshot.tripCosts.filter(item=>guides.some(guide=>guide.slug===item.slug))}
    } else return new Response('Not Found',{status:404,headers})
    return NextResponse.json(value,{headers})
  } catch {
    return NextResponse.json({error:{code:'PUBLIC_SOURCE_UNAVAILABLE',message:'Public source temporarily unavailable.'}},{status:503,headers})
  }
}
