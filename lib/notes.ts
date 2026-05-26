export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'image'
  | 'gallery'
  | 'spotImages'
  | 'spot'
  | 'affiliate'
  | 'klookWidget'

export interface NoteImageItem {
  src: string
  alt: string
  caption?: string
}

export interface NoteBlock {
  id: string
  type: NoteBlockType
  title?: string
  content?: string
  imageUrl?: string
  alt?: string
  caption?: string
  images?: NoteImageItem[]
  spotId?: number
  spotSlug?: string
  spotName?: string
  affiliateIds?: number[]
  klookWidgetIds?: string[]
}

export interface LongformNote {
  slug: string
  aliases?: string[]
  title: string
  shortTitle: string
  kicker: string
  tagline: string
  summary: string
  content?: string
  coverImage?: string
  coverAccent: string
  published: boolean
  tags: string[]
  relatedRegionIds: number[]
  relatedSpotIds: number[]
  blocks: NoteBlock[]
  createdAt?: string
  updatedAt?: string
}

export interface SummaryPart {
  type: 'text' | 'image' | 'spot'
  content?: string
  imageUrl?: string
  spotId?: number
}

export function parseSummary(summary: string): SummaryPart[] {
  if (!summary) return []

  const parts: SummaryPart[] = []
  const regex = /\[(img|image|spot|location):([^\]]+)\]/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(summary)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: summary.substring(lastIndex, match.index),
      })
    }

    const type = match[1]
    const value = match[2].trim()

    if (type === 'img' || type === 'image') {
      parts.push({
        type: 'image',
        imageUrl: value,
      })
    } else if (type === 'spot' || type === 'location') {
      const spotId = parseInt(value, 10)
      if (!Number.isNaN(spotId)) {
        parts.push({
          type: 'spot',
          spotId,
        })
      }
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < summary.length) {
    parts.push({
      type: 'text',
      content: summary.substring(lastIndex),
    })
  }

  return parts
}

export function stripSummaryTokens(summary: string) {
  if (!summary) return ''
  return summary.replace(/\[(img|image|spot|location):([^\]]+)\]/g, '').trim()
}

export function buildFallbackAlt(spotName?: string, caption?: string) {
  const label = String(spotName || '').trim() || String(caption || '').trim()
  return label ? `${label} 旅游图片` : 'Travel photo'
}

export function createNoteImageItem(value: Partial<NoteImageItem> & { src?: string }, spotName?: string): NoteImageItem | null {
  const src = String(value?.src || '').trim()
  if (!src) return null

  const caption = String(value?.caption || '').trim()
  const alt = String(value?.alt || '').trim() || buildFallbackAlt(spotName, caption)

  return {
    src,
    alt,
    caption: caption || undefined,
  }
}

export function contentToParagraphBlocks(content: string): NoteBlock[] {
  const cleaned = String(content || '').trim()
  if (!cleaned) return []

  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      id: `legacy-paragraph-${index + 1}`,
      type: 'paragraph' as const,
      content: paragraph,
    }))
}

export function getRenderableNoteBlocks(note: Pick<LongformNote, 'blocks' | 'content' | 'summary'>) {
  if (Array.isArray(note.blocks) && note.blocks.length > 0) {
    return note.blocks
  }

  const legacySource = String(note.content || '').trim() || String(note.summary || '').trim()
  return contentToParagraphBlocks(legacySource)
}

export const DEFAULT_NOTE_COVER_ACCENT =
  'bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.26),transparent_22%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.2),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03))]'

export const EMPTY_NOTE: LongformNote = {
  slug: '',
  aliases: [],
  title: '',
  shortTitle: '',
  kicker: 'Longform Note',
  tagline: '',
  summary: '',
  content: '',
  coverImage: '',
  coverAccent: DEFAULT_NOTE_COVER_ACCENT,
  published: false,
  tags: [],
  relatedRegionIds: [],
  relatedSpotIds: [],
  blocks: [],
  createdAt: '',
  updatedAt: '',
}

function parseAttributes(tagText: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const matches = tagText.matchAll(/(\w+)="([^"]*)"/g)
  for (const match of matches) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

