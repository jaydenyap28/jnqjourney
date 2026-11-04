import fs from 'node:fs/promises'
import path from 'node:path'
import bundled from '@/public-data/i18n/en/records.json'
import type { LocalizationSnapshot } from '@/lib/localization'
import type { Locale } from '@/lib/locale'
import { freshNoteSnapshotUrl } from '@/lib/note-publication'
import { readPublicFallbackSnapshot, readFallbackSpot } from './public-fallback-snapshot'
import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { readPreviewSnapshot } from './preview-fixtures'

const cache = new Map<string, { until: number; promise: Promise<unknown> }>()
const base = () => String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')

/** Raw public snapshots are shared; localized documents have an explicit locale key and tag. No database fallback. */
export async function readBilingualSnapshot<T>(key: string, fallback: () => Promise<T>, validate: (value: unknown) => boolean, fresh = false): Promise<T> {
  if (process.env.VERCEL_ENV === 'preview') {
    const value = readPreviewSnapshot(key)
    if (!validate(value)) throw new Error('Invalid Preview fixture snapshot.')
    return value as T
  }
  const entry = cache.get(key)
  if (!fresh && entry && entry.until > Date.now()) return entry.promise as Promise<T>
  const promise = (async () => {
    if (base()) {
      const url = key === 'notes.json' ? freshNoteSnapshotUrl(base()) : `${base()}/public-data/${key}${fresh ? `?publication=${Date.now()}` : ''}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4000), next: { revalidate: fresh ? 0 : 3600, tags: [`bilingual:${key}`] },
      })
      if (response.ok) { const value = await response.json(); if (validate(value)) return value as T }
      throw new Error('Published snapshot unavailable during page refresh')
    }
    return fallback()
  })()
  cache.set(key, { until: Date.now() + 60_000, promise })
  try { return await promise } catch (error) { cache.delete(key); throw error }
}

export async function readBundledJson<T>(file: string): Promise<T> {
  if (process.env.VERCEL_ENV === 'preview') {
    if (file === 'data/location-slugs.json') return {} as T
    throw new Error('Bundled production snapshot is unavailable in Preview.')
  }
  if (file === 'public-data/locations.json' || file === 'public-data/regions.json') {
    const snapshot = await readPublicFallbackSnapshot()
    return (file.endsWith('/locations.json') ? { locations: snapshot.locations } : { regions: snapshot.regions }) as T
  }
  const detailSlug = file.match(/^public-data\/spots\/([a-zA-Z0-9-]+)\.json$/)?.[1]
  if (detailSlug) {
    const id = extractLocationIdFromSlug(detailSlug)
    const result = id ? await readFallbackSpot(id) : null
    if (result?.status !== 'found') throw new Error('Spot absent from public fallback')
    return { schemaVersion: 1, spot: result.spot } as T
  }
  // Literal paths let Next's output tracer include these files in serverless ISR.
  // A generic cwd + caller string works locally but omits them from deployment.
  let text: string
  switch (file) {
    case 'public-data/guide-trip-costs.json': text = await fs.readFile(path.join(process.cwd(), 'public-data/guide-trip-costs.json'), 'utf8'); break
    case 'data/guides.json': text = await fs.readFile(path.join(process.cwd(), 'data/guides.json'), 'utf8'); break
    case 'data/notes.json': text = await fs.readFile(path.join(process.cwd(), 'data/notes.json'), 'utf8'); break
    case 'data/location-slugs.json': text = await fs.readFile(path.join(process.cwd(), 'data/location-slugs.json'), 'utf8'); break
    default: throw new Error('Unsupported bundled public snapshot')
  }
  return JSON.parse(text.replace(/^\uFEFF/, '')) as T
}

export async function readLocalizationSnapshot(locale: Locale, fresh = false): Promise<LocalizationSnapshot> {
  if (locale === 'zh') return { schemaVersion: 1, locale: 'en', version: 'source', records: [] }
  if (process.env.VERCEL_ENV !== 'preview' && fresh && base()) {
    // On-demand Pages ISR after Admin publication must not reuse an older process/CDN cache.
    const response = await fetch(`${base()}/public-data/i18n/en/records.json?publication=${Date.now()}`, {signal:AbortSignal.timeout(10000),next:{revalidate:0}})
    if (!response.ok) throw new Error('Published localization unavailable during page refresh')
    const value = await response.json() as LocalizationSnapshot
    if (value.schemaVersion !== 1 || value.locale !== 'en' || !Array.isArray(value.records)) throw new Error('Invalid published localization')
    cache.set('i18n/en/records.json',{until:Date.now()+60000,promise:Promise.resolve(value)})
    return value
  }
  return readBilingualSnapshot('i18n/en/records.json', async () => bundled as unknown as LocalizationSnapshot, value => {
    const record = value as LocalizationSnapshot
    return record?.schemaVersion === 1 && record.locale === 'en' && Array.isArray(record.records) && record.records.every(r => r.locale === 'en' && r.fields && ['missing','partial','complete'].includes(r.translationStatus))
  })
}
