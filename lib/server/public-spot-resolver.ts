import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import {
  resolvePublicSpotSources,
  type PublicSpotIndexSnapshot,
  type PublicSpotLookup,
  type PublicSpotRecord,
  type PublicSpotSnapshot,
  type PublicSpotSource,
} from '@/lib/public-spot'

const SPOT_DETAIL_SELECT = `
  id,name,name_cn,category,latitude,longitude,image_url,images,description,tags,
  video_url,facebook_video_url,visit_date,opening_hours,price_info,address,region_id,
  regions:region_id (
    id,name,name_cn,country,description,image_url,parent_id,code
  )
`
const TIMEOUT_MS = 4000

export class PublicSpotUnavailableError extends Error {
  constructor(slug: string) {
    super(`Public spot data is temporarily unavailable for ${slug}.`)
    this.name = 'PublicSpotUnavailableError'
  }
}

export interface ResolvedPublicSpot {
  spot: PublicSpotRecord
  source: PublicSpotSource
}

async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function cdnBase() {
  return String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

async function readCdnSpot(slug: string): Promise<PublicSpotLookup> {
  const base = cdnBase()
  if (!base) return { status: 'not-found' }
  try {
    const indexResponse = await withTimeout(
      fetch(`${base}/public-data/spots/index.json`, {
        next: { revalidate: 3600, tags: ['public-spots'] },
      }),
      'Public spot CDN index'
    )
    if (indexResponse.ok) {
      const index = await indexResponse.json() as PublicSpotIndexSnapshot
      if (index?.schemaVersion !== 1 || !Array.isArray(index.slugs)) return { status: 'failure' }
      const id = extractLocationIdFromSlug(slug)
      const canonicalSlug = id ? index.slugs.find((value) => value.endsWith(`-${id}`)) : undefined
      if (!canonicalSlug) {
        const maxId = Math.max(0, ...index.slugs.map((value) => extractLocationIdFromSlug(value) || 0))
        return { status: 'not-found', authoritative: Boolean(id && id > maxId) }
      }
      slug = canonicalSlug
    } else if (indexResponse.status !== 404) {
      return { status: 'failure', error: new Error(`Public spot CDN index returned ${indexResponse.status}`) }
    }
    const response = await withTimeout(
      fetch(`${base}/public-data/spots/${encodeURIComponent(slug)}.json`, {
        next: { revalidate: 3600, tags: ['public-spots', `public-spot:${slug}`] },
      }),
      'Public spot CDN'
    )
    if (response.status === 404) return { status: 'not-found' }
    if (!response.ok) return { status: 'failure', error: new Error(`Public spot CDN returned ${response.status}`) }
    const payload = await response.json() as PublicSpotSnapshot
    return payload?.schemaVersion === 1 && payload.spot?.id ? { status: 'found', spot: payload.spot } : { status: 'failure' }
  } catch (error) {
    return { status: 'failure', error }
  }
}

async function readSupabaseSpot(slug: string): Promise<PublicSpotLookup> {
  const id = extractLocationIdFromSlug(slug)
  if (!id) return { status: 'not-found' }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { status: 'failure', error: new Error('Missing Supabase public environment variables') }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const result = await withTimeout(
      supabase
        .from('locations')
        .select(SPOT_DETAIL_SELECT)
        .eq('id', id)
        .eq('status', 'active')
        .maybeSingle(),
      'Supabase public spot'
    )
    if (result.error) return { status: 'failure', error: result.error }
    if (!result.data) return { status: 'not-found' }
    return { status: 'found', spot: { ...(result.data as unknown as PublicSpotRecord), slug } }
  } catch (error) {
    return { status: 'failure', error }
  }
}

async function readStaticSpot(slug: string): Promise<PublicSpotLookup> {
  try {
    const indexRaw = await readFile(path.join(process.cwd(), 'public-data', 'spots', 'index.json'), 'utf8')
    const index = JSON.parse(indexRaw) as PublicSpotIndexSnapshot
    if (index?.schemaVersion !== 1 || !Array.isArray(index.slugs)) return { status: 'failure' }
    const id = extractLocationIdFromSlug(slug)
    const canonicalSlug = id ? index.slugs.find((value) => value.endsWith(`-${id}`)) : undefined
    if (!canonicalSlug) {
      const maxId = Math.max(0, ...index.slugs.map((value) => extractLocationIdFromSlug(value) || 0))
      return { status: 'not-found', authoritative: Boolean(id && id > maxId) }
    }
    slug = canonicalSlug
    const raw = await readFile(path.join(process.cwd(), 'public-data', 'spots', `${slug}.json`), 'utf8')
    const payload = JSON.parse(raw) as PublicSpotSnapshot
    return payload?.schemaVersion === 1 && payload.spot?.id ? { status: 'found', spot: payload.spot } : { status: 'failure' }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { status: 'not-found' }
    return { status: 'failure', error }
  }
}

async function resolveSpotUncached(slug: string): Promise<ResolvedPublicSpot | null> {
  if (!extractLocationIdFromSlug(slug)) return null
  const result = await resolvePublicSpotSources({
    cdn: () => readCdnSpot(slug),
    supabase: () => readSupabaseSpot(slug),
    fallback: () => readStaticSpot(slug),
  })
  if (result.status === 'found') return { spot: result.spot, source: result.source }
  if (result.status === 'not-found') return null
  throw new PublicSpotUnavailableError(slug)
}

function resolveCached(slug: string) {
  return unstable_cache(
    () => resolveSpotUncached(slug),
    ['public-spot-v1', slug],
    { revalidate: 3600, tags: ['public-spots', `public-spot:${slug}`] }
  )()
}

export const getPublicSpotBySlug = cache(async (slug: string) => resolveCached(String(slug || '').trim()))

export async function readAuthoritativePublicSpotById(id: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing authoritative Supabase environment variables.')
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid Spot id.')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await withTimeout(
    supabase
      .from('locations')
      .select(SPOT_DETAIL_SELECT)
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle(),
    'Authoritative public spot'
  )
  if (result.error) throw new Error(result.error.message || 'Unable to read authoritative public spot.')
  if (!result.data) return null
  const row = result.data as unknown as Omit<PublicSpotRecord, 'slug'>
  const canonicalPath = await buildCanonicalLocationPath(row.name, row.id)
  return { ...row, slug: canonicalPath.replace('/spot/', '') } as PublicSpotRecord
}

export const PUBLIC_SPOT_SELECT = SPOT_DETAIL_SELECT
