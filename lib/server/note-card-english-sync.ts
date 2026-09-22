import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import type { LongformNote } from '@/lib/notes'
import { localizationRecord, type LocalizationRecord, type LocalizationSnapshot } from '@/lib/localization'
import {
  createLocalizationIO,
  readAuthoritativeLocalization,
  saveAndPublishLocalization,
} from '@/lib/server/localization-publisher.mjs'
import { extractResponsesApiJson, spotTranslationFieldLimit } from '@/lib/spot-localization-generation'

const TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.6-luna'
const CARD_FIELDS = ['title', 'shortTitle', 'tagline', 'summary'] as const
type CardField = typeof CARD_FIELDS[number]
type NoteCardSource = Record<CardField, string>
type NoteCardTranslation = Record<CardField, string>

export interface NoteCardEnglishSyncItem {
  slug: string
  title: string
  translated: boolean
  skipped: boolean
  reason?: string
}

export interface NoteCardEnglishSyncResult {
  translated: number
  skipped: number
  items: NoteCardEnglishSyncItem[]
}

const translationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...CARD_FIELDS],
  properties: Object.fromEntries(CARD_FIELDS.map((key) => [key, { type: 'string' }])),
} as const

const instructions = `Translate the supplied JnQ Journey Longform Note card text into natural English.

Rules:
- Preserve the meaning and tone. Do not invent facts, claims, prices, places, experiences, or recommendations.
- title and shortTitle should read like polished travel editorial headlines, not literal machine translation.
- tagline and summary should be concise, natural English suitable for homepage cards.
- Preserve URLs and any bracket tokens such as [img:...], [image:...], [spot:...], or [location:...] exactly.
- If a source field is empty, output an empty string for that field.
- Output English only.`

function clean(value: unknown) {
  return String(value || '').trim()
}

function sourceFor(note: LongformNote): NoteCardSource {
  return {
    title: clean(note.title),
    shortTitle: clean(note.shortTitle || note.title),
    tagline: clean(note.tagline),
    summary: clean(note.summary),
  }
}

function sourceHash(source: NoteCardSource) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

function recordIsCurrent(record: LocalizationRecord | undefined, source: NoteCardSource, hash: string) {
  if (!record || record.source?.contentHash !== hash) return false
  for (const key of CARD_FIELDS) {
    const sourceText = source[key]
    const field = record.fields[key]
    if (!sourceText) {
      if (field?.text?.trim()) return false
      continue
    }
    if (!field?.text?.trim() || field.source !== sourceText) return false
  }
  return true
}

function validateOutput(value: unknown, source: NoteCardSource): NoteCardTranslation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI returned an invalid Note card translation.')
  const output = value as Record<string, unknown>
  const expected = [...CARD_FIELDS].sort()
  const actual = Object.keys(output).sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('AI returned an invalid Note card translation.')
  }

  const result = {} as NoteCardTranslation
  for (const key of CARD_FIELDS) {
    const translated = output[key]
    if (typeof translated !== 'string' || translated.length > spotTranslationFieldLimit) {
      throw new Error('AI returned an invalid Note card translation.')
    }
    if (!source[key] && translated.trim()) throw new Error(`AI returned content for an empty ${key} source.`)
    result[key] = translated.trim()
  }
  return result
}

async function generate(source: NoteCardSource): Promise<NoteCardTranslation> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured for Note English translation.')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TRANSLATION_MODEL,
      instructions,
      input: JSON.stringify(source),
      tools: [],
      text: {
        format: {
          type: 'json_schema',
          name: 'note_homepage_card_english_translation',
          strict: true,
          schema: translationSchema,
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI Note translation failed (${response.status})${detail ? `: ${detail.slice(0, 220)}` : ''}`)
  }

  return validateOutput(extractResponsesApiJson(await response.json()), source)
}

export async function syncNoteCardEnglish(notes: LongformNote[]): Promise<NoteCardEnglishSyncResult> {
  const unique = Array.from(new Map(
    notes
      .filter((note) => note.published && note.slug && note.title)
      .map((note) => [note.slug, note])
  ).values())

  if (!unique.length) return { translated: 0, skipped: 0, items: [] }

  const io = createLocalizationIO()
  const current = await readAuthoritativeLocalization(io)
  const generated: Array<{
    note: LongformNote
    source: NoteCardSource
    hash: string
    output: NoteCardTranslation
  }> = []
  const items: NoteCardEnglishSyncItem[] = []

  for (const note of unique) {
    const source = sourceFor(note)
    const hash = sourceHash(source)
    const record = localizationRecord(current.snapshot as LocalizationSnapshot, 'page', `notes/${note.slug}`)

    if (recordIsCurrent(record, source, hash)) {
      items.push({ slug: note.slug, title: note.title, translated: false, skipped: true, reason: 'English is already current' })
      continue
    }

    try {
      const output = await generate(source)
      generated.push({ note, source, hash, output })
      items.push({ slug: note.slug, title: note.title, translated: true, skipped: false })
    } catch (error) {
      items.push({
        slug: note.slug,
        title: note.title,
        translated: false,
        skipped: true,
        reason: error instanceof Error ? error.message : 'English translation failed',
      })
    }
  }

  if (generated.length) {
    await saveAndPublishLocalization(
      io,
      current.revision,
      (snapshot: LocalizationSnapshot) => {
        const next = structuredClone(snapshot)
        next.version = `admin-note-card-${randomUUID()}`

        for (const item of generated) {
          const entityId = `notes/${item.note.slug}`
          const index = next.records.findIndex(
            (record) => record.entityType === 'page' && record.entityId === entityId && record.locale === 'en'
          )
          const previous = index >= 0 ? next.records[index] : undefined
          const record: LocalizationRecord = structuredClone(previous || {
            entityType: 'page',
            entityId,
            locale: 'en',
            canonicalPath: `/notes/${item.note.slug}`,
            translationStatus: 'complete',
            source: { url: `/notes/${item.note.slug}`, capturedAt: new Date().toISOString() },
            fields: {},
          })

          record.canonicalPath = `/notes/${item.note.slug}`
          record.translationStatus = 'complete'
          record.source = {
            ...record.source,
            url: `/notes/${item.note.slug}`,
            capturedAt: new Date().toISOString(),
            contentHash: item.hash,
          }

          for (const key of CARD_FIELDS) {
            const sourceText = item.source[key]
            const translated = item.output[key]
            if (sourceText && translated) record.fields[key] = { source: sourceText, text: translated }
            else delete record.fields[key]
          }

          if (index >= 0) next.records[index] = record
          else next.records.push(record)
        }

        return next
      }
    )
  }

  return {
    translated: generated.length,
    skipped: items.filter((item) => item.skipped).length,
    items,
  }
}
