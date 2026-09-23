import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import type { TravelGuide } from '@/lib/guides'
import {
  isLocalizedTextPath,
  localizationRecord,
  type LocalizationRecord,
  type LocalizationSnapshot,
} from '@/lib/localization'
import { spotTranslationFieldLimit } from '@/lib/spot-localization-generation'
import { generateGeminiJson } from '@/lib/server/gemini-json'
import { readGuideBySlug } from '@/lib/server/guides-store'
import {
  createLocalizationIO,
  readAuthoritativeLocalization,
  saveAndPublishLocalization,
} from '@/lib/server/localization-publisher.mjs'

const MAX_TOTAL_SOURCE_CHARS = 120000
const HAS_HAN = /\p{Script=Han}/u

interface Segment {
  path: string
  text: string
}

export interface GuideEnglishSyncResult {
  slug: string
  translated: number
  current: number
  status: 'complete' | 'partial'
}

const schema = {
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

const instructions = `Translate the supplied JnQ Journey Travel Guide text segments into polished natural English.

Rules:
- Preserve factual meaning exactly. Do not invent places, experiences, prices, transport details, history, dates, claims, or recommendations.
- Translate day titles, route titles, summaries, highlights, tips, reminders, transport notes, accommodation notes, and attraction display names naturally.
- Keep every segment path exactly unchanged and return the same segments in the same order.
- For place and business names, use an established English or romanized public-facing name when clear. If there is no reliable established English name, use a concise readable romanization or descriptive English rendering rather than leaving Chinese characters.
- Do not translate URLs, codes, currency amounts, dates, or IDs.
- Keep "Day 1", "Day 2", etc. concise when present.
- Preserve the tone of a practical first-hand travel guide. Avoid marketing exaggeration.
- Output English only. Do not leave Chinese characters in the translated text.
`

function walkLocalizedText(node: unknown, path = '', out: Record<string, string> = {}) {
  if (typeof node === 'string') {
    const value = node.trim()
    if (value && path && isLocalizedTextPath(path)) out[path] = value
    return out
  }

  if (Array.isArray(node)) {
    node.forEach((child, index) => walkLocalizedText(child, path ? `${path}.${index}` : String(index), out))
    return out
  }

  if (node && typeof node === 'object') {
    Object.entries(node).forEach(([key, child]) =>
      walkLocalizedText(child, path ? `${path}.${key}` : key, out)
    )
  }

  return out
}

function sourceHash(source: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

function pendingSegments(
  guide: TravelGuide,
  record: LocalizationRecord | undefined
): { allSource: Record<string, string>; translatable: Record<string, string>; pending: Segment[]; current: number } {
  const allSource = walkLocalizedText(guide)
  const translatable = Object.fromEntries(
    Object.entries(allSource).filter(([, value]) => HAS_HAN.test(value))
  )

  let current = 0
  const pending: Segment[] = []

  for (const [path, source] of Object.entries(translatable)) {
    const field = record?.fields[path]
    if (field?.source === source && field.text.trim() && !HAS_HAN.test(field.text)) {
      current += 1
      continue
    }
    pending.push({ path, text: source })
  }

  return { allSource, translatable, pending, current }
}

function validateOutput(value: unknown, input: Segment[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI returned an invalid Guide translation.')
  }
  const raw = (value as { segments?: unknown }).segments
  if (!Array.isArray(raw) || raw.length !== input.length) {
    throw new Error('AI returned an incomplete Guide translation.')
  }

  const output: Record<string, string> = {}
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('AI returned an invalid Guide translation.')
    }
    const path = (item as { path?: unknown }).path
    const text = (item as { text?: unknown }).text
    const expected = input[index]

    if (path !== expected.path || typeof text !== 'string' || text.length > spotTranslationFieldLimit) {
      throw new Error('AI returned an invalid Guide translation.')
    }

    const translated = text.trim()
    if (!translated) throw new Error(`AI returned an empty translation for ${expected.path}.`)
    if (HAS_HAN.test(translated)) throw new Error(`AI left Chinese text in ${expected.path}.`)
    output[expected.path] = translated
  })

  return output
}

async function generateTranslations(input: Segment[]) {
  if (!input.length) return {} as Record<string, string>
  const totalChars = input.reduce((sum, item) => sum + item.text.length, 0)
  if (totalChars > MAX_TOTAL_SOURCE_CHARS || input.some((item) => item.text.length > spotTranslationFieldLimit)) {
    throw new Error('Guide English source exceeds the current automatic translation limit.')
  }

  const generated = await generateGeminiJson({
    instructions,
    input: JSON.stringify({ segments: input }),
    schema: schema as unknown as Record<string, unknown>,
  })

  return validateOutput(generated, input)
}

export async function syncGuideEnglish(slug: string): Promise<GuideEnglishSyncResult> {
  const guide = await readGuideBySlug(slug)
  if (!guide) throw new Error(`Guide not found: ${slug}`)

  const io = createLocalizationIO()
  const initial = await readAuthoritativeLocalization(io)
  const initialRecord = localizationRecord(initial.snapshot as LocalizationSnapshot, 'guide', guide.slug)
  const { allSource, translatable, pending, current } = pendingSegments(guide, initialRecord)

  const generated = await generateTranslations(pending)

  // Localization can change while Gemini is translating Spots in parallel.
  // Merge onto the newest snapshot instead of publishing against a stale revision.
  const latest = await readAuthoritativeLocalization(io)
  const version = `guide-auto-${randomUUID()}`

  await saveAndPublishLocalization(
    io,
    latest.revision,
    (snapshot: LocalizationSnapshot) => {
      const next = structuredClone(snapshot)
      next.version = version

      const existing = localizationRecord(next, 'guide', guide.slug)
      const record: LocalizationRecord = structuredClone(existing || {
        entityType: 'guide',
        entityId: guide.slug,
        locale: 'en',
        canonicalPath: `/guide/${guide.slug}`,
        translationStatus: 'missing',
        source: {
          url: `/guide/${guide.slug}`,
          capturedAt: new Date().toISOString(),
        },
        fields: {},
      })

      // Remove obsolete/stale Guide fields so they cannot keep a record partial.
      for (const [path, field] of Object.entries(record.fields)) {
        const currentSource = allSource[path]
        if (currentSource === undefined || field.source !== currentSource) delete record.fields[path]
      }

      for (const [path, text] of Object.entries(generated)) {
        record.fields[path] = { source: translatable[path], text }
      }

      const complete = Object.entries(translatable).every(([path, source]) => {
        const field = record.fields[path]
        return field?.source === source && Boolean(field.text.trim()) && !HAS_HAN.test(field.text)
      })

      record.canonicalPath = `/guide/${guide.slug}`
      record.translationStatus = complete ? 'complete' : 'partial'
      record.source = {
        ...record.source,
        url: record.source?.url || `/guide/${guide.slug}`,
        capturedAt: new Date().toISOString(),
        contentHash: sourceHash(allSource),
      }

      const index = next.records.findIndex(
        (candidate) => candidate.entityType === 'guide' && candidate.entityId === guide.slug && candidate.locale === 'en'
      )
      if (index >= 0) next.records[index] = record
      else next.records.push(record)

      return next
    }
  )

  return {
    slug: guide.slug,
    translated: pending.length,
    current,
    status: 'complete',
  }
}
