import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import { localizationRecord, type LocalizationSnapshot } from '@/lib/localization'
import { spotTranslationFields, spotTranslationSource, editSpotTranslation } from '@/lib/spot-localization-authoring'
import { extractResponsesApiJson, spotTranslationFieldLimit } from '@/lib/spot-localization-generation'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import {
  createLocalizationIO,
  readAuthoritativeLocalization,
  saveAndPublishLocalization,
} from '@/lib/server/localization-publisher.mjs'

const TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.6-luna'

const sourceKeys = [
  'description',
  'review',
  'address',
  'experience_zh',
  'seo_title_zh',
  'seo_description_zh',
] as const

const outputKeys = [
  'description',
  'review',
  'address',
  'experience_en',
  'seo_title_en',
  'seo_description_en',
] as const

type SourceKey = typeof sourceKeys[number]
type OutputKey = typeof outputKeys[number]
type TranslationSource = Record<SourceKey, string>
type TranslationOutput = Record<OutputKey, string>

export interface SpotEnglishSyncItem {
  id: number
  name: string
  translated: boolean
  skipped: boolean
  reason?: string
}

export interface SpotEnglishSyncResult {
  translated: number
  skipped: number
  items: SpotEnglishSyncItem[]
}

const translationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...outputKeys],
  properties: Object.fromEntries(outputKeys.map((key) => [key, { type: 'string' }])),
} as const

const translationInstructions = `Translate the supplied Chinese JnQ Journey Spot content into natural English.

Rules:
- Preserve factual meaning exactly. Do not invent facts, experiences, prices, opening hours, history, claims, recommendations, or promotional exaggeration.
- description: preserve Markdown structure exactly where practical, including H2-H4 headings, bullets, links, quotes, emojis, paragraph order, and line breaks.
- review: preserve Markdown structure and first-person personal-experience tone.
- address: keep concise and natural; do not invent missing address details.
- experience_en: faithfully translate experience_zh, preserving first-person tone, Markdown headings, bullets, emojis, and paragraph structure.
- seo_title_en: translate only seo_title_zh naturally and concisely, preserving place names and avoiding keyword stuffing.
- seo_description_en: translate only seo_description_zh into a natural meta description, preferably 160 characters or fewer without truncating mid-word.
- Do not translate URLs.
- Output English only.
- Every empty source field must produce an empty output string.`

function text(value: unknown) {
  return String(value || '').trim()
}

function sourceBundle(row: any): TranslationSource {
  return {
    description: text(row.description),
    review: text(row.review),
    address: text(row.address),
    experience_zh: text(row.experience_zh),
    seo_title_zh: text(row.seo_title_zh),
    seo_description_zh: text(row.seo_description_zh),
  }
}

function sourceHash(source: TranslationSource) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

