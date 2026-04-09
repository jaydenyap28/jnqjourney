import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { TravelGuide } from '@/lib/guides'

const guidesFilePath = path.join(process.cwd(), 'data', 'guides.json')

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

export function normalizeGuidePayload(value: any): TravelGuide {
  return {
    slug: String(value?.slug || '').trim(),
    aliases: normalizeStringArray(value?.aliases),
    sortDate: String(value?.sortDate || '').trim() || undefined,
    title: String(value?.title || '').trim(),
    shortTitle: String(value?.shortTitle || '').trim(),
    tagline: String(value?.tagline || '').trim(),
    summary: String(value?.summary || '').trim(),
    duration: String(value?.duration || '').trim(),
    budget: String(value?.budget || '').trim(),
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
    budgetItems: Array.isArray(value?.budgetItems)
      ? value.budgetItems
          .map((item: any) => ({
            label: String(item?.label || '').trim(),
            amount: String(item?.amount || '').trim(),
            note: String(item?.note || '').trim() || undefined,
          }))
          .filter((item: any) => item.amount)
      : [],
    days: Array.isArray(value?.days)
      ? value.days
          .map((item: any) => ({
            dayLabel: String(item?.dayLabel || '').trim(),
            title: String(item?.title || '').trim(),
            summary: String(item?.summary || '').trim(),
            highlights: normalizeStringArray(item?.highlights),
            linkedSpots: normalizeStringArray(item?.linkedSpots),
            videoUrl: String(item?.videoUrl || '').trim() || undefined,
            transport: String(item?.transport || '').trim() || undefined,
            transportPrice: String(item?.transportPrice || '').trim() || undefined,
            stay: String(item?.stay || '').trim() || undefined,
            stayNote: String(item?.stayNote || '').trim() || undefined,
            stayRangeStart: normalizePositiveNumber(item?.stayRangeStart),
            stayRangeEnd: normalizePositiveNumber(item?.stayRangeEnd),
          }))
          .filter((item: any) => item.dayLabel && item.title)
      : [],
    bestFor: normalizeStringArray(value?.bestFor),
    notes: normalizeStringArray(value?.notes),
    featuredSpotNames: normalizeStringArray(value?.featuredSpotNames),
    featuredAffiliateLinkIds: normalizeNumberArray(value?.featuredAffiliateLinkIds),
    sidebarAffiliateLinkIds: normalizeNumberArray(value?.sidebarAffiliateLinkIds),
    videoUrl: String(value?.videoUrl || '').trim() || undefined,
    facebookUrl: String(value?.facebookUrl || '').trim() || undefined,
  }
}

export async function readGuides() {
  try {
    const raw = await readFile(guidesFilePath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeGuidePayload)
      .filter((guide) => guide.slug && guide.title)
      .sort((left, right) => {
        const leftDate = left.sortDate ? Date.parse(left.sortDate) : NaN
        const rightDate = right.sortDate ? Date.parse(right.sortDate) : NaN
        const leftHasDate = Number.isFinite(leftDate)
        const rightHasDate = Number.isFinite(rightDate)

        if (leftHasDate && rightHasDate && leftDate !== rightDate) {
          return rightDate - leftDate
        }

        if (leftHasDate !== rightHasDate) {
          return leftHasDate ? -1 : 1
        }

        return 0
      })
  } catch {
    return []
  }
}

export async function readGuideBySlug(slug: string) {
  const guides = await readGuides()
  return guides.find((guide) => guide.slug === slug || (Array.isArray(guide.aliases) && guide.aliases.includes(slug))) || null
}

export async function saveGuides(guides: TravelGuide[]) {
  const normalized = guides.map(normalizeGuidePayload)
  await writeFile(guidesFilePath, JSON.stringify(normalized, null, 2), 'utf8')
}