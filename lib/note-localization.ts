import { applyLocalization, localizationRecord, type LocalizationSnapshot, type TranslationStatus } from './localization.ts'
import {
  convertBlocksToMarkdown,
  getRenderableNoteBlocks,
  type LongformNote,
  type NoteBlock,
} from './notes.ts'

export interface LocalizedLongformNote {
  value: LongformNote
  status: TranslationStatus
}

export function normalizedNoteForTranslation(note: LongformNote): LongformNote {
  return {
    ...note,
    blocks: getRenderableNoteBlocks(note).map((block) => ({
      ...block,
      images: block.images?.map((image) => ({ ...image })),
    })),
  }
}

export function noteTranslationSegments(note: LongformNote): Record<string, string> {
  const normalized = normalizedNoteForTranslation(note)
  const segments: Record<string, string> = {
    title: String(normalized.title || ''),
    shortTitle: String(normalized.shortTitle || normalized.title || ''),
    kicker: String(normalized.kicker || ''),
    tagline: String(normalized.tagline || ''),
    summary: String(normalized.summary || ''),
  }

  normalized.blocks.forEach((block: NoteBlock, blockIndex) => {
    const base = `blocks.${blockIndex}`
    if (typeof block.content === 'string' && block.content.trim()) segments[`${base}.content`] = block.content
    if (typeof block.title === 'string' && block.title.trim()) segments[`${base}.title`] = block.title
    if (typeof block.alt === 'string' && block.alt.trim()) segments[`${base}.alt`] = block.alt
    if (typeof block.caption === 'string' && block.caption.trim()) segments[`${base}.caption`] = block.caption
    block.images?.forEach((image, imageIndex) => {
      if (image.alt?.trim()) segments[`${base}.images.${imageIndex}.alt`] = image.alt
      if (image.caption?.trim()) segments[`${base}.images.${imageIndex}.caption`] = image.caption
    })
  })

  return segments
}

export function noteTranslationIsCurrent(note: LongformNote, snapshot: LocalizationSnapshot) {
  const source = noteTranslationSegments(note)
  const record = localizationRecord(snapshot, 'page', `notes/${note.slug}`)
  if (!record) return false

  for (const [path, sourceText] of Object.entries(source)) {
    const field = record.fields[path]
    if (!field?.text?.trim() || field.source !== sourceText) return false
  }

  return true
}

export function localizeLongformNote(note: LongformNote, snapshot: LocalizationSnapshot): LocalizedLongformNote {
  const normalized = normalizedNoteForTranslation(note)
  const record = localizationRecord(snapshot, 'page', `notes/${note.slug}`)
  if (!record) return { value: normalized, status: 'missing' }

  const result = applyLocalization(normalized, record)
  const current = noteTranslationIsCurrent(note, snapshot)
  const value = result.value

  if (value.blocks?.length) value.content = convertBlocksToMarkdown(value.blocks)

  return {
    value,
    status: current ? record.translationStatus : 'partial',
  }
}
