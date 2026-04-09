import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { LongformNote, NoteBlock } from '@/lib/notes'
import { DEFAULT_NOTE_COVER_ACCENT } from '@/lib/notes'

const notesFilePath = path.join(process.cwd(), 'data', 'notes.json')

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function normalizeBlock(value: any): NoteBlock | null {
  const type = String(value?.type || '').trim() as NoteBlock['type']
  if (!type) return null

  const block: NoteBlock = {
    id: String(value?.id || '').trim() || `block-${Math.random().toString(36).slice(2, 10)}`,
    type,
    title: String(value?.title || '').trim() || undefined,
    content: String(value?.content || '').trim() || undefined,
    imageUrl: String(value?.imageUrl || '').trim() || undefined,
    caption: String(value?.caption || '').trim() || undefined,
    spotId: Number.isFinite(Number(value?.spotId)) ? Number(value.spotId) : undefined,
    affiliateIds: normalizeNumberArray(value?.affiliateIds),
  }

  if (block.type === 'image' && !block.imageUrl) return null
  if (block.type === 'spot' && !block.spotId) return null
  if (block.type === 'affiliate' && !block.affiliateIds?.length) return null
  if ((block.type === 'paragraph' || block.type === 'quote' || block.type === 'heading') && !block.content) {
    return null
  }

  return block
}

export function normalizeNotePayload(value: any): LongformNote {
  return {
    slug: String(value?.slug || '').trim(),
    aliases: normalizeStringArray(value?.aliases),
    title: String(value?.title || '').trim(),
    shortTitle: String(value?.shortTitle || '').trim() || String(value?.title || '').trim(),
    kicker: String(value?.kicker || '').trim() || 'Longform Note',
    tagline: String(value?.tagline || '').trim(),
    summary: String(value?.summary || '').trim(),
    coverImage: String(value?.coverImage || '').trim() || undefined,
    coverAccent: String(value?.coverAccent || '').trim() || DEFAULT_NOTE_COVER_ACCENT,
    published: Boolean(value?.published),
    tags: normalizeStringArray(value?.tags),
    relatedRegionIds: normalizeNumberArray(value?.relatedRegionIds),
    relatedSpotIds: normalizeNumberArray(value?.relatedSpotIds),
    blocks: Array.isArray(value?.blocks)
      ? value.blocks
          .map((item: any) => normalizeBlock(item))
          .filter((item: NoteBlock | null): item is NoteBlock => Boolean(item))
      : [],
    createdAt: String(value?.createdAt || '').trim() || undefined,
    updatedAt: String(value?.updatedAt || '').trim() || undefined,
  }
}

export async function readNotes() {
  try {
    const raw = await readFile(notesFilePath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeNotePayload).filter((note) => note.slug && note.title)
  } catch {
    return []
  }
}

export async function readPublishedNotes() {
  const notes = await readNotes()
  return notes.filter((note) => note.published)
}

export async function readNoteBySlug(slug: string) {
  const notes = await readNotes()
  return (
    notes.find(
      (note) => note.slug === slug || (Array.isArray(note.aliases) && note.aliases.includes(slug))
    ) || null
  )
}

export async function saveNotes(notes: LongformNote[]) {
  const normalized = notes.map(normalizeNotePayload)
  await writeFile(notesFilePath, JSON.stringify(normalized, null, 2), 'utf8')
}
