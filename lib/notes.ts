// Utility for notes
export type NoteBlockType = 'paragraph' | 'heading' | 'quote' | 'image' | 'spot' | 'affiliate'

export interface NoteBlock {
  id: string
  type: NoteBlockType
  title?: string
  content?: string
  imageUrl?: string
  caption?: string
  spotId?: number
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
    // Add text before the match
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
      if (!isNaN(spotId)) {
        parts.push({
          type: 'spot',
          spotId,
        })
      }
    }

    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < summary.length) {
    parts.push({
      type: 'text',
      content: summary.substring(lastIndex),
    })
  }

  return parts
}

export function stripSummaryTokens(summary: string): string {
  if (!summary) return ''
  return summary.replace(/\[(img|image|spot|location):([^\]]+)\]/g, '').trim()
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
