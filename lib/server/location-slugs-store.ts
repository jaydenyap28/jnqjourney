import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { slugifyLocationName } from '@/lib/location-routing'

const LOCATION_SLUGS_PATH = path.join(process.cwd(), 'data', 'location-slugs.json')
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const STORAGE_PATH = '_system/location-slugs.webp'
const LEGACY_STORAGE_PATH = '_system/location-slugs.json'

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

function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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

async function readStorageLocationSlugMap(): Promise<LocationSlugMap | null> {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return null

  try {
    let raw = ''
    for (const candidatePath of [STORAGE_PATH, LEGACY_STORAGE_PATH]) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(candidatePath)
      if (error || !data) continue
      raw = await data.text()
      if (raw) break
    }
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [String(key), normalizeLocationSlug(String(value || ''))])
        .filter(([, value]) => value)
    )
  } catch {
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

export async function readLocationSlugMap(): Promise<LocationSlugMap> {
  const storageMap = await readStorageLocationSlugMap()
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
  const slugMap = await readLocationSlugMap()
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

export async function buildCanonicalLocationPath(name: string, id: number | string) {
  const customSlug = await readLocationSlugForId(id)
  const base = customSlug || slugifyLocationName(name) || 'spot'
  return `/spot/${base}-${id}`
}



