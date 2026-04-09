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
