import { revalidatePath, revalidateTag } from 'next/cache'
import { resolvePublicSnapshotBundleUncached, resolvePublicData } from '@/lib/server/public-data-resolver'
import { buildCanonicalLocationPath, readLocationSlugMap } from '@/lib/server/location-slugs-store'
import { uploadPublicDataSnapshot, uploadPublicSpotIndex, uploadPublicSpotSnapshot } from '@/lib/server/r2'
import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { planPublication } from '@/lib/publication-plan'

/** One authoritative collection read and one index write per Admin batch.
 * Hidden/deleted detail objects are retained; the index and live gate deny them.
 */
export async function publishLocationBatch(ids: number[]) {
  try { return await publishBatch(ids) }
  catch(error) {
    // A failed authoritative read also needs publication retry, not merely tag
    // invalidation. Never retry the already completed database write.
    if(error && typeof error==='object' && !('stage' in error)) Object.assign(error,{stage:'snapshot',change:{kind:'spot',ids}})
    throw error
  }
}

async function publishBatch(ids: number[]) {
  const affected = new Set(ids)
  const previous = await resolvePublicData()
  const previousLocations = previous.locations
  const [guides, notes] = await Promise.all([readPublicGuides(), readPublicNotes()])
  const priorPlan = planPublication({ kind: 'spot', ids: [...affected] }, { ...previous, guides, notes })
  const [{ data, spots }, slugMap] = await Promise.all([resolvePublicSnapshotBundleUncached(), readLocationSlugMap(true)])
  const locations = await Promise.all(data.locations.map(async location => ({ ...location,
    slug: (await buildCanonicalLocationPath(location.name, location.id, slugMap)).slice('/spot/'.length),
  })))
  const byId = new Map(locations.map(location => [location.id, location]))
  const source = { type: 'supabase-admin-location-batch', generatedAt: new Date().toISOString() }
  const body = (value: Record<string, unknown>) => Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, ...value })}\n`)
  // Details must be available before the collection/index advertise them.
  const completed: string[] = []
  const publishedSpots: Array<{id:number;slug:string;url:unknown}> = []
  let locationsUrl: unknown, indexUrl: unknown
  try {
  for (const spot of spots) {
    const location = byId.get(spot.id)
    if (affected.has(spot.id) && location) { const url=await uploadPublicSpotSnapshot(location.slug, body({ spot: { ...spot, slug: location.slug } })); publishedSpots.push({id:spot.id,slug:location.slug,url}); completed.push(`spots/${location.slug}`) }
  }
  locationsUrl = await uploadPublicDataSnapshot('locations.json', body({ locations }))
  completed.push('locations.json')
  indexUrl = await uploadPublicSpotIndex(body({ slugs: locations.map(location => location.slug).sort() }))
  completed.push('spots/index.json')
  } catch (cause) {
    throw Object.assign(new Error(`Snapshot publication failed after ${completed.length} objects; retry publication only`, { cause }), {
      stage: 'snapshot', completed, change: { kind: 'spot', ids: [...affected], previousPaths: priorPlan.paths, previousEnglishPaths: priorPlan.englishPaths },
    })
  }
  const indexChanged = previousLocations.map(l=>l.slug).sort().join('\n') !== locations.map(l=>l.slug).sort().join('\n')
  for (const tag of ['public-data', 'public-locations', ...(indexChanged ? ['public-spots'] : []), 'bilingual:locations.json']) revalidateTag(tag)
  for (const id of affected) {
    revalidateTag(`public-spot:spot-${id}`)
    revalidatePath(`/spot/spot-${id}`)
    revalidatePath(`/api/spots/spot-${id}`)
  }
  for (const location of locations.filter(location => affected.has(location.id))) {
    revalidateTag(`public-spot:${location.slug}`)
    revalidateTag(`bilingual:spots/${location.slug}.json`)
    revalidatePath(`/spot/${location.slug}`)
    revalidatePath(`/api/spots/${location.slug}`)
  }
  for (const route of ['/', '/api/locations', '/sitemap.xml']) revalidatePath(route)
  return { ids: [...affected], generatedAt: source.generatedAt, previousLocations, spots:publishedSpots, locationsUrl,indexUrl, recovery:{previousPaths:priorPlan.paths,previousEnglishPaths:priorPlan.englishPaths} }
}
