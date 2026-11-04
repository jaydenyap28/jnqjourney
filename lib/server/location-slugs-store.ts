import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { slugifyLocationName } from '@/lib/location-routing'

const LOCATION_SLUGS_PATH = path.join(process.cwd(), 'data', 'location-slugs.json')
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const STORAGE_PATH = '_system/location-slugs.webp'
const LEGACY_STORAGE_PATH = '_system/location-slugs.json'
export const PUBLIC_LOCATION_SLUGS_TAG = 'public-location-slugs'

export type LocationSlugMap = Record<string, string>

export function normalizeLocationSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getAdminSupabaseClient(fresh = false) {
  if (process.env.VERCEL_ENV === 'preview') return null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fresh ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) } } : {}),
  })
}

async function readLocalLocationSlugMap(): Promise<LocationSlugMap> {
  try {
    const raw = await fs.readFile(LOCATION_SLUGS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [String(key), normalizeLocationSlug(String(value || ''))])
        .filter(([, value]) => value)
    )
  } catch {
    return {}
  }
}

async function writeLocalLocationSlugMap(slugMap: LocationSlugMap) {
  try {
    await fs.mkdir(path.dirname(LOCATION_SLUGS_PATH), { recursive: true })
    await fs.writeFile(LOCATION_SLUGS_PATH, `${JSON.stringify(slugMap, null, 2)}\n`, 'utf8')
  } catch (error: any) {
    if (error?.code === 'EROFS' || error?.code === 'EPERM') return
    throw error
  }
}

async function readStorageLocationSlugMap(fresh = false, strict = false): Promise<LocationSlugMap | null> {
  const supabase = getAdminSupabaseClient(fresh)
  if (!supabase) return null

  try {
    let raw = ''
    for (const candidatePath of [STORAGE_PATH, LEGACY_STORAGE_PATH]) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(
        candidatePath, {}, strict ? { signal: AbortSignal.timeout(4000) } : undefined,
      )
      if (error || !data) {
        const missing = error && (error.status === 404 || error.statusCode === '404' || ('code' in error && error.code === 'NoSuchKey'))
        if (strict && !missing) {
          throw new Error('Public location slug map is unavailable.')
        }
        continue
      }
      raw = await data.text()
      if (strict && !raw) throw new Error('Public location slug map is empty.')
      if (raw) break
    }
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      if (strict) throw new Error('Invalid public location slug map.')
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [String(key), normalizeLocationSlug(String(value || ''))])
        .filter(([, value]) => value)
    )
  } catch (error) {
    if (strict) throw error
    return null
  }
}

async function writeStorageLocationSlugMap(slugMap: LocationSlugMap) {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return

  const payload = Buffer.from(`${JSON.stringify(slugMap, null, 2)}\n`, 'utf8')
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, payload, {
    upsert: true,
    contentType: 'image/webp',
  })

  if (error) {
    throw new Error(error.message || 'Failed to persist location slugs to storage.')
  }
}

export async function readLocationSlugMap(fresh = false): Promise<LocationSlugMap> {
  if (process.env.VERCEL_ENV === 'preview') return {}
  const storageMap = await readStorageLocationSlugMap(fresh)
  if (storageMap) {
    try {
      await writeLocalLocationSlugMap(storageMap)
    } catch {}
    return storageMap
  }

  return readLocalLocationSlugMap()
}

export async function readLocationSlugForId(id: number | string) {
  const slugMap = await readLocationSlugMap()
  return slugMap[String(id)] || ''
}

export async function saveLocationSlugForId(id: number | string, slug: string) {
  const slugMap = await readLocationSlugMap(true)
  const normalized = normalizeLocationSlug(slug)
  const key = String(id)

  if (normalized) slugMap[key] = normalized
  else delete slugMap[key]

  try {
    await writeLocalLocationSlugMap(slugMap)
  } catch {}
  await writeStorageLocationSlugMap(slugMap)

  return normalized
}

export async function buildCanonicalLocationPath(name: string, id: number | string, slugMap?: LocationSlugMap) {
  // Bulk callers supply one authoritative map rather than download it per row.
  const customSlug = slugMap ? slugMap[String(id)] || '' : await readLocationSlugForId(id)
  const base = customSlug || slugifyLocationName(name) || 'spot'
  return `/spot/${base}-${id}`
}

// Public routing reuses the normalized mapping without writing a local copy.
const readCachedPublicSlugMap = unstable_cache(async () =>
  (await readStorageLocationSlugMap(false, true)) ?? await readLocalLocationSlugMap(),
  ['public-location-slug-map-v1'],
  { revalidate: 3600, tags: [PUBLIC_LOCATION_SLUGS_TAG] },
)

async function buildPublicPath(name: string, id: number) {
  return buildCanonicalLocationPath(name, id, await readPublicLocationSlugMap())
}

export function readPublicLocationSlugMap(): Promise<LocationSlugMap> {
  return process.env.VERCEL_ENV === 'preview' ? Promise.resolve({}) : readCachedPublicSlugMap()
}

export const buildPublicCanonicalLocationPath = typeof cache === 'function' ? cache(buildPublicPath) : buildPublicPath



