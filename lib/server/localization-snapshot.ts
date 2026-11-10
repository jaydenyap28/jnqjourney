import { readPrivatePublicFeed, PublicReadUnavailable } from './public-read-source'
import type { LocalizationSnapshot } from '@/lib/localization'
import type { Locale } from '@/lib/locale'

// The old public R2/CDN and bundled JSON failovers are deliberately absent.
// Translation refresh never restores visibility; Spot data always comes from
// the live public projection, including Pages-router JSON responses.
export async function readBilingualSnapshot<T>(key: string, _fallback: () => Promise<T>, validate: (value: unknown) => boolean, _fresh = false): Promise<T> {
  let value: unknown
  if (key === 'locations.json' || key === 'regions.json') {
    const { resolvePublicData } = await import('./public-data-resolver')
    const data = await resolvePublicData()
    value = key === 'locations.json' ? {locations: data.locations} : {regions: data.regions}
  } else if (/^spots\/[a-zA-Z0-9-]+\.json$/.test(key)) {
    const { extractLocationIdFromSlug } = await import('@/lib/location-routing')
    const { readAuthoritativePublicSpotById } = await import('./public-spot-resolver')
    const id = extractLocationIdFromSlug(key.slice(6,-5))
    const spot = id ? await readAuthoritativePublicSpotById(id) : null
    if (!spot) throw new PublicReadUnavailable()
    value = {schemaVersion: 1, spot}
  } else value = await readPrivatePublicFeed(key)
  if (!validate(value)) throw new PublicReadUnavailable()
  return value as T
}
export async function readBundledJson<T>(file: string): Promise<T> {
  const key = file.replace(/^(?:public-data|data)\//, '')
  return readBilingualSnapshot(key, async () => {throw new PublicReadUnavailable()}, value => value != null)
}
export async function readLocalizationSnapshot(locale: Locale, _fresh = false): Promise<LocalizationSnapshot> {
  if (locale === 'zh') return {schemaVersion: 1, locale: 'en', version: 'source', records: []}
  return readBilingualSnapshot('i18n/en/records.json', async () => {throw new PublicReadUnavailable()}, value => {
    const snapshot = value as LocalizationSnapshot
    return snapshot?.schemaVersion === 1 && snapshot.locale === 'en' && Array.isArray(snapshot.records)
  })
}
