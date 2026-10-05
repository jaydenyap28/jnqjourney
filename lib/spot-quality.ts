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

  // Indexing should reflect real editorial value, not a blunt word-count gate.
  // Long, first-hand pages with original media/video can qualify even when the
  // separate JnQ Experience field has not been backfilled yet. Shorter pages
  // stay noindex until they gain more useful editorial context.
  const strongFirstHandExperience = experienceLength >= 120 && media >= 2 && visited
  const substantialFirstHandPage =
    descriptionLength >= 300 &&
    media >= 2 &&
    visited &&
    hasPracticalInfo &&
    (hasVideo || media >= 4)
  const compactFirstHandPage =
    descriptionLength >= 220 &&
    media >= 4 &&
    visited &&
    hasVideo &&
    hasPracticalInfo
  const editedExperiencePage =
    descriptionLength >= 180 &&
    experienceLength >= 60 &&
    media >= 2
  const noteSupportedPage =
    hasRelatedNote &&
    descriptionLength >= 180 &&
    media >= 2

  const indexable =
    strongFirstHandExperience ||
    substantialFirstHandPage ||
    compactFirstHandPage ||
    editedExperiencePage ||
    noteSupportedPage

  const reasons: string[] = []
  if (descriptionLength < 180) reasons.push('正文少于 180 字')
  else if (descriptionLength < 220 && experienceLength < 60) reasons.push('正文仍偏短，缺少补充体验')
  else if (descriptionLength < 300 && media < 4 && experienceLength < 60) reasons.push('中等长度正文仍需更多原创素材或体验')

  if (media < 2) reasons.push('媒体素材少于 2 张')
  if (!visited && experienceLength < 120) reasons.push('缺少明确到访 / 体验信号')
  if (!indexable && !reasons.length) reasons.push('尚未达到当前内容质量门槛')

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
