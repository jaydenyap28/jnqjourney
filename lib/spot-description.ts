export type SpotDescriptionBlock =
  | { type: 'p' | 'h2' | 'h3' | 'h4' | 'blockquote'; content: string }
  | { type: 'image'; src: string; alt: string; caption?: string }

function parseSpotDescriptionImage(line: string): Extract<SpotDescriptionBlock, { type: 'image' }> | null {
  const match = line.trim().match(/^!\[([^\]\n]*)\]\(\s*(\S+?)(?:\s+["']([^"']*)["'])?\s*\)$/)
  if (!match) return null
  try {
    const url = new URL(match[2], 'https://jnqjourney.com')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  } catch {
    return null
  }
  return { type: 'image', alt: match[1], src: match[2], caption: match[3] || undefined }
}

// Deliberately excludes Note embeds, shortcodes, inferred headings, and H1.
export function parseSpotDescription(value: string): SpotDescriptionBlock[] {
  const blocks: SpotDescriptionBlock[] = []
  for (const line of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      blocks.push({ type: 'p', content: '' })
      continue
    }
    const image = parseSpotDescriptionImage(line)
    if (image) {
      blocks.push(image)
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
  return blocks.filter((block) => block.type === 'image' || block.content)
}

/** Reading shortcuts into the existing body, never another facts store. */
export function spotPracticalSections(value: string) {
  return parseSpotDescription(value).flatMap((block, index) =>
    block.type !== 'image' && /^(h2|h3|h4)$/.test(block.type) && /门票|票种|开放|营业|闭园|停留|游览时间|交通|到达|怎么安排|ticket|admission|hours|duration|transport|getting|access/i.test(block.content)
      ? [{ id: `spot-description-${index}`, title: block.content }] : [])
}

export function spotDescriptionExcerpt(value?: string | null): string {
  return String(value || '')
    .replace(/^ {0,3}#{1,6}[\t ]+/gm, '')
    .replace(/[\t ]+#+[\t ]*$/gm, '')
    .replace(/^ {0,3}>[\t ]?/gm, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!?\[([^\]\n]+)\]\([^\s)]+(?:\s+["'][^"']*["'])?\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ').trim()
}