function isLocalizationCurrent(record: ReturnType<typeof localizationRecord>, source: TranslationSource) {
  if (!record) return false
  for (const key of spotTranslationFields) {
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

function validateTranslationOutput(value: unknown, source: TranslationSource): TranslationOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI returned an invalid translation result.')
  const output = value as Record<string, unknown>
  const actual = Object.keys(output).sort()
  const expected = [...outputKeys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('AI returned an invalid translation result.')
  }

  const sourceForOutput: Record<OutputKey, string> = {
    description: source.description,
    review: source.review,
    address: source.address,
    experience_en: source.experience_zh,
    seo_title_en: source.seo_title_zh,
    seo_description_en: source.seo_description_zh,
  }

  const result = {} as TranslationOutput
  for (const key of outputKeys) {
    const translated = output[key]
    if (typeof translated !== 'string' || translated.length > spotTranslationFieldLimit) {
      throw new Error('AI returned an invalid translation result.')
    }
    if (!sourceForOutput[key] && translated.trim()) {
      throw new Error(`AI returned content for an empty ${key} source.`)
    }
    result[key] = translated.trim()
  }
  return result
}

async function generateTranslation(source: TranslationSource): Promise<TranslationOutput> {
  const empty = Object.values(source).every((value) => !value)
  if (empty) {
    return {
      description: '',
      review: '',
      address: '',
      experience_en: '',
      seo_title_en: '',
      seo_description_en: '',
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured for automatic English translation.')
  }

  if (Object.values(source).some((value) => value.length > spotTranslationFieldLimit)) {
    throw new Error('Spot source exceeds the 30k field limit.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TRANSLATION_MODEL,
      instructions: translationInstructions,
      input: JSON.stringify(source),
      tools: [],
      text: {
        format: {
          type: 'json_schema',
          name: 'spot_complete_english_translation',
          strict: true,
          schema: translationSchema,
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI English translation failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`)
  }

  return validateTranslationOutput(extractResponsesApiJson(await response.json()), source)
}

export async function syncSpotEnglishTranslations(ids: number[]): Promise<SpotEnglishSyncResult> {
  const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isSafeInteger(id) && id > 0)
  if (!uniqueIds.length) return { translated: 0, skipped: 0, items: [] }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration for English synchronization.')

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: rows, error } = await db.from('locations').select('*').in('id', uniqueIds)
  if (error) throw new Error(error.message || 'Unable to read Spots for English synchronization.')

  const rowMap = new Map((rows || []).map((row: any) => [Number(row.id), row]))
  const io = createLocalizationIO()
  const current = await readAuthoritativeLocalization(io)
  const generated: Array<{
    row: any
    source: TranslationSource
    hash: string
    canonicalPath: string
    output: TranslationOutput
  }> = []
  const items: SpotEnglishSyncItem[] = []

  for (const id of uniqueIds) {
    const row = rowMap.get(id)
    if (!row) {
      items.push({ id, name: `#${id}`, translated: false, skipped: true, reason: 'Spot not found' })
      continue
    }

    const source = sourceBundle(row)
    const hash = sourceHash(source)
    const record = localizationRecord(current.snapshot as LocalizationSnapshot, 'spot', id)
    const hashCurrent = record?.source?.contentHash === hash
    const localizationCurrent = isLocalizationCurrent(record, source)

    if (hashCurrent && localizationCurrent) {
      items.push({ id, name: String(row.name || `#${id}`), translated: false, skipped: true, reason: 'English is already current' })
      continue
    }

    try {
      const output = await generateTranslation(source)
      const canonicalPath = await buildCanonicalLocationPath(String(row.name || ''), id)
      generated.push({ row, source, hash, canonicalPath, output })
      items.push({ id, name: String(row.name || `#${id}`), translated: true, skipped: false })
    } catch (translationError) {
      items.push({
        id,
        name: String(row.name || `#${id}`),
        translated: false,
        skipped: true,
        reason: translationError instanceof Error ? translationError.message : 'English translation failed',
      })
    }
  }

  if (!generated.length) {
    return {
      translated: 0,
      skipped: items.filter((item) => item.skipped).length,
      items,
    }
  }

  for (const item of generated) {
    const { error: updateError } = await db
      .from('locations')
      .update({
        experience_en: item.output.experience_en,
        seo_title_en: item.output.seo_title_en,
        seo_description_en: item.output.seo_description_en,
      })
      .eq('id', item.row.id)
    if (updateError) throw new Error(`Unable to save English fields for Spot #${item.row.id}: ${updateError.message}`)
  }

  const version = `admin-batch-${randomUUID()}`
  await saveAndPublishLocalization(
    io,
    current.revision,
    (snapshot: LocalizationSnapshot) => {
      let next = snapshot
      for (const item of generated) {
        const edits = {
          description: { source: item.source.description, text: item.output.description },
          review: { source: item.source.review, text: item.output.review },
          address: { source: item.source.address, text: item.output.address },
        }
        next = editSpotTranslation(next, item.row, item.canonicalPath, edits, 'complete', version)
        const record = localizationRecord(next, 'spot', item.row.id)
        if (record) {
          record.source = {
            ...record.source,
            capturedAt: new Date().toISOString(),
            contentHash: item.hash,
          }
        }
      }
      return next
    }
  )

  return {
    translated: generated.length,
    skipped: items.filter((item) => item.skipped).length,
    items,
  }
}
