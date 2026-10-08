import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'location-images'
const LEGACY_HOST = 'vrufunuomioczocdsoer.supabase.co'
const LEGACY_PREFIX = '/storage/v1/object/public/' + BUCKET + '/'
const CONFIRMATION = 'DELETE_VERIFIED_MIGRATED_GALLERY'
const BATCH_SIZE = 60

type ImageRow = { id: number; image_url?: string | null; images?: string[] | null }
type Candidate = { path: string; bytes: number; locationId: number; urls: string[] }

function isR2(value: unknown) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const publicBase = process.env.R2_PUBLIC_BASE_URL || ''
    const configuredHost = publicBase ? new URL(publicBase).hostname : ''
    return url.protocol === 'https:' && (url.hostname.endsWith('.r2.dev') || Boolean(configuredHost && url.hostname === configuredHost))
  } catch { return false }
}

function legacyGalleryPath(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.hostname !== LEGACY_HOST || !url.pathname.startsWith(LEGACY_PREFIX + 'gallery/')) return null
    const path = decodeURIComponent(url.pathname.slice(LEGACY_PREFIX.length))
    return /^gallery\/2026-(?:03|04|05)-\d{2}\/[a-zA-Z0-9._-]+$/.test(path) ? path : null
  } catch { return null }
}

async function authorize(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return { response: auth.response }
  const allowed = (process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  if (!allowed.length || !allowed.includes(String(auth.user.email || '').toLowerCase())) {
    return { response: NextResponse.json({ error: 'Storage cleanup requires an explicitly configured admin email.' }, { status: 403 }) }
  }
  return { response: null }
}

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw Error('Missing privileged storage configuration.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function fetchLivePublicSnapshots() {
  const base = String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  if (!base) throw Error('R2 public snapshot base is not configured; cleanup fails closed.')
  const paths = ['public-data/guides.json', 'public-data/notes.json', 'public-data/i18n/en/records.json']
  const docs = await Promise.all(paths.map(async path => {
    const response = await fetch(base + '/' + path, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw Error('Unable to verify public snapshot: ' + path + ' HTTP ' + response.status)
    return response.text()
  }))
  return docs.join('\n')
}

async function readAuthoritativeSnapshots(client: ReturnType<typeof storageClient>) {
  // Draft notes/guides and the live English localization manifest may contain
  // references not present in the public R2 snapshots. Never delete without
  // verifying their current authoritative versions as well.
  const bucket = client.storage.from(BUCKET)
  const pointerPairs = [
    { pointer: '_system/notes-latest.webp', prefix: '_system/notes/' },
    { pointer: '_system/guides-latest.webp', prefix: '_system/guides/' },
    { pointer: '_system/i18n/en/latest.webp', prefix: '_system/i18n/en/' },
  ]
  const docs = await Promise.all(pointerPairs.map(async ({ pointer, prefix }) => {
    const { data: pointerFile, error: pointerError } = await bucket.download(pointer)
    if (pointerError || !pointerFile) throw Error('Cannot verify authoritative content pointer: ' + pointer)
    const target = (await pointerFile.text()).trim()
    if (!target.startsWith(prefix) || !target.endsWith('.webp') || target === pointer ||
        target.includes('..') || target.includes('?')) {
      throw Error('Invalid authoritative content pointer: ' + pointer)
    }
    const { data, error } = await bucket.download(target)
    if (error || !data) throw Error('Cannot verify authoritative content: ' + target)
    return data.text()
  }))
  return docs.join('\n')
}

async function scanVerifiedCandidates() {
  const client = storageClient()
  const [backupResult, currentResult, regionsResult, packagesResult, optionsResult, snapshots, authoritativeSnapshots] = await Promise.all([
    client.from('locations_backup_before_r2').select('id,images').range(0, 999),
    client.from('locations').select('id,image_url,images').range(0, 999),
    client.from('regions').select('image_url').range(0, 999),
    client.from('travel_packages').select('cover_image,hero_image,hero_image_mobile,gallery').range(0, 999),
    client.from('travel_package_options').select('cover_image,hero_image,hero_image_mobile,gallery,brochure_image').range(0, 999),
    fetchLivePublicSnapshots(),
    readAuthoritativeSnapshots(client),
  ])
  for (const result of [backupResult, currentResult, regionsResult, packagesResult, optionsResult]) {
    if (result.error) throw Error('Cannot verify live references: ' + result.error.message)
  }

  const current = (currentResult.data || []) as ImageRow[]
  const byId = new Map(current.map(item => [Number(item.id), item]))
  const liveData = JSON.stringify({
    locations: current,
    regions: regionsResult.data,
    packages: packagesResult.data,
    options: optionsResult.data,
  }) + snapshots + authoritativeSnapshots

  const source = new Map<string, { locationId: number; urls: string[] }>()
  for (const old of backupResult.data || []) {
    const live = byId.get(Number(old.id))
    const oldImages = Array.isArray(old.images) ? old.images : []
    const newImages = Array.isArray(live?.images) ? live.images : []
    if (!live || !isR2(live.image_url) || !oldImages.length ||
        newImages.length < oldImages.length || !newImages.length ||
        !newImages.every(isR2)) continue

    for (const oldUrl of oldImages) {
      const path = legacyGalleryPath(oldUrl)
      if (!path || liveData.includes('/' + BUCKET + '/' + path)) continue
      source.set(path, { locationId: Number(old.id), urls: [live.image_url as string, ...newImages] })
    }
  }

  // Only delete source-linked files that demonstrably still exist in Storage.
  const byFolder = new Map<string, Set<string>>()
  for (const path of source.keys()) {
    const folder = path.slice(0, path.lastIndexOf('/'))
    const names = byFolder.get(folder) || new Set<string>()
    names.add(path.slice(folder.length + 1))
    byFolder.set(folder, names)
  }

  const candidates: Candidate[] = []
  await Promise.all([...byFolder].map(async ([folder, names]) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.storage.from(BUCKET).list(folder, { limit: 1000, offset })
      if (error) throw Error('Cannot list storage objects in ' + folder + ': ' + error.message)
      for (const file of data || []) {
        if (!file.name || !names.has(file.name)) continue
        const path = folder + '/' + file.name
        const verified = source.get(path)
        if (!verified) continue
        candidates.push({
          path,
          bytes: Number(file.metadata?.size || 0),
          locationId: verified.locationId,
          urls: verified.urls,
        })
      }
      if ((data || []).length < 1000) break
    }
  }))
  candidates.sort((a, b) => a.path.localeCompare(b.path))
  return { client, candidates }
}

