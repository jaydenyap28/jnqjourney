import { normalizeGuidePayload } from '@/lib/guide-payload'
export { normalizeGuidePayload } from '@/lib/guide-payload'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { TravelGuide } from '@/lib/guides'
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
  // Clear the admin cache even when subsequent publication fails.
  cachedGuides = null
  lastFetchTime = 0
  {
    const { uploadPublicGuidesSnapshot } = await import('@/lib/server/r2')
    await uploadPublicGuidesSnapshot(Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), guides: normalized }), 'utf8'))
  }
  return normalized
}





