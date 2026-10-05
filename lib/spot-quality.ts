export type SpotQualityInput = {
  description?: string | null
  review?: string | null
  experience_zh?: string | null
  image_url?: string | null
  images?: string[] | null
  visit_date?: string | null
  video_url?: string | null
  facebook_video_url?: string | null
  address?: string | null
  opening_hours?: string | null
  price_info?: unknown
  related_note_slugs?: string[] | null
}

export type SpotQualityResult = {
  indexable: boolean
  score: number
  maxScore: number
  descriptionLength: number
  experienceLength: number
  mediaCount: number
  reasons: string[]
}

function cleanText(value?: string | null) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mediaCount(spot: SpotQualityInput) {
  const urls = new Set<string>()
  const cover = String(spot.image_url || '').trim()
  if (cover) urls.add(cover)
  for (const image of spot.images || []) {
    const url = String(image || '').trim()
    if (url) urls.add(url)
  }
  return urls.size
}

export function evaluateSpotQuality(spot: SpotQualityInput): SpotQualityResult {
  const descriptionLength = Math.max(
    cleanText(spot.description).length,
    cleanText(spot.review).length,
  )
  const experienceLength = cleanText(spot.experience_zh).length
  const media = mediaCount(spot)
  const visited = Boolean(String(spot.visit_date || '').trim())
  const hasVideo = Boolean(String(spot.video_url || spot.facebook_video_url || '').trim())
  const hasPracticalInfo = Boolean(
    String(spot.address || '').trim() ||
    String(spot.opening_hours || '').trim() ||
    spot.price_info
  )
  const hasRelatedNote = Boolean(spot.related_note_slugs?.length)

  let score = 0
  if (descriptionLength >= 300) score += 3
  else if (descriptionLength >= 220) score += 2
  else if (descriptionLength >= 180) score += 1

  if (experienceLength >= 120) score += 3
  else if (experienceLength >= 60) score += 2

  if (media >= 4) score += 2
  else if (media >= 2) score += 1

  if (visited) score += 1
  if (hasVideo) score += 1
  if (hasPracticalInfo) score += 1
  if (hasRelatedNote) score += 1

  const strongFirstHandExperience = experienceLength >= 120 && media >= 2 && visited
  const indexable = strongFirstHandExperience || (
    descriptionLength >= 180 &&
    media >= 2 &&
    score >= 8
  )

  const reasons: string[] = []
  if (descriptionLength < 180) reasons.push('正文少于 180 字')
  else if (descriptionLength < 300) reasons.push('正文不足 300 字')

  if (media < 2) reasons.push('媒体素材少于 2 张')
  if (!visited && experienceLength < 120) reasons.push('缺少明确到访 / 体验信号')
  if (score < 8 && !strongFirstHandExperience) reasons.push(`内容质量分 ${score}/12`)

  return {
    indexable,
    score,
    maxScore: 12,
    descriptionLength,
    experienceLength,
    mediaCount: media,
    reasons,
  }
}
