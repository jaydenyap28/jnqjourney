export type SpotDescriptionBlock = { type: 'p' | 'h2' | 'h3' | 'h4' | 'blockquote'; content: string }

function countLatinWords(value: string) {
  return value.match(/[A-Za-z][A-Za-z'’.-]{2,}/g)?.length || 0
}

function countHanCharacters(value: string) {
  return value.match(/[\u3400-\u9fff]/gu)?.length || 0
}

/**
 * Older Spot rows sometimes stored the Chinese body followed by a full English
 * translation in the same description field. Keep the source intact, but split
 * that legacy shape at render/SEO time so each locale only exposes one language.
 *
 * The detector is deliberately conservative: it only splits when a sizeable,
 * all-English suffix follows an earlier Chinese block. Inline English names,
 * brands, addresses and short phrases inside Chinese copy are preserved.
 */
export function selectLegacyBilingualSpotDescription(value: string, locale: 'zh' | 'en' = 'zh') {
  const normalized = String(value || '').replace(/\r\n?/g, '\n').trim()
  if (!normalized || !/[\u3400-\u9fff]/u.test(normalized) || countLatinWords(normalized) < 12) return normalized

  const blocks = normalized.split(/\n{2,}/)
  let sawChinese = false

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index].trim()
    if (!block) continue

    if (/[\u3400-\u9fff]/u.test(block)) {
      sawChinese = true
      continue
    }

    if (!sawChinese || countLatinWords(block) < 4) continue

    const chinese = blocks.slice(0, index).join('\n\n').trim()
    const english = blocks.slice(index).join('\n\n').trim()
    if (!chinese || !/[\u3400-\u9fff]/u.test(chinese)) continue

    const looksLikeFullEnglishTranslation =
      english.length >= 80 &&
      countLatinWords(english) >= 12 &&
      countHanCharacters(english) === 0

    if (looksLikeFullEnglishTranslation) return locale === 'en' ? english : chinese
  }

  return normalized
}

// Deliberately excludes Note embeds, shortcodes, inferred headings, and H1.
export function parseSpotDescription(value: string): SpotDescriptionBlock[] {
  const blocks: SpotDescriptionBlock[] = []
  for (const line of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      blocks.push({ type: 'p', content: '' })
      continue
    }
    const heading = line.match(/^ {0,3}(#{2,4})[\t ]+(.+)$/)
    const quote = line.match(/^ {0,3}>[\t ]?(.*)$/)
    const type = heading ? `h${heading[1].length}` as 'h2' | 'h3' | 'h4' : quote ? 'blockquote' : 'p'
    const content = heading ? heading[2].replace(/[\t ]+#+[\t ]*$/, '') : quote ? quote[1] : line
    const previous = blocks.at(-1)
    if (previous?.type === type && previous.content && (type === 'p' || type === 'blockquote')) {
      previous.content += `\n${content}`
    } else {
      blocks.push({ type, content })
    }
  }
  return blocks.filter((block) => block.content)
}

export function spotDescriptionExcerpt(value?: string | null): string {
  return String(value || '')
    .replace(/^ {0,3}#{1,6}[\t ]+/gm, '')
    .replace(/[\t ]+#+[\t ]*$/gm, '')
    .replace(/^ {0,3}>[\t ]?/gm, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!?\[([^\]\n]+)\]\([^\s)]+\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ').trim()
}
