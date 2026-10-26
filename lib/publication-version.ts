import { createHash } from 'node:crypto'
import { publicSpotFromSupabaseRow } from './public-spot.ts'

/** Hash public source data, not timestamps, resolved media or translated copy. */
export function publicationVersion(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().filter(key => v[key] !== undefined).map(key => [key, canonical(v[key])])) : v
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

/** Same untranslated source for both locales; derived aliases/titles excluded. */
export function spotPublicationVersion(value: Record<string, unknown>): string {
  // Compare the existing published DTO, not raw DB representation ('' vs null,
  // numeric IDs, joined region defaults or non-public status/timestamps).
  const normalized=publicSpotFromSupabaseRow(value,{slug:'',region:null} as Parameters<typeof publicSpotFromSupabaseRow>[1],value.regions as Record<string,any> | undefined)
  const { slug: _slug, ...source } = normalized
  return publicationVersion(source)
}
