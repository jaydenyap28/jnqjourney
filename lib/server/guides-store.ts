import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { TravelGuide } from '@/lib/guides'

const guidesFilePath = path.join(process.cwd(), 'data', 'guides.json')
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const STORAGE_PATH = '_system/guides.webp'
const LEGACY_STORAGE_PATH = '_system/guides.json'
const VERSIONED_STORAGE_DIR = '_system/guides'
const STORAGE_LATEST_POINTER_PATH = '_system/guides-latest.webp'
const LEGACY_STORAGE_LATEST_POINTER_PATH = '_system/guides-latest.txt'

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
            currency: String(item?.currency || '').trim() || undefined,
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
    return parsed.map(normalizeGuidePayload).filter((guide) => guide.slug && guide.title)
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

    return parsed.map(normalizeGuidePayload).filter((guide) => guide.slug && guide.title)
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

function sortGuides(guides: TravelGuide[]) {
  return [...guides].sort((left, right) => {
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
}

export async function readGuides() {
  const storageGuides = await readStorageGuides()
  if (storageGuides) {
    try {
      await writeLocalGuides(storageGuides)
    } catch {}
    return sortGuides(storageGuides)
  }

  return sortGuides(await readLocalGuides())
}

export async function readGuideBySlug(slug: string) {
  const guides = await readGuides()
  return guides.find((guide) => guide.slug === slug || (Array.isArray(guide.aliases) && guide.aliases.includes(slug))) || null
}

export async function saveGuides(guides: TravelGuide[]) {
  const normalized = guides.map(normalizeGuidePayload)
  try {
    await writeLocalGuides(normalized)
  } catch {}
  await writeStorageGuides(normalized)
  return normalized
}





