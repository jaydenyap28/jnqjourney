import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { generateGeminiJson } from '@/lib/server/gemini-json'
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
- The result must feel like a useful travel guide written for a traveller deciding whether and how to visit, not an encyclopedia, database note, internal reconciliation note, or social-media hype.
- The opening should quickly answer: what is this place, what is distinctive about it, and why would a traveller include it. Avoid generic filler such as merely saying it is "convenient", "worth stopping by", or "suitable for photos" unless the source supports a concrete reason.
- Never expose internal data-cleaning language to readers. Do not write phrases such as "这次旅程实际到访的同一地点", "在本篇记录中", "统一记录为", "不另列为", "资料尚未确认", or similar database/reconciliation wording. Convert useful context into natural visitor-facing prose or omit it.
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
- For restaurants/cafes, make the content food-led: explain the dining style, concrete signature dishes only when supported by source data, atmosphere when supported, who it suits, and how to fit it into the day's route. Interpret "什么时候最好看" as the best meal/visit timing. Do not pad restaurant pages with generic sightseeing language.
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

  const generated = await generateGeminiJson({
    instructions,
    input: JSON.stringify(source),
    schema: schema as unknown as Record<string, unknown>,
  })

  const description = validateDescription(generated)

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
