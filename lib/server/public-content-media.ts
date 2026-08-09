import type { TravelGuide } from '../guides.ts'
import type { LongformNote } from '../notes.ts'
import type { PublicLocation } from '../public-data.ts'
import { isR2PublicImage, resolvePublicImage } from '../public-media.ts'
import { publicSpotFromLocationSummary, type PublicSpotRecord } from '../public-spot.ts'

const GUIDE_SPECIFIC_R2_COVERS: Record<string, string> = {
  'china-jiangnan-autumn-15d14n': 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/general/general/china-jiangnan-autumn-15d14n/cover/2026-08-02/d70f7830-b1be-4c33-9dc7-da04f8757a2b-img_5709.webp',
}

// Exact legacy asset identities already present in R2. These are compatibility
// aliases for migrated JnQ media, not alternate content records.
const LEGACY_R2_LOCATION_MIRRORS: Array<{ token: string; locationId: number }> = [
  { token: '597774876', locationId: 511 },
  { token: '93069da3-8e1d-4e34-92ca-e9e8a4ab5709', locationId: 516 },
  { token: 'a82f3fac-b11b-4de9-abca-31017e7d0935', locationId: 317 },
]

function normalizeLookup(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function spotLookupKeys(spot: PublicSpotRecord) {
  return [spot.name, spot.name_cn, spot.slug, `${spot.name_cn || ''} / ${spot.name}`]
    .map(normalizeLookup)
    .filter(Boolean)
}

export function publicSpotCardsFromLocations(locations: PublicLocation[]) {
  return locations.map(publicSpotFromLocationSummary)
}

export function selectPublicSpotCards(
  locations: PublicLocation[],
  options: { ids?: number[]; slugs?: string[]; names?: string[]; regionIds?: number[] } = {}
) {
  const orderedIds = (options.ids || []).filter((value) => Number.isInteger(value) && value > 0)
  const orderedSlugs = (options.slugs || []).map(normalizeLookup).filter(Boolean)
  const orderedNames = (options.names || []).map(normalizeLookup).filter(Boolean)
  const orderedRegionIds = (options.regionIds || []).filter((value) => Number.isInteger(value) && value > 0)
  const ids = new Set(orderedIds)
  const slugs = new Set(orderedSlugs)
  const names = new Set(orderedNames)
  const regionIds = new Set(orderedRegionIds)
  const hasFilter = ids.size || slugs.size || names.size || regionIds.size

  const selected = publicSpotCardsFromLocations(locations).filter((spot) => {
    if (!hasFilter) return true
    if (ids.has(spot.id) || regionIds.has(Number(spot.region_id))) return true
    const keys = spotLookupKeys(spot)
    return keys.some((key) => slugs.has(key) || names.has(key))
  })
  if (!hasFilter) return selected
  const rank = (spot: PublicSpotRecord) => {
    const idIndex = orderedIds.indexOf(spot.id)
    if (idIndex >= 0) return idIndex
    const keys = spotLookupKeys(spot)
    const slugIndex = orderedSlugs.findIndex((value) => keys.includes(value))
    if (slugIndex >= 0) return 10_000 + slugIndex
    const nameIndex = orderedNames.findIndex((value) => keys.includes(value))
    if (nameIndex >= 0) return 20_000 + nameIndex
    const regionIndex = orderedRegionIds.indexOf(Number(spot.region_id))
    return regionIndex >= 0 ? 30_000 + regionIndex : 40_000 + spot.id
  }
  return selected.sort((left, right) => rank(left) - rank(right) || left.id - right.id)
}

function guideReferenceNames(guide: TravelGuide) {
  return [
    ...(guide.featuredSpotNames || []),
    ...guide.route.flatMap((stop) => stop.mapSpotName ? [stop.mapSpotName] : []),
    ...guide.days.flatMap((day) => [
      ...(day.linkedSpots || []),
      ...(day.attractions || []).flatMap((item) => item.displayName ? [item.displayName] : []),
      ...(day.stay ? [day.stay] : []),
    ]),
    ...(guide.itinerarySegments || []).flatMap((segment) => [
      ...(segment.accommodationSpotName ? [segment.accommodationSpotName] : []),
      ...segment.verifiedRoutes.flatMap((route) => [
        ...(route.linkedSpots || []),
        ...(route.attractions || []).flatMap((item) => item.displayName ? [item.displayName] : []),
      ]),
    ]),
  ]
}

function guideReferenceIds(guide: TravelGuide) {
  return [
    ...guide.days.flatMap((day) => (day.attractions || []).flatMap((item) => item.spotId ? [item.spotId] : [])),
    ...(guide.itinerarySegments || []).flatMap((segment) => [
      ...(segment.accommodationStays || []).map((stay) => stay.accommodationId),
      ...segment.verifiedRoutes.flatMap((route) => (route.attractions || []).flatMap((item) => item.spotId ? [item.spotId] : [])),
    ]),
  ]
}

function exactR2Mirror(coverImage: string | undefined, spots: PublicSpotRecord[]) {
  const raw = String(coverImage || '').toLowerCase()
  const mirror = LEGACY_R2_LOCATION_MIRRORS.find((item) => raw.includes(item.token))
  return mirror ? spots.find((spot) => spot.id === mirror.locationId)?.image_url || '' : ''
}

function coverNamedSpot(coverImage: string | undefined, spots: PublicSpotRecord[]) {
  const raw = String(coverImage || '')
  if (!raw) return null
  let basename = raw
  try {
    basename = decodeURIComponent(new URL(raw).pathname.split('/').pop() || '')
  } catch {}
  const key = normalizeLookup(basename.replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, ''))
  if (key.length < 4) return null
  return spots.find((spot) => spotLookupKeys(spot).some((name) => name.includes(key) || key.includes(name))) || null
}

