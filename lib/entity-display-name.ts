import type { Locale } from './locale.ts'

export interface EntityNameSource {
  name?: string | null
  name_cn?: string | null
  displayName?: string | null
}

export interface EntityDisplayName {
  primary: string
  secondary: string | null
}

const clean = (value?: string | null) => String(value || '').replace(/\s+/gu, ' ').trim()
const comparable = (value: string) => clean(value).toLocaleLowerCase('en')
const hasHan = (value: string) => /[\u3400-\u9fff]/u.test(value)

// Explicitly curated by the bilingual-name cleanup brief; never infer translations
// or strip Chinese names based on business category alone.
export const ORIGINAL_ONLY_NAMES = [
  'Dream Forest Langkawi', 'MAHA Tower',
  'Gua MAHA & GM Farm Seafood Restaurant', 'FB Cafe - Napolitan Pizza',
  'Che Ta Chicken Rice Store', 'Chuan Bar Izakaya - Japanese Fusion',
  'Golden Bamboo Cafe', 'Villa Paddy', 'Airis Sanctuary Resort Langkawi',
  'Crab Langkawi Farm and Restaurant', 'Tanjung Rhu Mangrove Jetty',
] as const
const originalOnly = new Set<string>(ORIGINAL_ONLY_NAMES.map(comparable))

// Legacy lightweight snapshots encode two names in one field. Only split a
// single spaced slash with a Chinese side and a Latin, non-Chinese side.
function splitBilingual(value: string) {
  const parts = value.split(' / ')
  if (parts.length !== 2 || parts.some(part => !part)) return null
  const [left, right] = parts
  if (hasHan(left) && !hasHan(right) && /[a-z]/i.test(right)) return { zh: left, original: right }
  if (hasHan(right) && !hasHan(left) && /[a-z]/i.test(left)) return { zh: right, original: left }
  return null
}

function pair(zh: string, original: string, locale: Locale): EntityDisplayName {
  const primary = (locale === 'en' ? original : zh) || original || zh
  const alternate = locale === 'en' ? zh : original
  return { primary, secondary: alternate && comparable(alternate) !== comparable(primary) ? alternate : null }
}

export function resolveEntityDisplayName(entity: EntityNameSource, locale: Locale = 'zh'): EntityDisplayName {
  const override = clean(entity.displayName)
  const name = clean(entity.name)
  const localized = clean(entity.name_cn)
  const combined = splitBilingual(name)
  const original = combined?.original || name
  const zh = localized || combined?.zh || ''

  if (override) {
    const split = splitBilingual(override)
    if (split) return pair(split.zh, split.original, locale)
    // An editorial alias wins; do not attach a potentially unrelated name.
    if (zh && comparable(override) === comparable(zh) && !originalOnly.has(comparable(original))) return pair(override, original, locale)
    return { primary: override, secondary: null }
  }
  if (originalOnly.has(comparable(original))) return { primary: original, secondary: null }
  return pair(zh, original, locale)
}
