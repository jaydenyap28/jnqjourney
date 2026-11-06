import 'server-only'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath, revalidateTag } from 'next/cache'

import locationSlugMap from '@/data/location-slugs.json'
import { localizationRecord, type LocalizationSnapshot } from '@/lib/localization'
import type { PublicLocation } from '@/lib/public-data'
import { publicSpotFromSupabaseRow, type PublicSpotIndexSnapshot, type PublicSpotSnapshot } from '@/lib/public-spot'
import { confirmedSpotAliases, planSpotInvalidation, resolveSpotSnapshotSlug } from '@/lib/spot-media-revalidation'
import { isSpotNoteETag, isSpotNoteVersion, SpotNotePublicationError, type SpotNoteState, type SpotNoteStore } from '@/lib/spot-note-publication'
import { buildCanonicalLocationPath, buildPublicCanonicalLocationPath, readAuthoritativeLocationSlugMap } from './location-slugs-store'
import { getPublicSpotBySlug, PUBLIC_SPOT_SELECT } from './public-spot-resolver'
import { assertR2Env } from './r2'

export const SPOT_NOTE_PUBLICATION_ORIGIN = 'https://www.jnqjourney.com'
const PREFIX = 'public-data/'
const timeout = () => AbortSignal.timeout(6000)
const freshFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error' })
const detailKey = (slug: string) => `spots/${slug}.json`
type SpotRow = SpotNoteState['row']

function sameProtectedFields(first: PublicSpotSnapshot['spot'], second: PublicSpotSnapshot['spot']) {
  const protectedFields = (spot: typeof first) => Object.fromEntries(
    Object.entries(spot).filter(([key]) => !['slug', 'related_note_slugs'].includes(key)),
  )
  return isDeepStrictEqual(protectedFields(first), protectedFields(second))
}

