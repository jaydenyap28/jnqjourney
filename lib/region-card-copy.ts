import { resolveEntityDisplayName, type EntityNameSource } from './entity-display-name.ts'
import type { Locale } from './locale.ts'

/** Select existing prose only. Missing translations get navigation copy, never invented geography. */
export function regionCardDescription(region: EntityNameSource, description: string | null | undefined, locale: Locale) {
  const name = resolveEntityDisplayName(region, locale).primary
  const text = String(description || '').trim()
  const lastHan = Math.max(...Array.from(text.matchAll(/[\u3400-\u9fff]/gu), match => match.index), -1)
  if (locale === 'en') return text && lastHan < 0 ? text : `Explore places, food and travel notes in ${name}.`
  if (lastHan < 0) return `查看${name}的景点、美食与旅行笔记。`
  // Legacy summaries append an English paragraph after the Chinese copy.
  // Keep English place names inside Chinese sentences, such as BOH Tea.
  const suffix = text.slice(lastHan + 1)
  if (/^[。！？，；、\s]*[A-Z][A-Za-z'’() -]+\s(?:is|are|offers|lies|sits|travel|and)\b/.test(suffix)) {
    return text.slice(0, lastHan + 1) + (suffix.match(/^[。！？，；、]+/)?.[0] || '')
  }
  return text
}
