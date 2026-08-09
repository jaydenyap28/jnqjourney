import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { TravelGuide } from '@/lib/guides'
import { canonicalGuideBudgetItems, canonicalTripCostCategory, guideBudgetMoneyToCents } from '@/lib/guide-budget'
import { jiangnanGuideDraft } from '@/lib/guide-drafts'
import staticGuideRecords from '@/data/guides.json'
import { mergeGuideCollections } from '@/lib/guide-collection'

const guidesFilePath = path.join(process.cwd(), 'data', 'guides.json')
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const STORAGE_PATH = '_system/guides.webp'
const LEGACY_STORAGE_PATH = '_system/guides.json'
const VERSIONED_STORAGE_DIR = '_system/guides'
const STORAGE_LATEST_POINTER_PATH = '_system/guides-latest.webp'
const LEGACY_STORAGE_LATEST_POINTER_PATH = '_system/guides-latest.txt'

// In-memory cache to reduce Supabase Storage egress
let cachedGuides: TravelGuide[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 60 * 1000 // 1 minute cache in memory

function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizePositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function normalizeCoordinate(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeBudgetItems(value: unknown) {
  if (!Array.isArray(value)) return []
  const items: TravelGuide['budgetItems'] = []
  for (const raw of value) {
    const label = canonicalTripCostCategory(raw?.label)
    const hasValues = String(raw?.label || '').trim() || String(raw?.amount || '').trim() || String(raw?.note || '').trim()
    if (!label && hasValues) throw new Error(`Unknown Guide budget category: ${String(raw?.label || '').trim() || '(blank)'}`)
    if (label) items.push({ label, amount: String(raw?.amount || '').trim(), currency: String(raw?.currency || '').trim() || undefined, note: String(raw?.note || '').trim() || undefined })
  }
  return items
}

function normalizeGuideAttractions(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  return value
    .map((item: any, index) => {
      const spotId = normalizePositiveNumber(item?.spotId)
      const spotSlug = String(item?.spotSlug || '').trim() || undefined
      const key = spotId ? `id:${spotId}` : spotSlug ? `slug:${spotSlug}` : ''
      if (!key || seen.has(key)) return null
      seen.add(key)
      return {
        spotId,
        spotSlug,
        displayOrder: Number.isFinite(Number(item?.displayOrder)) ? Number(item.displayOrder) : index,
        enabled: item?.enabled !== false,
        displayName: String(item?.displayName || '').trim() || undefined,
        guideSummary: String(item?.guideSummary || '').trim() || undefined,
        routeNote: String(item?.routeNote || '').trim() || undefined,
        tips: String(item?.tips || '').trim() || undefined,
      }
    })
    .filter(Boolean)
}

export function normalizeGuidePayload(value: any, options: { enforceBudgetTotal?: boolean } = {}): TravelGuide {
  const budget = String(value?.budget || '').trim()
  const budgetItems = normalizeBudgetItems(value?.budgetItems)
  const declaredBudgetCents = guideBudgetMoneyToCents(budget)
  const calculatedBudget = canonicalGuideBudgetItems(budgetItems)
  if (options.enforceBudgetTotal && declaredBudgetCents !== null && calculatedBudget.categories.length && declaredBudgetCents !== calculatedBudget.totalCents) {
    throw new Error(`Guide budget total (${budget}) does not equal its canonical category total (${calculatedBudget.totalCents} cents).`)
  }
  return {
    slug: String(value?.slug || '').trim(),
    aliases: normalizeStringArray(value?.aliases),
    sortDate: String(value?.sortDate || '').trim() || undefined,
    tripStartDate: String(value?.tripStartDate || '').trim() || undefined,
    tripEndDate: String(value?.tripEndDate || '').trim() || undefined,
    publishedAt: String(value?.publishedAt || '').trim() || undefined,
    title: String(value?.title || '').trim(),
    shortTitle: String(value?.shortTitle || '').trim(),
    tagline: String(value?.tagline || '').trim(),
    summary: String(value?.summary || '').trim(),
    duration: String(value?.duration || '').trim(),
    budget,
    budgetScope: ['per_person', 'per_room', 'per_group', 'total_trip'].includes(String(value?.budgetScope || ''))
      ? value.budgetScope
      : 'unspecified',
    travelStyle: String(value?.travelStyle || '').trim(),
    route: Array.isArray(value?.route)
      ? value.route
          .map((item: any) => ({
            stopLabel: String(item?.stopLabel || '').trim() || undefined,
            name: String(item?.name || '').trim(),
            summary: String(item?.summary || '').trim(),
            mapSpotName: String(item?.mapSpotName || '').trim() || undefined,
            latitude: normalizeCoordinate(item?.latitude),
            longitude: normalizeCoordinate(item?.longitude),
          }))
          .filter((item: any) => item.name)
      : [],
    coverAccent:
      String(value?.coverAccent || '').trim() ||
      'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.34),transparent_22%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))]',
    coverImage: String(value?.coverImage || '').trim() || undefined,
    highlightTags: normalizeStringArray(value?.highlightTags),
    heroBullets: normalizeStringArray(value?.heroBullets),
    budgetItems,
    days: Array.isArray(value?.days)
      ? value.days
          .map((item: any) => ({
            dayLabel: String(item?.dayLabel || '').trim(),
            date: String(item?.date || '').trim() || undefined,
            title: String(item?.title || '').trim(),
            summary: String(item?.summary || '').trim(),
            highlights: normalizeStringArray(item?.highlights),
            attractions: normalizeGuideAttractions(item?.attractions),
            linkedSpots: Array.isArray(item?.attractions) ? [] : normalizeStringArray(item?.linkedSpots),
            videoUrl: String(item?.videoUrl || '').trim() || undefined,
            transport: String(item?.transport || '').trim() || undefined,
            transportPrice: String(item?.transportPrice || '').trim() || undefined,
            stay: String(item?.stay || '').trim() || undefined,
            stayNote: String(item?.stayNote || '').trim() || undefined,
            stayRangeStart: normalizePositiveNumber(item?.stayRangeStart),
            stayRangeEnd: normalizePositiveNumber(item?.stayRangeEnd),
            gallery: Array.isArray(item?.gallery)
              ? item.gallery
                  .map((image: any) => ({
                    url: String(image?.url || '').trim(),
                    alt: String(image?.alt || '').trim(),
                    caption: String(image?.caption || '').trim() || undefined,
                    assetId: String(image?.assetId || image?.asset_id || '').trim() || undefined,
                    r2Key: String(image?.r2Key || image?.r2_key || '').trim() || undefined,
                  }))
                  .filter((image: any) => image.url && image.alt)
              : [],
            reminder: String(item?.reminder || '').trim() || undefined,
          }))
          .filter((item: any) => item.dayLabel && item.title)
      : [],
    itineraryMode: value?.itineraryMode === 'segment' ? 'segment' : value?.itineraryMode === 'daily' ? 'daily' : undefined,
    itinerarySegments: Array.isArray(value?.itinerarySegments)
      ? value.itinerarySegments
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            dayStart: normalizePositiveNumber(item?.dayStart),
            dayEnd: normalizePositiveNumber(item?.dayEnd),
            dateStart: String(item?.dateStart || '').trim(),
            dateEnd: String(item?.dateEnd || '').trim(),
            city: String(item?.city || '').trim(),
            title: String(item?.title || '').trim(),
            summary: String(item?.summary || '').trim(),
            verifiedRoutes: Array.isArray(item?.verifiedRoutes)
              ? item.verifiedRoutes.map((route: any) => ({ dayNumber: normalizePositiveNumber(route?.dayNumber), title: String(route?.title || '').trim(), summary: String(route?.summary || '').trim() || undefined, attractions: normalizeGuideAttractions(route?.attractions), linkedSpots: Array.isArray(route?.attractions) ? [] : normalizeStringArray(route?.linkedSpots), status: ['visited', 'reference', 'pending'].includes(String(route?.status)) ? route.status : undefined })).filter((route: any) => route.title)
              : [],
            referenceRoutes: Array.isArray(item?.referenceRoutes)
              ? item.referenceRoutes.map((route: any) => ({ dayNumber: normalizePositiveNumber(route?.dayNumber), title: String(route?.title || '').trim(), summary: String(route?.summary || '').trim() || undefined, attractions: normalizeGuideAttractions(route?.attractions), linkedSpots: Array.isArray(route?.attractions) ? [] : normalizeStringArray(route?.linkedSpots), status: ['visited', 'reference', 'pending'].includes(String(route?.status)) ? route.status : undefined })).filter((route: any) => route.title)
              : [],
            accommodation: String(item?.accommodation || '').trim() || undefined,
            accommodationSpotName: String(item?.accommodationSpotName || '').trim() || undefined,
            accommodationStays: Array.isArray(item?.accommodationStays)
              ? item.accommodationStays
                  .map((stay: any) => ({
                    dayStart: normalizePositiveNumber(stay?.dayStart),
                    dayEnd: normalizePositiveNumber(stay?.dayEnd),
                    accommodationId: normalizePositiveNumber(stay?.accommodationId),
                    note: String(stay?.note || '').trim() || undefined,
                  }))
                  .filter((stay: any) => stay.dayStart && stay.dayEnd && stay.dayEnd >= stay.dayStart && stay.accommodationId)
              : undefined,
            accommodationNote: String(item?.accommodationNote || '').trim() || undefined,
            transport: String(item?.transport || '').trim() || undefined,
            media: Array.isArray(item?.media) ? item.media.map((media: any) => ({ label: String(media?.label || '').trim(), url: String(media?.url || '').trim() || undefined })).filter((media: any) => media.label) : [],
            practicalTips: normalizeStringArray(item?.practicalTips),
            actualExperiences: normalizeStringArray(item?.actualExperiences),
            pendingItems: normalizeStringArray(item?.pendingItems),
            priceCandidateIds: normalizeStringArray(item?.priceCandidateIds),
            imageMatches: Array.isArray(item?.imageMatches) ? item.imageMatches.map((image: any) => ({ level: ['attraction', 'route', 'city'].includes(String(image?.level)) ? image.level : 'city', label: String(image?.label || '').trim(), note: String(image?.note || '').trim() || undefined })).filter((image: any) => image.label) : [],
            globalDayMappingStatus: ['confirmed', 'pending'].includes(String(item?.globalDayMappingStatus)) ? item.globalDayMappingStatus : undefined,
          }))
          .filter((item: any) => item.id && item.dayStart && item.dayEnd && item.dayEnd >= item.dayStart && item.dateStart && item.dateEnd && item.city && item.title)
      : [],
    bestFor: normalizeStringArray(value?.bestFor),
    notes: normalizeStringArray(value?.notes),
    featuredSpotNames: normalizeStringArray(value?.featuredSpotNames),
    featuredAffiliateLinkIds: normalizeNumberArray(value?.featuredAffiliateLinkIds),
    sidebarAffiliateLinkIds: normalizeNumberArray(value?.sidebarAffiliateLinkIds),
    klookWidgetCode: String(value?.klookWidgetCode || '').trim() || undefined,
    videoUrl: String(value?.videoUrl || '').trim() || undefined,
    facebookUrl: String(value?.facebookUrl || '').trim() || undefined,
  }
}