export function convertBlocksToMarkdown(blocks: NoteBlock[]): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return ''

  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `## ${block.content || ''}`
      }
      if (block.type === 'quote') {
        return `> ${block.content || ''}`
      }
      if (block.type === 'image') {
        const altText = block.alt || ''
        const urlText = block.imageUrl || ''
        const captionText = block.caption ? `\n*${block.caption}*` : ''
        return `![${altText}](${urlText})${captionText}`
      }
      if (block.type === 'spotImages' || block.type === 'gallery') {
        const imagesList = (block.images || []).map((img) => img.src).join(',')
        return `[spot-images id="${block.spotId || ''}" name="${block.spotName || ''}" images="${imagesList}"]`
      }
      if (block.type === 'spot') {
        return `[spot id="${block.spotId || ''}"]`
      }
      if (block.type === 'affiliate') {
        const ids = (block.affiliateIds || []).join(',')
        return `[affiliate ids="${ids}" title="${block.title || ''}" content="${block.content || ''}"]`
      }
      if (block.type === 'klookWidget') {
        const ids = (block.klookWidgetIds || []).join(',')
        return `[klook-widget ids="${ids}" title="${block.title || ''}" content="${block.content || ''}"]`
      }
      return block.content || ''
    })
    .join('\n\n')
}

export function parseMarkdownToBlocks(markdown: string): NoteBlock[] {
  const trimmed = String(markdown || '').trim()
  if (!trimmed) return []

  // Split blocks by double (or more) newlines, normalizing carriage returns
  const rawSections = trimmed.replace(/\r\n/g, '\n').split(/\n\n+/)
  const blocks: NoteBlock[] = []

  rawSections.forEach((section, index) => {
    const text = section.trim()
    if (!text) return

    const blockId = `block-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`

    // 1. Heading
    if (text.startsWith('#')) {
      const levelMatch = text.match(/^(#{1,6})\s+(.*)$/)
      if (levelMatch) {
        blocks.push({
          id: blockId,
          type: 'heading',
          content: levelMatch[2].trim(),
        })
        return
      }
    }

    // 2. Blockquote
    if (text.startsWith('>')) {
      const content = text.slice(1).trim()
      blocks.push({
        id: blockId,
        type: 'quote',
        content,
      })
      return
    }

    // 3. Shortcodes like [spot-images ...] or [spot-gallery ...]
    if (text.startsWith('[spot-images') || text.startsWith('[spot-gallery')) {
      const attrs = parseAttributes(text)
      const spotId = parseInt(attrs.id || attrs.spotId || '', 10)
      const spotName = attrs.name || attrs.spotName || 'Spot Images'
      const imagesStr = attrs.images || ''
      const images = imagesStr
        .split(',')
        .filter(Boolean)
        .map((src) => ({
          src: src.trim(),
          alt: buildFallbackAlt(spotName),
        }))

      blocks.push({
        id: blockId,
        type: 'spotImages',
        spotId: Number.isFinite(spotId) ? spotId : undefined,
        spotName,
        images,
      })
      return
    }

    // 4. Shortcode [spot ...] or [spot-card ...]
    if (text.startsWith('[spot-card') || text.startsWith('[spot')) {
      const attrs = parseAttributes(text)
      const spotId = parseInt(attrs.id || attrs.spotId || '', 10)

      blocks.push({
        id: blockId,
        type: 'spot',
        spotId: Number.isFinite(spotId) ? spotId : undefined,
      })
      return
    }

    // 5. Shortcode [affiliate ...]
    if (text.startsWith('[affiliate')) {
      const attrs = parseAttributes(text)
      const idsStr = attrs.ids || ''
      const affiliateIds = idsStr
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter(Number.isFinite)

      blocks.push({
        id: blockId,
        type: 'affiliate',
        title: attrs.title || undefined,
        content: attrs.content || undefined,
        affiliateIds,
      })
      return
    }

    // 6. Shortcode [klook-widget ...]
    if (text.startsWith('[klook-widget') || text.startsWith('[klook')) {
      const attrs = parseAttributes(text)
      const idsStr = attrs.ids || attrs.id || ''
      const klookWidgetIds = idsStr
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)

      blocks.push({
        id: blockId,
        type: 'klookWidget',
        title: attrs.title || undefined,
        content: attrs.content || undefined,
        klookWidgetIds,
      })
      return
    }

    // 7. Standalone Image: ![alt](url)
    if (text.startsWith('![')) {
      const markdownImgMatch = text.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\s*\n*\*([^*]+)\*)?$/)
      if (markdownImgMatch) {
        const alt = markdownImgMatch[1]
        const imageUrl = markdownImgMatch[2]
        const caption = markdownImgMatch[3]
        blocks.push({
          id: blockId,
          type: 'image',
          imageUrl,
          alt: alt || undefined,
          caption: caption || undefined,
        })
        return
      }
    }

    // Default: Paragraph block
    blocks.push({
      id: blockId,
      type: 'paragraph',
      content: text,
    })
  })

  return blocks
}
