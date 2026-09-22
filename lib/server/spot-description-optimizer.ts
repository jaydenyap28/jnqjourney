import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { extractResponsesApiJson } from '@/lib/spot-localization-generation'

const CONTENT_MODEL = process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.6-luna'
const REQUIRED_HEADINGS = [
  '## 介绍',
  '## ⭐ 必看亮点',
  '## 🍂 什么时候最好看',
  '## ❤️ 建议怎么玩',
  '## 👣 怎么去',
  '## 💡 JnQ 小提醒',
] as const

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['description'],
  properties: {
    description: { type: 'string' },
  },
} as const

const instructions = `You are editing Chinese destination content for JnQ Journey.

Rewrite the supplied Spot into polished Simplified Chinese Markdown using EXACTLY these six sections and this order:
## 介绍
## ⭐ 必看亮点
## 🍂 什么时候最好看
## ❤️ 建议怎么玩
## 👣 怎么去
## 💡 JnQ 小提醒

Editorial rules:
- The result must feel like a useful travel guide, not an encyclopedia and not social-media hype.
- Preserve useful factual details already present in the source. Do not delete a meaningful practical detail just to make the writing shorter.
- Do NOT invent history, architecture, attractions, dishes, prices, opening hours, transport lines, distances, rankings, awards, views, facilities, or personal experiences.
- When the source is sparse, stay conservative. It is better to write practical category-level advice than to fabricate place-specific claims.
- Do not turn subjective user experience into objective fact.
- Personal first-hand experience belongs in a separate JnQ Experience field, so this description should stay primarily objective.
- Do not include ticket prices or opening hours in the main description. Those are maintained in separate structured fields.
- Avoid research-process language such as "官方资料显示", "根据资料", "网上资料", "据称".
- Avoid excessive emoji, exclamation marks, marketing language, and exaggerated superlatives.
- Use natural Malaysian/Singaporean Chinese travel-writing style, but in Simplified Chinese.
- Same-section narrative should stay in compact paragraphs rather than being broken into many tiny lines.
- In 必看亮点, use "-" bullets with a blank line between major bullets; each bullet may have a short explanatory paragraph.
- In JnQ 小提醒, use compact consecutive "-" bullets.
- For restaurants/cafes, interpret "什么时候最好看" as the best time to visit/eat rather than literally visual scenery.
- For accommodation, interpret it as the most suitable stay/use timing.
- For transport locations, interpret it as the most useful time to use or visit.
- Do not mention that you are an AI.
- Target roughly 600-1200 Chinese characters when the source supports it; use less for simple places rather than padding with invented detail.
`

function clean(value: unknown) {
  return String(value || '').trim()
}

function hasStandardStructure(value: string) {
  return REQUIRED_HEADINGS.every((heading) => value.includes(heading))
}

function validateDescription(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI returned an invalid Spot description.')
  const description = clean((value as { description?: unknown }).description)
  if (!description || description.length > 12000) throw new Error('AI returned an invalid Spot description.')
  if (!hasStandardStructure(description)) throw new Error('AI did not return the required JnQ Spot structure.')
  return description
}

export async function optimizeSpotDescription(spotId: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration for Spot optimization.')
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured for Spot optimization.')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: row, error } = await supabase
    .from('locations')
    .select('id,name,name_cn,category,address,description,review,experience_zh,tags,visit_date,region_id,regions:region_id(id,name,name_cn,country)')
    .eq('id', spotId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Unable to load Spot for optimization.')
  if (!row) return { skipped: true, reason: 'Spot not found or inactive.' }

  const existingDescription = clean(row.description)
  if (hasStandardStructure(existingDescription)) {
    return { skipped: true, reason: 'Spot description already uses the JnQ structure.' }
  }

  const region = Array.isArray((row as any).regions) ? (row as any).regions[0] : (row as any).regions
  const source = {
    id: Number(row.id),
    name: clean(row.name),
    name_cn: clean(row.name_cn),
    category: clean(row.category),
    address: clean(row.address),
    region: {
      name: clean(region?.name),
      name_cn: clean(region?.name_cn),
      country: clean(region?.country),
    },
    visit_date: clean(row.visit_date),
    tags: Array.isArray(row.tags) ? row.tags : [],
    existing_description: existingDescription,
    existing_review: clean(row.review),
    existing_experience_for_context_only: clean(row.experience_zh),
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CONTENT_MODEL,
      instructions,
      input: JSON.stringify(source),
      tools: [],
      text: {
        format: {
          type: 'json_schema',
          name: 'jnq_spot_description',
          strict: true,
          schema,
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI Spot optimization failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`)
  }

  const description = validateDescription(extractResponsesApiJson(await response.json()))

  const { error: updateError } = await supabase
    .from('locations')
    .update({ description })
    .eq('id', spotId)

  if (updateError) throw new Error(updateError.message || 'Unable to save optimized Spot description.')

  return {
    skipped: false,
    id: spotId,
    name: clean(row.name),
    chars: description.length,
  }
}