async function readLocalGuides() {
  try {
    const raw = await readFile(guidesFilePath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []
    return parsed.map((item: any) => normalizeGuidePayload(item)).filter((guide) => guide.slug && guide.title)
  } catch {
    return []
  }
}

async function writeLocalGuides(guides: TravelGuide[]) {
  try {
    await writeFile(guidesFilePath, JSON.stringify(guides, null, 2), 'utf8')
  } catch (error: any) {
    if (error?.code === 'EROFS' || error?.code === 'EPERM') return
    throw error
  }
}

async function readStorageGuides() {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return null

  try {
    const candidatePaths: string[] = []

    for (const pointerPath of [STORAGE_LATEST_POINTER_PATH, LEGACY_STORAGE_LATEST_POINTER_PATH]) {
      const { data: latestPointer } = await supabase.storage.from(STORAGE_BUCKET).download(pointerPath)
      if (!latestPointer) continue
      const latestPath = String(await latestPointer.text()).trim()
      if (latestPath) candidatePaths.push(latestPath)
      if (latestPath) break
    }

    const { data: versions } = await supabase.storage.from(STORAGE_BUCKET).list(VERSIONED_STORAGE_DIR, {
      limit: 20,
      sortBy: { column: 'name', order: 'desc' },
    })

    const versionedFiles = Array.isArray(versions)
      ? versions
          .map((item) => String(item?.name || '').trim())
          .filter((item) => item.endsWith('.webp') || item.endsWith('.json'))
      : []

    candidatePaths.push(...versionedFiles.map((name) => `${VERSIONED_STORAGE_DIR}/${name}`), STORAGE_PATH, LEGACY_STORAGE_PATH)

    let raw = ''
    const dedupedPaths = Array.from(new Set(candidatePaths.filter(Boolean)))
    for (const candidatePath of dedupedPaths) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(candidatePath)
      if (error || !data) continue
      raw = await data.text()
      if (raw) break
    }

    if (!raw) return null
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []

    return parsed.map((item: any) => normalizeGuidePayload(item)).filter((guide) => guide.slug && guide.title)
  } catch {
    return null
  }
}

