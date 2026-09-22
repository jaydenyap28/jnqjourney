import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import type { LongformNote } from '@/lib/notes'
import { noteTranslationIsCurrent, noteTranslationSegments } from '@/lib/note-localization'
import { type LocalizationRecord, type LocalizationSnapshot } from '@/lib/localization'
import {
  createLocalizationIO,
  readAuthoritativeLocalization,
  saveAndPublishLocalization,
} from '@/lib/server/localization-publisher.mjs'
import { extractResponsesApiJson, spotTranslationFieldLimit } from '@/lib/spot-localization-generation'

const TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.6-luna'
const NOTE_TOTAL_LIMIT = 120000

interface TranslationSegment {
  path: string
  text: string
}

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
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'text'],
        properties: {
          path: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
} as const

const instructions = `Translate the supplied JnQ Journey Longform Note text segments into natural English.

Rules:
- Preserve factual meaning, first-person travel experience, nuance, and editorial tone. Do not invent facts, prices, places, claims, experiences, recommendations, or promotional exaggeration.
- title and shortTitle should read like polished travel editorial headlines, not awkward literal translation.
- tagline and summary should stay concise.
- Paragraphs, headings and quotes should read naturally while preserving the original level of detail.
- Preserve inline Markdown structure, emphasis markers, links, URLs, numbers, currencies, times, phone numbers, and proper nouns accurately.
- Do not translate or alter URLs.
- Image alt/caption fields should be concise and descriptive.
- Keep every segment path exactly unchanged and return the same segments in the same order.
- Output English only.`

function sourceHash(source: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

function validateOutput(value: unknown, sourceEntries: TranslationSegment[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI returned an invalid Note translation.')
  const rawSegments = (value as { segments?: unknown }).segments
  if (!Array.isArray(rawSegments) || rawSegments.length !== sourceEntries.length) {
    throw new Error('AI returned an invalid Note translation.')
  }

  const translated: Record<string, string> = {}
  rawSegments.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('AI returned an invalid Note translation.')
    const path = (item as { path?: unknown }).path
    const text = (item as { text?: unknown }).text
    const source = sourceEntries[index]
    if (path !== source.path || typeof text !== 'string' || text.length > spotTranslationFieldLimit) {
      throw new Error('AI returned an invalid Note translation.')
    }
    if (source.text.trim() && !text.trim()) {
      throw new Error(`AI returned an empty translation for ${source.path}.`)
    }
    translated[source.path] = text.trim()
  })
  return translated
}

async function generate(source: Record<string, string>): Promise<Record<string, string>> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured for Note English translation.')

  const sourceEntries = Object.entries(source).map(([path, text]) => ({ path, text }))
  const totalLength = sourceEntries.reduce((sum, item) => sum + item.text.length, 0)
  if (totalLength > NOTE_TOTAL_LIMIT || sourceEntries.some((item) => item.text.length > spotTranslationFieldLimit)) {
    throw new Error('Longform Note exceeds the current English translation size limit.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TRANSLATION_MODEL,
      instructions,
      input: JSON.stringify({ segments: sourceEntries }),
      tools: [],
      text: {
        format: {
          type: 'json_schema',
          name: 'longform_note_english_translation',
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

  return validateOutput(extractResponsesApiJson(await response.json()), sourceEntries)
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
    source: Record<string, string>
    hash: string
    output: Record<string, string>
  }> = []
  const items: NoteCardEnglishSyncItem[] = []

  for (const note of unique) {
    const source = noteTranslationSegments(note)
    const hash = sourceHash(source)

    if (noteTranslationIsCurrent(note, current.snapshot as LocalizationSnapshot)) {
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
        next.version = `admin-note-${randomUUID()}`

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
          record.fields = {}

          for (const [path, sourceText] of Object.entries(item.source)) {
            const translated = item.output[path]
            if (sourceText.trim() && translated?.trim()) {
              record.fields[path] = { source: sourceText, text: translated }
            }
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
