export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'image'
  | 'video'
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

export type NoteImageSize = 'full' | 'wide' | 'medium' | 'small'

export interface NoteBlock {
  id: string
  type: NoteBlockType
  title?: string
  content?: string
  imageUrl?: string
  videoUrl?: string
  imageSize?: NoteImageSize
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
  coverVideoUrl?: string
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
  kicker: '',
  tagline: '',
  summary: '',
  content: '',
  coverImage: '',
  coverVideoUrl: '',
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

export function normalizeNoteImageSize(value?: string | null): NoteImageSize | undefined {
  const size = String(value || '').trim().toLowerCase()
  if (size === 'full' || size === 'wide' || size === 'medium' || size === 'small') return size
  return undefined
}

function isLikelyImageUrl(value: string) {
  const text = String(value || '').trim()
  if (!/^https?:\/\/\S+$/i.test(text)) return false
  return /\.(avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(text)
}

function isLikelyVideoUrl(value: string) {
  const text = String(value || '').trim()
  if (!/^https?:\/\/\S+$/i.test(text)) return false
  return /(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch)/i.test(text)
}

function normalizeImageUrl(value: string) {
  return String(value || '').trim().replace(/^https?:\/\/https?:\/\//i, 'https://')
}

export function createNoteHeadingId(content?: string | null, fallback?: string | number) {
  const base = String(content || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base || `section-${fallback || 'note'}`
}

function parseImageList(value: string) {
  const text = String(value || '').trim()
  if (!text) return []

  const separator = text.includes('|') ? /\|/ : /,(?=https?:\/\/)/i
  return text
    .split(separator)
    .map((src) => normalizeImageUrl(src))
    .filter(Boolean)
}

function parseStandaloneImageMarkdown(text: string) {
  const markdownImgMatch = text.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{size=(full|wide|medium|small)\})?(?:\s*\n*\*([^*]+)\*)?$/i)
  if (!markdownImgMatch) return null

  return {
    alt: markdownImgMatch[1] || undefined,
    imageUrl: normalizeImageUrl(markdownImgMatch[2]),
    imageSize: normalizeNoteImageSize(markdownImgMatch[3]),
    caption: markdownImgMatch[4] || undefined,
  }
}

function splitImageOnlySection(section: string) {
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) return [section]
  const allImages = lines.every((line) => parseStandaloneImageMarkdown(line) || isLikelyImageUrl(normalizeImageUrl(line)))
  return allImages ? lines : [section]
}

function isImplicitHeading(text: string) {
  const value = String(text || '').trim()
  if (!value || value.includes('\n') || value.length > 80) return false
  if (/[:：]$/.test(value) && value.length <= 48) return true
  const latinLetters = value.replace(/[^A-Za-z]/g, '')
  return latinLetters.length >= 3 && latinLetters === latinLetters.toUpperCase() && /[A-Z]/.test(latinLetters)
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
        const sizeText = block.imageSize ? `{size=${block.imageSize}}` : ''
        return `![${altText}](${urlText})${sizeText}${captionText}`
      }
      if (block.type === 'video') {
        return `[video url="${block.videoUrl || ''}" title="${block.title || ''}"]`
      }
      if (block.type === 'spotImages' || block.type === 'gallery') {
        const imagesList = (block.images || []).map((img) => img.src).join('|')
        const sizeText = block.imageSize ? ` size="${block.imageSize}"` : ''
        return `[spot-images id="${block.spotId || ''}" name="${block.spotName || ''}" images="${imagesList}"${sizeText}]`
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
  const rawSections = trimmed.replace(/\r\n/g, '\n').split(/\n\n+/).flatMap(splitImageOnlySection)
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

    if (isImplicitHeading(text)) {
      blocks.push({
        id: blockId,
        type: 'heading',
        content: text.replace(/[:：]$/, '').trim(),
      })
      return
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
    if (text.startsWith('[video')) {
      const attrs = parseAttributes(text)
      const videoUrl = String(attrs.url || attrs.src || '').trim()
      blocks.push({
        id: blockId,
        type: 'video',
        videoUrl,
        title: attrs.title || undefined,
      })
      return
    }

    if (isLikelyVideoUrl(text)) {
      blocks.push({
        id: blockId,
        type: 'video',
        videoUrl: text,
      })
      return
    }

    // 3. Shortcodes like [spot-images ...] or [spot-gallery ...]
    if (text.startsWith('[spot-images') || text.startsWith('[spot-gallery')) {
      const attrs = parseAttributes(text)
      const spotId = parseInt(attrs.id || attrs.spotId || '', 10)
      const spotName = attrs.name || attrs.spotName || 'Spot Images'
      const imagesStr = attrs.images || ''
      const images = parseImageList(imagesStr)
        .map((src) => ({
          src,
          alt: buildFallbackAlt(spotName),
        }))

      blocks.push({
        id: blockId,
        type: 'spotImages',
        spotId: Number.isFinite(spotId) ? spotId : undefined,
        spotName,
        imageSize: normalizeNoteImageSize(attrs.size),
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

    // 7. Standalone Image: ![alt](url){size=small}
    if (text.startsWith('![')) {
      const image = parseStandaloneImageMarkdown(text)
      if (image) {
        blocks.push({
          id: blockId,
          type: 'image',
          imageUrl: image.imageUrl,
          imageSize: image.imageSize,
          alt: image.alt,
          caption: image.caption,
        })
        return
      }
    }

    const imageUrl = normalizeImageUrl(text)
    if (isLikelyImageUrl(imageUrl)) {
      blocks.push({
        id: blockId,
        type: 'image',
        imageUrl,
      })
      return
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
