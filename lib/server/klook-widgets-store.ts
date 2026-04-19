import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

export interface KlookWidgetRecord {
  id: string
  title: string
  description?: string
  htmlCode: string
  locationIds: number[]
  regionIds: number[]
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

const widgetsFilePath = path.join(process.cwd(), 'data', 'klook-widgets.json')
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const STORAGE_PATH = '_system/klook-widgets.webp'
const VERSIONED_STORAGE_DIR = '_system/klook-widgets'
const STORAGE_LATEST_POINTER_PATH = '_system/klook-widgets-latest.webp'

// In-memory cache to reduce Supabase Storage egress
let cachedWidgets: KlookWidgetRecord[] | null = null
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

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
}

export function normalizeKlookWidgetPayload(value: any): KlookWidgetRecord {
  const now = new Date().toISOString()
  return {
    id: String(value?.id || '').trim() || `widget-${Date.now()}`,
    title: String(value?.title || '').trim(),
    description: String(value?.description || '').trim() || '',
    htmlCode: String(value?.htmlCode || '').trim(),
    locationIds: normalizeNumberArray(value?.locationIds),
    regionIds: normalizeNumberArray(value?.regionIds),
    isActive: value?.isActive !== false,
    sortOrder: Number.isFinite(Number(value?.sortOrder)) ? Number(value.sortOrder) : 0,
    createdAt: String(value?.createdAt || '').trim() || now,
    updatedAt: String(value?.updatedAt || '').trim() || now,
  }
}

async function readLocalWidgets() {
  try {
    const raw = await readFile(widgetsFilePath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeKlookWidgetPayload).filter((item) => item.title && item.htmlCode)
  } catch {
    return []
  }
}

async function writeLocalWidgets(widgets: KlookWidgetRecord[]) {
  try {
    await writeFile(widgetsFilePath, JSON.stringify(widgets, null, 2), 'utf8')
  } catch (error: any) {
    if (error?.code === 'EROFS' || error?.code === 'EPERM') return
    throw error
  }
}

async function readStorageWidgets() {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return null

  try {
    const candidatePaths: string[] = []
    const { data: latestPointer } = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_LATEST_POINTER_PATH)
    if (latestPointer) {
      const latestPath = String(await latestPointer.text()).trim()
      if (latestPath) candidatePaths.push(latestPath)
    }

    const { data: versions } = await supabase.storage.from(STORAGE_BUCKET).list(VERSIONED_STORAGE_DIR, {
      limit: 20,
      sortBy: { column: 'name', order: 'desc' },
    })

    const versionedFiles = Array.isArray(versions)
      ? versions.map((item) => String(item?.name || '').trim()).filter((item) => item.endsWith('.webp'))
      : []

    candidatePaths.push(...versionedFiles.map((name) => `${VERSIONED_STORAGE_DIR}/${name}`), STORAGE_PATH)

    for (const candidatePath of Array.from(new Set(candidatePaths.filter(Boolean)))) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(candidatePath)
      if (error || !data) continue
      const raw = await data.text()
      if (!raw) continue
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
      if (!Array.isArray(parsed)) return []
      return parsed.map(normalizeKlookWidgetPayload).filter((item) => item.title && item.htmlCode)
    }

    return null
  } catch {
    return null
  }
}

async function writeStorageWidgets(widgets: KlookWidgetRecord[]) {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return

  const payload = Buffer.from(`${JSON.stringify(widgets, null, 2)}\n`, 'utf8')
  const versionedPath = `${VERSIONED_STORAGE_DIR}/${Date.now()}.webp`

  const { error: versionedError } = await supabase.storage.from(STORAGE_BUCKET).upload(versionedPath, payload, {
    upsert: false,
    contentType: 'image/webp',
    cacheControl: '0',
  })

  if (versionedError) throw new Error(versionedError.message || 'Failed to persist Klook widgets.')

  const { error: latestPointerError } = await supabase.storage.from(STORAGE_BUCKET).upload(
    STORAGE_LATEST_POINTER_PATH,
    Buffer.from(versionedPath, 'utf8'),
    { upsert: true, contentType: 'image/webp', cacheControl: '0' }
  )

  if (latestPointerError) throw new Error(latestPointerError.message || 'Failed to persist Klook widget pointer.')

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, payload, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '0',
  })

  if (error) throw new Error(error.message || 'Failed to persist Klook widgets.')
}

function sortWidgets(widgets: KlookWidgetRecord[]) {
  return [...widgets].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

export async function readKlookWidgets() {
  const now = Date.now()
  if (cachedWidgets && now - lastFetchTime < CACHE_TTL) {
    return sortWidgets(cachedWidgets)
  }

  const storageWidgets = await readStorageWidgets()
  if (storageWidgets) {
    cachedWidgets = storageWidgets
    lastFetchTime = now
    try {
      await writeLocalWidgets(storageWidgets)
    } catch {}
    return sortWidgets(storageWidgets)
  }

  const localWidgets = await readLocalWidgets()
  if (localWidgets.length) {
    cachedWidgets = localWidgets
    lastFetchTime = now
  }
  return sortWidgets(localWidgets)
}

export async function saveKlookWidgets(widgets: KlookWidgetRecord[]) {
  const normalized = widgets.map(normalizeKlookWidgetPayload)
  try {
    await writeLocalWidgets(normalized)
  } catch {}
  await writeStorageWidgets(normalized)
  // Clear cache after save
  cachedWidgets = null
  lastFetchTime = 0
  return normalized
}

export async function getActiveKlookWidgetsForTargets({
  locationId,
  regionId,
}: {
  locationId?: number | null
  regionId?: number | null
}) {
  const widgets = await readKlookWidgets()
  return widgets.filter((widget) => {
    if (!widget.isActive) return false
    if (locationId && widget.locationIds.includes(locationId)) return true
    if (regionId && widget.regionIds.includes(regionId)) return true
    return false
  })
}