export function createSpotNotePublicationStore(authorization: string): SpotNoteStore {
  assertR2Env()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const cdn = (process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  if (!url || !key || !cdn.startsWith('https://')) throw new Error('Publication stores are unavailable.')
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: freshFetch },
  })
  const bucket = process.env.R2_BUCKET_NAME!
  const r2 = new S3Client({
    region: 'auto', maxAttempts: 1,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  })

  async function readObject<T>(key: string) {
    const object = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: PREFIX + key }), { abortSignal: timeout() })
    if (!object.Body) throw new Error('Missing published object body.')
    return { value: JSON.parse(await object.Body.transformToString()) as T, object }
  }

  async function readCdn<T>(key: string): Promise<T> {
    const response = await freshFetch(`${cdn}/${PREFIX}${key}?publication=${randomUUID()}`, {
      headers: { 'Cache-Control': 'no-cache' }, signal: timeout(),
    })
    if (!response.ok) throw new SpotNotePublicationError('public_snapshot_unavailable', response.status === 404 ? 409 : 503)
    return response.json()
  }

  async function readRow(id: number) {
    const result = await db.from('locations').select(`${PUBLIC_SPOT_SELECT},status,updated_at,redirect_url,redirect_type`)
      .eq('id', id).abortSignal(timeout()).maybeSingle()
    if (result.error) throw new Error('Authoritative Spot read failed.')
    const row = result.data as unknown as SpotRow | null
    if (row?.id !== id || row.status !== 'active' || ![null, 'published'].includes(row.publication_status!)
      || row.redirect_url !== null || !isSpotNoteVersion(row.updated_at)) {
      throw new SpotNotePublicationError('spot_not_published_or_redirected')
    }
    return row
  }

  async function indexedSlug(id: number) {
    const [origin, publicIndex] = await Promise.all([
      readObject<PublicSpotIndexSnapshot>('spots/index.json'), readCdn<PublicSpotIndexSnapshot>('spots/index.json'),
    ])
    try {
      const slug = resolveSpotSnapshotSlug(id, origin.value)
      if (resolveSpotSnapshotSlug(id, publicIndex) !== slug) throw new Error('Index mismatch.')
      return slug
    } catch {
      throw new SpotNotePublicationError('spot_index_unverified')
    }
  }

  async function readDetail(snapshotSlug: string) {
    try {
      return await readObject<PublicSpotSnapshot>(detailKey(snapshotSlug))
    } catch (error) {
      if (error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
        throw new SpotNotePublicationError('indexed_spot_snapshot_missing')
      }
      throw error
    }
  }

  async function read(id: number, noteSlug: string): Promise<SpotNoteState> {
    const [row, snapshotSlug] = await Promise.all([readRow(id), indexedSlug(id)])
    const { value: snapshot, object } = await readDetail(snapshotSlug)
    if (snapshot?.schemaVersion !== 1 || snapshot.spot?.id !== id || snapshot.spot.slug !== snapshotSlug
      || !isSpotNoteETag(object.ETag) || (object.ContentEncoding && object.ContentEncoding !== 'identity')) {
      throw new SpotNotePublicationError('spot_snapshot_identity_invalid')
    }

    const [map, publicDetail, locations, localization, notes, rendered] = await Promise.all([
      readAuthoritativeLocationSlugMap(),
      readCdn<PublicSpotSnapshot>(detailKey(snapshotSlug)),
      readCdn<{ locations: PublicLocation[] }>('locations.json'),
      readCdn<LocalizationSnapshot>('i18n/en/records.json'),
      readCdn<{ schemaVersion: number; notes: { slug: string; published: boolean; title: string }[] }>('notes.json'),
      getPublicSpotBySlug(snapshotSlug),
    ])
    const matches = notes?.schemaVersion === 1 && Array.isArray(notes.notes) ? notes.notes.filter(note => note?.slug === noteSlug) : []
    if (matches.length !== 1 || matches[0].published !== true || typeof matches[0].title !== 'string' || !matches[0].title.trim()) {
      throw new SpotNotePublicationError('note_not_published_canonical', 422)
    }
    if (!isDeepStrictEqual(snapshot, publicDetail) || rendered?.source !== 'cdn-cache'
      || rendered.spot.slug !== snapshotSlug || !sameProtectedFields(rendered.spot, snapshot.spot)) {
      throw new SpotNotePublicationError('public_spot_source_mismatch')
    }

    const canonicalPath = await buildCanonicalLocationPath(row.name, id, map)
    const canonicalSlug = canonicalPath.slice('/spot/'.length)
    if (await buildPublicCanonicalLocationPath(rendered.spot.name, id) !== canonicalPath) {
      throw new SpotNotePublicationError('public_spot_canonical_mismatch')
    }
    const summaries = Array.isArray(locations?.locations) ? locations.locations.filter(item => item.id === id) : []
    if (summaries.length !== 1 || localization?.schemaVersion !== 1 || localization.locale !== 'en' || !Array.isArray(localization.records)) {
      throw new SpotNotePublicationError('english_spot_source_unverified')
    }
    const summary = summaries[0]
    // Mirrors Pages ISR's canonical and source lookup without loading unrelated collections.
    const englishBase = (locationSlugMap as Record<string, string>)[String(id)]
    const englishSlug = englishBase ? `${englishBase}-${id}` : summary.slug
    const record = localizationRecord(localization, 'spot', id)
    const englishSnapshot = String(record?.source?.url || '').match(/\/spots\/([^/?]+)\.json(?:[?#].*)?$/)?.[1] || summary.slug
    if (englishSlug !== canonicalSlug || englishSnapshot !== snapshotSlug) throw new SpotNotePublicationError('english_spot_source_mismatch')

    const normalized = publicSpotFromSupabaseRow(row, summary, row.regions)
    if (!sameProtectedFields(normalized, snapshot.spot)) throw new SpotNotePublicationError('spot_protected_fields_differ')
    // Validate every invalidation identity before authorizing any data changes.
    planSpotInvalidation(id, canonicalSlug, snapshotSlug, snapshot, confirmedSpotAliases(map, snapshot.spot))
    return { row, snapshot, receipt: { version: row.updated_at, etag: object.ETag, canonicalSlug, snapshotSlug, relatedNoteSlugs: snapshot.spot.related_note_slugs! } }
  }

  return {
    read,
    async append({ row }, next) {
      let query = db.from('locations').update({ related_note_slugs: next }).eq('id', row.id)
        .eq('updated_at', row.updated_at).eq('status', 'active').is('redirect_url', null)
      query = row.publication_status === null ? query.is('publication_status', null) : query.eq('publication_status', 'published')
      query = row.related_note_slugs === null
        ? query.is('related_note_slugs', null)
        : query.filter('related_note_slugs', 'eq', `{${row.related_note_slugs!.join(',')}}`)
      const result = await query.select('updated_at').abortSignal(timeout()).maybeSingle()
      if (result.error || (result.data && !isSpotNoteVersion(result.data.updated_at))) throw new Error('Spot update could not be verified.')
      return result.data?.updated_at ?? null
    },
    async publish({ row, snapshot, receipt }, next) {
      const [currentSlug, { object }, currentRow] = await Promise.all([
        indexedSlug(row.id), readDetail(receipt.snapshotSlug), readRow(row.id),
      ])
      if (currentSlug !== receipt.snapshotSlug || currentRow.updated_at !== receipt.version
        || !isDeepStrictEqual(currentRow, row) || object.ETag !== receipt.etag
        || (object.ContentEncoding && object.ContentEncoding !== 'identity')) {
        throw new SpotNotePublicationError('database_saved_publication_conflict')
      }
      try {
        await r2.send(new PutObjectCommand({
          Bucket: bucket, Key: PREFIX + detailKey(receipt.snapshotSlug), IfMatch: receipt.etag,
          Body: JSON.stringify({ ...snapshot, spot: { ...snapshot.spot, related_note_slugs: next } }),
          CacheControl: object.CacheControl, ContentType: object.ContentType, Metadata: object.Metadata,
          ContentEncoding: object.ContentEncoding, ContentLanguage: object.ContentLanguage,
          ContentDisposition: object.ContentDisposition, Expires: object.Expires,
        }), { abortSignal: timeout() })
      } catch (error) {
        if (error instanceof Error && error.name === 'PreconditionFailed') {
          throw new SpotNotePublicationError('database_saved_publication_conflict')
        }
        throw error
      }
    },
    async refresh({ row, snapshot, receipt }) {
      const aliases = confirmedSpotAliases(await readAuthoritativeLocationSlugMap(), snapshot.spot)
      const plan = planSpotInvalidation(row.id, receipt.canonicalSlug, receipt.snapshotSlug, snapshot, aliases)
      for (const tag of plan.tags) revalidateTag(tag)
      revalidateTag(`bilingual:${detailKey(receipt.snapshotSlug)}`)
      for (const path of plan.paths) revalidatePath(path)
      const response = await freshFetch(`${SPOT_NOTE_PUBLICATION_ORIGIN}/api/admin/spot-content-revalidate/${row.id}`, {
        method: 'POST', headers: { authorization, 'x-jnq-expected-spot-slug': receipt.canonicalSlug }, signal: timeout(),
      })
      if (!response.ok || (await response.json()).ok !== true) throw new Error('English Spot revalidation failed.')
    },
  }
}
