export type SpotDescriptionBlock = { type: 'p' | 'h2' | 'h3' | 'h4' | 'blockquote'; content: string }

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
