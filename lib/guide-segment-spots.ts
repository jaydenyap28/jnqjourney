import type { GuideItinerarySegment } from '@/lib/guides'

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

// These are editorial aliases to existing Spot records, not fuzzy matching.
export const JIANGNAN_SEGMENT_SPOT_ALIASES: Record<string, string> = {
  '新天地': '上海新天地', '外滩': '上海外滩', '豫园': '豫园商城', '山塘街': '七里山塘',
  '乌镇西栅': '乌镇', '河坊街': '清河坊', '钱江新城': '钱江新城 城市阳台',
  '宏村': '宏村风景区', '卢村': '卢村观景台', '牛首山': '牛首山文化旅游区',
  '夫子庙': '夫子庙秦淮河', '秦淮河': '夫子庙秦淮河', '燕雀湖': '燕雀湖水杉林',
  '陵园路': '陵园路梧桐大道',
}

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function resolveSegmentSpot(guideSlug: string, segment: GuideItinerarySegment, name: string, spots: GuideSegmentSpot[]) {
  const canonicalName = guideSlug === 'china-jiangnan-autumn-15d14n' ? JIANGNAN_SEGMENT_SPOT_ALIASES[name] || name : name
  const target = normalize(canonicalName)
  const expectedRegions = (segment.city.includes('宏村') || segment.city.includes('黟县') ? ['宏村', '黟县'] : [segment.city]).map(normalize)
  const matches = spots.filter((spot) => {
    const exactName = normalize(spot.name) === target || normalize(spot.name_cn) === target
    const region = normalize(spot.regions?.name_cn || spot.regions?.name)
    return exactName && expectedRegions.includes(region)
  })
  return matches.length === 1 ? matches[0] : null
}

export function getGuideSpotCover(spot?: GuideSegmentSpot | null) {
  return spot?.image_url || spot?.images?.find(Boolean) || '/placeholder-image.jpg'
}
