export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'image'
  | 'gallery'
  | 'spotImages'
  | 'spot'
  | 'affiliate'

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
