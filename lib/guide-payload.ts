import { normalizeGuideDayRoute } from '@/lib/guide-attractions'
import type { TravelGuide } from '@/lib/guides'
import { canonicalGuideBudgetItems, canonicalTripCostCategory, guideBudgetMoneyToCents } from '@/lib/guide-budget'
import { normalizeUnassignedVisits } from '@/lib/guide-unassigned'

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizePositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeDayNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
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
    ...(Object.hasOwn(value || {}, 'published') ? { published: value.published === true } : {}),
    ...(value?.itineraryMode === 'unassigned' ? normalizeUnassignedVisits(value) : {}),
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
    // Segment Guides persist verifiedRoutes as their single itinerary source.
    // Editor-only day projections must never become a parallel authoritative array.
    days: value?.itineraryMode === 'segment'
      ? []
      : Array.isArray(value?.days)
      ? value.days
          .map((item: any) => ({
            dayLabel: String(item?.dayLabel || '').trim(),
            date: String(item?.date || '').trim() || undefined,
            title: String(item?.title || '').trim(),
            summary: String(item?.summary || '').trim(),
            highlights: normalizeStringArray(item?.highlights),
            attractions: normalizeGuideAttractions(item?.attractions),
            routeItems: normalizeGuideDayRoute(item?.routeItems),
            linkedSpots: Array.isArray(item?.attractions) ? [] : normalizeStringArray(item?.linkedSpots),
            videoUrl: String(item?.videoUrl || '').trim() || undefined,
            transport: String(item?.transport || '').trim() || undefined,
            transportPrice: String(item?.transportPrice || '').trim() || undefined,
            stay: String(item?.stay || '').trim() || undefined,
            stayNote: String(item?.stayNote || '').trim() || undefined,
            stayRangeStart: normalizeDayNumber(item?.stayRangeStart),
            stayRangeEnd: normalizeDayNumber(item?.stayRangeEnd),
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
    itineraryMode: ['segment', 'daily', 'unassigned'].includes(value?.itineraryMode) ? value.itineraryMode : undefined,
    itinerarySegments: Array.isArray(value?.itinerarySegments)
      ? value.itinerarySegments
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            dayStart: normalizeDayNumber(item?.dayStart),
            dayEnd: normalizeDayNumber(item?.dayEnd),
            dateStart: String(item?.dateStart || '').trim(),
            dateEnd: String(item?.dateEnd || '').trim(),
            city: String(item?.city || '').trim(),
            title: String(item?.title || '').trim(),
            summary: String(item?.summary || '').trim(),
            verifiedRoutes: Array.isArray(item?.verifiedRoutes)
              ? item.verifiedRoutes.map((route: any) => ({ dayNumber: normalizeDayNumber(route?.dayNumber), title: String(route?.title || '').trim(), summary: String(route?.summary || '').trim() || undefined, attractions: normalizeGuideAttractions(route?.attractions), routeItems: normalizeGuideDayRoute(route?.routeItems), linkedSpots: Array.isArray(route?.attractions) ? [] : normalizeStringArray(route?.linkedSpots), status: ['visited', 'reference', 'pending'].includes(String(route?.status)) ? route.status : undefined })).filter((route: any) => route.title)
              : [],
            referenceRoutes: Array.isArray(item?.referenceRoutes)
              ? item.referenceRoutes.map((route: any) => ({ dayNumber: normalizeDayNumber(route?.dayNumber), title: String(route?.title || '').trim(), summary: String(route?.summary || '').trim() || undefined, attractions: normalizeGuideAttractions(route?.attractions), routeItems: normalizeGuideDayRoute(route?.routeItems), linkedSpots: Array.isArray(route?.attractions) ? [] : normalizeStringArray(route?.linkedSpots), status: ['visited', 'reference', 'pending'].includes(String(route?.status)) ? route.status : undefined })).filter((route: any) => route.title)
              : [],
            accommodation: String(item?.accommodation || '').trim() || undefined,
            accommodationSpotName: String(item?.accommodationSpotName || '').trim() || undefined,
            accommodationStays: Array.isArray(item?.accommodationStays)
              ? item.accommodationStays
                  .map((stay: any) => ({
                    dayStart: normalizeDayNumber(stay?.dayStart),
                    dayEnd: normalizeDayNumber(stay?.dayEnd),
                    accommodationId: normalizePositiveNumber(stay?.accommodationId),
                    note: String(stay?.note || '').trim() || undefined,
                  }))
                  .filter((stay: any) => stay.dayStart !== undefined && stay.dayEnd !== undefined && stay.dayEnd >= stay.dayStart && stay.accommodationId)
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
          .filter((item: any) => item.id && item.dayStart !== undefined && item.dayEnd !== undefined && item.dayEnd >= item.dayStart && item.dateStart && item.dateEnd && item.city && item.title)
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
