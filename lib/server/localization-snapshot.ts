import fs from 'node:fs/promises'
import path from 'node:path'
import bundled from '@/public-data/i18n/en/records.json'
import type { LocalizationSnapshot } from '@/lib/localization'
import type { Locale } from '@/lib/locale'

const cache = new Map<string, { until: number; promise: Promise<unknown> }>()
const base = () => String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')

/** Raw public snapshots are shared; localized documents have an explicit locale key and tag. No database fallback. */
export async function readBilingualSnapshot<T>(key: string, fallback: () => Promise<T>, validate: (value: unknown) => boolean): Promise<T> {
  const entry = cache.get(key)
  if (entry && entry.until > Date.now()) return entry.promise as Promise<T>
  const promise = (async () => {
    try {
      if (base()) {
        const response = await fetch(`${base()}/public-data/${key}`, {
          signal: AbortSignal.timeout(4000), next: { revalidate: 3600, tags: [`bilingual:${key}`] },
        })
        if (response.ok) { const value = await response.json(); if (validate(value)) return value as T }
      }
    } catch { /* An unavailable CDN must not introduce live PostgREST requests. */ }
    return fallback()
  })()
  cache.set(key, { until: Date.now() + 60_000, promise })
  try { return await promise } catch (error) { cache.delete(key); throw error }
}

export async function readBundledJson<T>(file: string): Promise<T> {
  // Literal paths let Next's output tracer include these files in serverless ISR.
  // A generic cwd + caller string works locally but omits them from deployment.
  let text: string
  switch (file) {
    case 'public-data/locations.json': text = await fs.readFile(path.join(process.cwd(), 'public-data/locations.json'), 'utf8'); break
    case 'public-data/regions.json': text = await fs.readFile(path.join(process.cwd(), 'public-data/regions.json'), 'utf8'); break
    case 'public-data/guide-trip-costs.json': text = await fs.readFile(path.join(process.cwd(), 'public-data/guide-trip-costs.json'), 'utf8'); break
    case 'data/guides.json': text = await fs.readFile(path.join(process.cwd(), 'data/guides.json'), 'utf8'); break
    case 'data/location-slugs.json': text = await fs.readFile(path.join(process.cwd(), 'data/location-slugs.json'), 'utf8'); break
    default: {
      const slug = file.match(/^public-data\/spots\/([a-zA-Z0-9-]+)\.json$/)?.[1]
      if (!slug) throw new Error('Unsupported bundled public snapshot')
      text = await fs.readFile(path.join(process.cwd(), 'public-data/spots', `${slug}.json`), 'utf8')
    }
  }
  return JSON.parse(text.replace(/^\uFEFF/, '')) as T
}

export async function readLocalizationSnapshot(locale: Locale): Promise<LocalizationSnapshot> {
  if (locale === 'zh') return { schemaVersion: 1, locale: 'en', version: 'source', records: [] }
  return readBilingualSnapshot('i18n/en/records.json', async () => bundled as unknown as LocalizationSnapshot, value => {
    const record = value as LocalizationSnapshot
    return record?.schemaVersion === 1 && record.locale === 'en' && Array.isArray(record.records) && record.records.every(r => r.locale === 'en' && r.fields && ['missing','partial','complete'].includes(r.translationStatus))
  })
}
