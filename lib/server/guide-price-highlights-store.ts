import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

import {
  GUIDE_PRICE_EVIDENCE_STATUSES,
  GUIDE_PRICE_CATEGORIES,
  GUIDE_PRICE_DISPLAY_TARGET_TYPES,
  GUIDE_PRICE_REVIEW_STATUSES,
  GUIDE_PRICE_TYPES,
  GUIDE_PRICE_UNITS,
  type GuidePriceHighlight,
  type GuidePriceSource,
  toPublicGuidePriceHighlight,
} from '@/lib/guide-price-highlights'

const localFilePath = path.join(process.cwd(), 'data', 'guide-price-highlights.json')
const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const storagePath = '_system/guide-price-highlights.json'

function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function normalizeSource(value: any): GuidePriceSource | null {
  const sourceType = String(value?.sourceType || '')
  if (!['obsidian_note', 'moneybot_ledger', 'video_script', 'subtitle', 'manual_review'].includes(sourceType)) {
    return null
  }
  const sourceReference = String(value?.sourceReference || '').trim()
  const context = String(value?.context || '').trim()
  if (!sourceReference || !context) return null
  return {
    sourceType: sourceType as GuidePriceSource['sourceType'],
    sourceReference,
    context,
  }
}

export function normalizeGuidePriceHighlight(value: any): GuidePriceHighlight {
  const priceType = GUIDE_PRICE_TYPES.includes(value?.priceType) ? value.priceType : 'listed_at_the_time'
  const unit = GUIDE_PRICE_UNITS.includes(value?.unit) ? value.unit : 'unspecified'
  const evidenceStatus = GUIDE_PRICE_EVIDENCE_STATUSES.includes(value?.evidenceStatus)
    ? value.evidenceStatus
    : 'missing'
  const reviewStatus = GUIDE_PRICE_REVIEW_STATUSES.includes(value?.reviewStatus)
    ? value.reviewStatus
    : 'pending'
  const amountMinor = Number(value?.amountMinor)
  const dayNumber = Number(value?.dayNumber)
  const displayPriority = Number(value?.displayPriority)
  const displayTargetType = GUIDE_PRICE_DISPLAY_TARGET_TYPES.includes(value?.displayTargetType)
    ? value.displayTargetType
    : 'attraction'
  const priceCategory = GUIDE_PRICE_CATEGORIES.includes(value?.priceCategory)
    ? value.priceCategory
    : 'other'

  return {
    id: String(value?.id || '').trim(),
    titleZh: String(value?.titleZh || '').trim(),
    titleEn: String(value?.titleEn || '').trim() || undefined,
    optionLabelZh: String(value?.optionLabelZh || '').trim() || undefined,
    optionLabelEn: String(value?.optionLabelEn || '').trim() || undefined,
    attractionSlug: String(value?.attractionSlug || '').trim() || undefined,
    displayTargetType,
    displayTargetId: String(value?.displayTargetId || '').trim(),
    priceCategory,
    topCardLayout: value?.topCardLayout === 'wide_options' ? 'wide_options' : 'standard',
    routeLabelZh: String(value?.routeLabelZh || '').trim() || undefined,
    dayCostLabelZh: String(value?.dayCostLabelZh || '').trim() || undefined,
    displayDetailsZh: normalizeStringArray(value?.displayDetailsZh),
    guideSlug: String(value?.guideSlug || '').trim(),
    dayNumber: Number.isInteger(dayNumber) && dayNumber > 0 ? dayNumber : 0,
    priceType,
    amountMinor: Number.isSafeInteger(amountMinor) && amountMinor >= 0 ? amountMinor : 0,
    currency: String(value?.currency || '').trim().toUpperCase(),
    unit,
    quantity: Number.isInteger(Number(value?.quantity)) && Number(value.quantity) > 0 ? Number(value.quantity) : null,
    travellerCount:
      Number.isInteger(Number(value?.travellerCount)) && Number(value.travellerCount) > 0
        ? Number(value.travellerCount)
        : null,
    paidDate: String(value?.paidDate || '').trim() || null,
    includes: normalizeStringArray(value?.includes),
    excludes: normalizeStringArray(value?.excludes),
    note: String(value?.note || '').trim() || undefined,
    sources: Array.isArray(value?.sources)
      ? value.sources
          .map(normalizeSource)
          .filter((item: GuidePriceSource | null): item is GuidePriceSource => Boolean(item))
      : [],
    confidence: ['high', 'medium', 'low'].includes(String(value?.confidence || ''))
      ? value.confidence
      : 'low',
    evidenceStatus,
    reviewStatus,
    conflictGroup: String(value?.conflictGroup || '').trim() || null,
    conflictDetails: normalizeStringArray(value?.conflictDetails),
    displayPriority: Number.isFinite(displayPriority) ? displayPriority : 999,
    isKeyPrice: Boolean(value?.isKeyPrice),
    lastVerifiedAt: String(value?.lastVerifiedAt || '').trim(),
  }
}

