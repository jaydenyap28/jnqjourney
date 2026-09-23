import { resolveEntityDisplayName } from './entity-display-name.ts'

/** Presentation only: never change the Spot name used for identity or URLs. */
export function guideAttractionDisplayName(
  attraction: { displayName?: string | null } | null | undefined,
  spot: { name?: string | null; name_cn?: string | null },
  fallback = '',
  locale: 'zh' | 'en' = 'zh'
) {
  return resolveEntityDisplayName({ ...spot, displayName: attraction?.displayName }, locale).primary || fallback
}
