import type { GuideAttractionRef } from './guides'
import { resolvePublicImage } from './public-media.ts'

export interface GuideSegmentSpot {
  id: number
  name: string
  name_cn?: string | null
  category?: string | null
  latitude?: number | null
  longitude?: number | null
  image_url?: string | null
  images?: string[] | null
  region_id?: number | null
  regions?: { id?: number; name?: string | null; name_cn?: string | null; country?: string | null } | null
}

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

function spotSlug(name: string, id: number) {
  const base = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'spot'
  return `${base}-${id}`
}

function attractionKey(attraction: Pick<GuideAttractionRef, 'spotId' | 'spotSlug' | 'displayName'>) {
  return typeof attraction.spotId === 'number' ? `id:${attraction.spotId}` : attraction.spotSlug ? `slug:${attraction.spotSlug}` : `legacy:${String(attraction.displayName || '').trim().toLowerCase()}`
}

// Controlled compatibility aliases for pre-attractions Guide records. They are
// shared across all Guides and are never consulted once a stable ID is saved.
const LEGACY_GUIDE_SPOT_ALIASES: Record<string, string> = {
  '新天地': '上海新天地', '外滩': '上海外滩', '豫园': '豫园商城', '山塘街': '七里山塘',
  '乌镇西栅': '乌镇', '河坊街': '清河坊', '钱江新城': '钱江新城 城市阳台',
  '宏村': '宏村风景区', '南湖': '南湖书院', '卢村': '卢村观景台', '牛首山': '牛首山文化旅游区',
  '夫子庙': '夫子庙秦淮河', '秦淮河': '夫子庙秦淮河', '燕雀湖': '燕雀湖水杉林',
  '陵园路': '陵园路梧桐大道',
}

export function resolveGuideAttraction(attraction: GuideAttractionRef, spots: GuideSegmentSpot[]) {
  if (typeof attraction.spotId === 'number') return spots.find((spot) => spot.id === attraction.spotId) || null
  if (attraction.spotSlug) return spots.find((spot) => spotSlug(spot.name, spot.id) === attraction.spotSlug) || null

  // Legacy records can only use an exact, unique display-name match. New saves
  // always carry a stable ID and never enter this compatibility branch.
  const target = normalize(LEGACY_GUIDE_SPOT_ALIASES[String(attraction.displayName || '').trim()] || attraction.displayName)
  if (!target) return null
  const matches = spots.filter((spot) => normalize(spot.name) === target || normalize(spot.name_cn) === target)
  return matches.length === 1 ? matches[0] : null
}

export function guideAttractionMap(attractions: GuideAttractionRef[], spots: GuideSegmentSpot[]) {
  return Object.fromEntries(
    attractions
      .map((attraction) => [attractionKey(attraction), resolveGuideAttraction(attraction, spots)] as const)
      .filter((entry): entry is readonly [string, GuideSegmentSpot] => Boolean(entry[1]))
  )
}

export function getGuideSpotCover(spot?: Pick<GuideSegmentSpot, 'image_url' | 'images'> | null) {
  return resolvePublicImage({ cover: spot?.image_url, images: spot?.images || [], fallback: '/placeholder-image.jpg' })
}