async function writeStorageGuides(guides: TravelGuide[]) {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return

  const payload = Buffer.from(`${JSON.stringify(guides, null, 2)}\n`, 'utf8')
  const versionedPath = `${VERSIONED_STORAGE_DIR}/${Date.now()}.webp`
  const { error: versionedError } = await supabase.storage.from(STORAGE_BUCKET).upload(versionedPath, payload, {
    upsert: false,
    contentType: 'image/webp',
    cacheControl: '0',
  })

  if (versionedError) {
    throw new Error(versionedError.message || 'Failed to persist versioned guides to storage.')
  }

  const { error: latestPointerError } = await supabase.storage.from(STORAGE_BUCKET).upload(
    STORAGE_LATEST_POINTER_PATH,
    Buffer.from(versionedPath, 'utf8'),
    {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '0',
    }
  )

  if (latestPointerError) {
    throw new Error(latestPointerError.message || 'Failed to persist latest guides pointer.')
  }

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, payload, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '0',
  })

  if (error) {
    throw new Error(error.message || 'Failed to persist guides to storage.')
  }
}

function staticCompleteGuides() {
  return [...staticGuideRecords.map((item: any) => normalizeGuidePayload(item)), jiangnanGuideDraft]
}

/**
 * Storage is an overlay of administrator changes, never a visibility whitelist.
 * A persisted record therefore replaces its static counterpart as a whole,
 * which preserves explicit empty arrays/null-equivalent deletions instead of
 * reviving them from a static draft.
 */
