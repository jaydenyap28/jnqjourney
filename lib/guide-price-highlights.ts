export const GUIDE_PRICE_TYPES = [
  'actual_paid',
  'listed_at_the_time',
  'current_reference',
] as const

export const GUIDE_PRICE_UNITS = [
  'per_person',
  'per_vehicle',
  'per_room',
  'per_trip',
  'package',
  'unspecified',
] as const

export const GUIDE_PRICE_EVIDENCE_STATUSES = [
  'confirmed',
  'conflict',
  'missing',
] as const

export const GUIDE_PRICE_REVIEW_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const

export const GUIDE_PRICE_DISPLAY_TARGET_TYPES = [
  'attraction',
  'route',
  'day',
  'accommodation',
] as const

export const GUIDE_PRICE_CATEGORIES = [
  'admission',
  'activity',
  'transport',
  'accommodation',
  'food',
  'package',
  'other',
] as const

export type GuidePriceType = (typeof GUIDE_PRICE_TYPES)[number]
export type GuidePriceUnit = (typeof GUIDE_PRICE_UNITS)[number]
export type GuidePriceEvidenceStatus = (typeof GUIDE_PRICE_EVIDENCE_STATUSES)[number]
export type GuidePriceReviewStatus = (typeof GUIDE_PRICE_REVIEW_STATUSES)[number]
export type GuidePriceDisplayTargetType = (typeof GUIDE_PRICE_DISPLAY_TARGET_TYPES)[number]
export type GuidePriceCategory = (typeof GUIDE_PRICE_CATEGORIES)[number]

export interface GuidePriceSource {
  sourceType: 'obsidian_note' | 'moneybot_ledger' | 'video_script' | 'subtitle' | 'manual_review'
  sourceReference: string
  context: string
}

export interface GuidePriceHighlight {
  id: string
  titleZh: string
  titleEn?: string
  optionLabelZh?: string
  optionLabelEn?: string
  attractionSlug?: string
  displayTargetType: GuidePriceDisplayTargetType
  displayTargetId: string
  priceCategory: GuidePriceCategory
  topCardLayout?: 'standard' | 'wide_options'
  routeLabelZh?: string
  dayCostLabelZh?: string
  displayDetailsZh?: string[]
  guideSlug: string
  dayNumber: number
  priceType: GuidePriceType
  amountMinor: number
  currency: string
  unit: GuidePriceUnit
  quantity?: number | null
  travellerCount?: number | null
  paidDate?: string | null
  includes: string[]
  excludes: string[]
  note?: string
  sources: GuidePriceSource[]
  confidence: 'high' | 'medium' | 'low'
  evidenceStatus: GuidePriceEvidenceStatus
  reviewStatus: GuidePriceReviewStatus
  conflictGroup?: string | null
  conflictDetails?: string[]
  displayPriority: number
  isKeyPrice: boolean
  lastVerifiedAt: string
}

export type PublicGuidePriceHighlight = Omit<
  GuidePriceHighlight,
  | 'sources'
  | 'confidence'
  | 'evidenceStatus'
  | 'reviewStatus'
  | 'conflictGroup'
  | 'conflictDetails'
  | 'note'
  | 'priceType'
>

const priceUnitLabels: Record<GuidePriceUnit, string> = {
  per_person: '／人',
  per_vehicle: '／车',
  per_room: '／房',
  per_trip: '／程',
  package: '／套',
  unspecified: '',
}

export function formatPriceHighlightAmount(currency: string, amountMinor: number) {
  const normalized = Number.isSafeInteger(amountMinor) ? amountMinor : 0
  const sign = normalized < 0 ? '-' : ''
  const absolute = Math.abs(normalized)
  const whole = Math.floor(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  return `${String(currency || '').toUpperCase()} ${sign}${whole.toLocaleString('en-US')}.${fraction}`
}

export function guidePriceUnitLabel(value: GuidePriceUnit) {
  return priceUnitLabels[value]
}

export function isPublishableGuidePrice(record: GuidePriceHighlight) {
  const hasValidTarget =
    Boolean(record.displayTargetId) &&
    (record.displayTargetType !== 'attraction' ||
      Boolean(record.attractionSlug) && record.displayTargetId === record.attractionSlug)
  return Boolean(
    record.reviewStatus === 'approved' &&
      record.evidenceStatus === 'confirmed' &&
      record.amountMinor > 0 &&
      Number.isSafeInteger(record.amountMinor) &&
      record.currency &&
      record.unit !== 'unspecified' &&
      record.paidDate &&
      hasValidTarget &&
      record.guideSlug &&
      record.dayNumber > 0
  )
}

export function matchesAttractionPriceHighlight(
  record: Pick<GuidePriceHighlight, 'displayTargetType' | 'displayTargetId' | 'attractionSlug'>,
  attractionSlug: string
) {
  return (
    record.displayTargetType === 'attraction' &&
    Boolean(record.attractionSlug) &&
    record.displayTargetId === record.attractionSlug &&
    record.attractionSlug === attractionSlug
  )
}

export function isGuideDayCostPriceHighlight(
  record: Pick<GuidePriceHighlight, 'displayTargetType' | 'displayTargetId' | 'dayNumber' | 'guideSlug'>,
  guideSlug: string,
  dayNumber: number
) {
  return (
    record.guideSlug === guideSlug &&
    record.dayNumber === dayNumber &&
    ['route', 'day', 'accommodation'].includes(record.displayTargetType) &&
    Boolean(record.displayTargetId)
  )
}

export function toPublicGuidePriceHighlight(
  record: GuidePriceHighlight
): PublicGuidePriceHighlight | null {
  if (!isPublishableGuidePrice(record)) return null
  const {
    sources: _sources,
    confidence: _confidence,
    evidenceStatus: _evidenceStatus,
    reviewStatus: _reviewStatus,
    conflictGroup: _conflictGroup,
    conflictDetails: _conflictDetails,
    note: _note,
    priceType: _priceType,
    ...publicRecord
  } = record
  return publicRecord
}

export function attractionIdFromPriceSlug(slug: string) {
  const match = String(slug || '').match(/-(\d+)$/)
  return match ? Number(match[1]) : null
}