export function validateGuidePriceHighlights(records: GuidePriceHighlight[]) {
  const seen = new Set<string>()
  for (const record of records) {
    if (!record.id || seen.has(record.id)) throw new Error('Price highlight IDs must be unique.')
    seen.add(record.id)
    if (!record.titleZh || !record.guideSlug || !record.displayTargetId || record.dayNumber < 1) {
      throw new Error(`Price highlight ${record.id} is missing its Guide or display target mapping.`)
    }
    if (record.displayTargetType === 'attraction' && record.displayTargetId !== record.attractionSlug) {
      throw new Error(`Attraction price highlight ${record.id} must exactly match its attraction slug.`)
    }
    if (!Number.isSafeInteger(record.amountMinor) || record.amountMinor < 0) {
      throw new Error(`Price highlight ${record.id} must use an integer amountMinor.`)
    }
    if (record.reviewStatus === 'approved') {
      if (record.evidenceStatus !== 'confirmed') {
        throw new Error(`Price highlight ${record.id} cannot be approved while evidence is unresolved.`)
      }
      if (!record.amountMinor || record.unit === 'unspecified' || !record.paidDate) {
        throw new Error(`Price highlight ${record.id} needs amount, unit, and date before approval.`)
      }
    }
  }
}

async function readLocalRecords() {
  const raw = await readFile(localFilePath, 'utf8')
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
  if (!Array.isArray(parsed)) return []
  return parsed.map(normalizeGuidePriceHighlight)
}

async function readStorageRecords() {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return null
  try {
    const { data, error } = await supabase.storage.from(storageBucket).download(storagePath)
    if (error || !data) return null
    const parsed = JSON.parse(String(await data.text()).replace(/^\uFEFF/, ''))
    return Array.isArray(parsed) ? parsed.map(normalizeGuidePriceHighlight) : []
  } catch {
    return null
  }
}

export async function readGuidePriceHighlights() {
  const storage = await readStorageRecords()
  const records = storage ?? (await readLocalRecords())
  validateGuidePriceHighlights(records)
  return records
}

export async function readGuidePriceHighlightsForAdmin(guideSlug: string) {
  return (await readGuidePriceHighlights())
    .filter((record) => record.guideSlug === guideSlug)
    .sort((left, right) => left.displayPriority - right.displayPriority)
}

export async function readApprovedGuidePriceHighlights(guideSlug: string) {
  return (await readGuidePriceHighlightsForAdmin(guideSlug))
    .map(toPublicGuidePriceHighlight)
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
}

export async function readApprovedPriceHighlightsForAttraction(attractionSlug: string) {
  return (await readGuidePriceHighlights())
    .filter(
      (record) =>
        record.displayTargetType === 'attraction' &&
        record.displayTargetId === attractionSlug &&
        record.attractionSlug === attractionSlug
    )
    .map(toPublicGuidePriceHighlight)
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
}

export async function replaceGuidePriceHighlights(
  guideSlug: string,
  incoming: GuidePriceHighlight[]
) {
  const normalized = incoming.map(normalizeGuidePriceHighlight)
  if (normalized.some((record) => record.guideSlug !== guideSlug)) {
    throw new Error('Every price highlight must match the requested Guide.')
  }
  validateGuidePriceHighlights(normalized)

  const current = await readGuidePriceHighlights()
  const merged = [
    ...current.filter((record) => record.guideSlug !== guideSlug),
    ...normalized,
  ]
  validateGuidePriceHighlights(merged)

  const payload = `${JSON.stringify(merged, null, 2)}\n`
  try {
    await writeFile(localFilePath, payload, 'utf8')
  } catch (error: any) {
    if (error?.code !== 'EROFS' && error?.code !== 'EPERM') throw error
  }

  const supabase = getAdminSupabaseClient()
  if (supabase) {
    const { error } = await supabase.storage.from(storageBucket).upload(
      storagePath,
      Buffer.from(payload, 'utf8'),
      { upsert: true, contentType: 'application/json', cacheControl: '0' }
    )
    if (error) throw new Error(error.message || 'Unable to persist Guide price highlights.')
  }

  return normalized
}