export async function readGuides() {
  const now = Date.now()
  if (cachedGuides && now - lastFetchTime < CACHE_TTL) {
    return mergeGuideCollections(staticCompleteGuides(), cachedGuides)
  }

  const storageGuides = await readStorageGuides()
  if (storageGuides) {
    cachedGuides = storageGuides
    lastFetchTime = now
    try {
      await writeLocalGuides(storageGuides)
    } catch {}
    return mergeGuideCollections(staticCompleteGuides(), storageGuides)
  }

  const localGuides = await readLocalGuides()
  if (localGuides.length) {
    cachedGuides = localGuides
    lastFetchTime = now
  }
  return mergeGuideCollections(staticCompleteGuides(), localGuides)
}

export async function readGuideBySlug(slug: string) {
  const guides = await readGuides()
  return guides.find((guide) => guide.slug === slug || (Array.isArray(guide.aliases) && guide.aliases.includes(slug))) || null
}

export async function saveGuides(guides: TravelGuide[]) {
  const normalized = guides.map((guide) => normalizeGuidePayload(guide))
  try {
    await writeLocalGuides(normalized)
  } catch {}
  await writeStorageGuides(normalized)
  try {
    const { uploadPublicGuidesSnapshot } = await import('@/lib/server/r2')
    await uploadPublicGuidesSnapshot(Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), guides: normalized }), 'utf8'))
  } catch {}
  // Clear cache after save
  cachedGuides = null
  lastFetchTime = 0
  return normalized
}