export function resolveGuidePublicMedia(guide: TravelGuide, locations: PublicLocation[]) {
  const allSpots = publicSpotCardsFromLocations(locations)
  const referencedSpots = selectPublicSpotCards(locations, {
    ids: guideReferenceIds(guide),
    names: guideReferenceNames(guide),
  })
  const gallery = guide.days.flatMap((day) => (day.gallery || []).map((image) => image.url))
  const exactMirror = exactR2Mirror(guide.coverImage, allSpots)
  const namedSpot = coverNamedSpot(guide.coverImage, referencedSpots)
  const r2Fallbacks = [
    GUIDE_SPECIFIC_R2_COVERS[guide.slug],
    exactMirror,
    isR2PublicImage(guide.coverImage) ? guide.coverImage : '',
    ...gallery.filter(isR2PublicImage),
    namedSpot?.image_url,
    ...referencedSpots.map((spot) => spot.image_url).filter(isR2PublicImage),
  ]
  const coverImage = resolvePublicImage({
    cover: r2Fallbacks.find(Boolean),
    images: r2Fallbacks.slice(1),
    gallery,
    legacy: [guide.coverImage],
  })
  return coverImage === guide.coverImage ? guide : { ...guide, coverImage: coverImage || undefined }
}

export function resolveNotePublicMedia(note: LongformNote, locations: PublicLocation[]) {
  const relatedIds = [
    ...(note.relatedSpotIds || []),
    ...(note.blocks || []).flatMap((block) => block.spotId ? [block.spotId] : []),
  ]
  const relatedSpots = selectPublicSpotCards(locations, { ids: relatedIds })
  const blockImages = (note.blocks || []).flatMap((block) => [
    block.imageUrl,
    ...(block.images || []).map((image) => image.src),
  ])
  const coverImage = resolvePublicImage({
    cover: isR2PublicImage(note.coverImage) ? note.coverImage : '',
    images: relatedSpots.map((spot) => spot.image_url).filter(isR2PublicImage),
    gallery: blockImages.filter(isR2PublicImage),
    legacy: [note.coverImage, ...blockImages],
  })
  const spotById = new Map(relatedSpots.map((spot) => [spot.id, spot]))
  const blocks = (note.blocks || []).map((block) => {
    const spot = block.spotId ? spotById.get(block.spotId) : null
    if (!spot?.image_url || !isR2PublicImage(spot.image_url)) return block
    if ((block.type === 'spotImages' || block.type === 'gallery') && block.images?.length) {
      const r2Images = block.images.filter((image) => isR2PublicImage(image.src))
      if (r2Images.length) return r2Images.length === block.images.length ? block : { ...block, images: r2Images }
      const first = block.images[0]
      return { ...block, images: [{ ...first, src: spot.image_url }] }
    }
    if (block.type === 'image' && block.imageUrl && !isR2PublicImage(block.imageUrl)) {
      return { ...block, imageUrl: spot.image_url }
    }
    return block
  })
  if (coverImage === note.coverImage && blocks.every((block, index) => block === note.blocks[index])) return note
  return { ...note, coverImage: coverImage || undefined, blocks }
}
