import type { Locale } from './locale.ts'

/** Never present a source-language paragraph as an English translation.
 * Names/addresses stay in their dedicated fields; this only selects prose.
 */
export function publicProse(value: string | null | undefined, locale: Locale) {
  const text = String(value || '').trim()
  if (locale !== 'en') return text
  return text.split(/\n[\t ]*\n/).filter(block => {
    const han = block.match(/\p{Script=Han}/gu) || []
    if (!han.length) return true
    // English sentences may retain a short original place name. A Chinese
    // sentence/paragraph is omitted, including in otherwise bilingual copy.
    return han.length <= 12 && !/[。！？；]/u.test(block) && (block.match(/\b[a-zA-Z]{2,}\b/g) || []).length >= 8
  }).join('\n\n').trim()
}