async function verifyR2Urls(urls: string[]) {
  const unique = [...new Set(urls)]
  for (let i = 0; i < unique.length; i += 12) {
    const part = unique.slice(i, i + 12)
    const statuses = await Promise.all(part.map(async url => {
      try {
        const result = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(10000) })
        return result.ok
      } catch { return false }
    }))
    if (statuses.some(ok => !ok)) throw Error('At least one migrated R2 image failed verification. No files were removed.')
  }
}

export async function GET(request: Request) {
  const authorization = await authorize(request)
  if (authorization.response) return authorization.response
  try {
    const { candidates } = await scanVerifiedCandidates()
    return NextResponse.json({
      eligibleFiles: candidates.length,
      eligibleMB: Math.round(candidates.reduce((sum, item) => sum + item.bytes, 0) / 1048576 * 100) / 100,
      batchSize: BATCH_SIZE,
      excludedFolders: ['cover/', '_system/', 'imported/'],
      requiresConfirmation: CONFIRMATION,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const authorization = await authorize(request)
  if (authorization.response) return authorization.response
  const body = await request.json().catch(() => ({}))
  if (body.confirmation !== CONFIRMATION) return NextResponse.json({ error: 'Explicit confirmation required.' }, { status: 400 })
  try {
    const { client, candidates } = await scanVerifiedCandidates()
    const selected = candidates.slice(0, BATCH_SIZE)
    if (!selected.length) return NextResponse.json({ removed: 0, remaining: 0 })
    await verifyR2Urls(selected.flatMap(item => item.urls))
    const { data, error } = await client.storage.from(BUCKET).remove(selected.map(item => item.path))
    if (error) throw Error('Storage API deletion rejected: ' + error.message)
    const removed = Array.isArray(data) ? data.length : selected.length
    return NextResponse.json({ removed, remainingEstimate: Math.max(0, candidates.length - removed) })
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 503 })
  }
}
