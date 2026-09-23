import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { generateGeminiJson } from '@/lib/server/gemini-json'
const instructions = `You are editing Chinese destination content for JnQ Journey.

Rewrite the supplied Spot into polished Simplified Chinese Markdown using ONLY the supplied source fields. Do not use outside knowledge, model memory, assumptions, or generic facts about similar places.

Choose the structure by the supplied place information. The database category is a hint and can occasionally be wrong:

For attraction:
## 介绍
## ⭐ 必看亮点
## 🍂 什么时候最好看
## ❤️ 建议怎么玩
## 👣 怎么去
## 💡 JnQ 小提醒

For food:
## 介绍
## 🍽️ 吃什么
## ❤️ 建议怎么吃
## 👣 怎么去
## 💡 JnQ 小提醒

For accommodation:
## 介绍
## ⭐ 住宿亮点
## 🛏️ 适合怎么住
## 👣 怎么去
## 💡 JnQ 小提醒

A food place that genuinely includes a separate attraction/experience area may add one optional section:
## ⭐ 值得看什么
Place it before "## 🍽️ 吃什么".

Editorial rules:
- The result must feel like a useful travel guide written for a traveller deciding whether and how to visit, not an encyclopedia, database note, internal reconciliation note, or social-media hype.
- The opening should quickly answer: what is this place, what is distinctive about it, and why would a traveller include it. Avoid generic filler such as merely saying it is "convenient", "worth stopping by", or "suitable for photos" unless the source supports a concrete reason.
- Never expose internal data-cleaning language to readers. Do not write phrases such as "这次旅程实际到访的同一地点", "在本篇记录中", "统一记录为", "不另列为", "资料尚未确认", or similar database/reconciliation wording. Convert useful context into natural visitor-facing prose or omit it.
- Preserve useful factual details already present in the source. Do not delete a meaningful practical detail just to make the writing shorter.
- Every place-specific factual claim must be directly supported by the supplied fields. If a detail is not explicitly present in the supplied fields, treat it as unknown and omit it.
- Do NOT invent history, architecture, attractions, dishes, cooking methods, prices, opening hours, transport lines, distances, rankings, awards, views, facilities, payment methods, queue patterns, parking, or personal experiences.
- Do not use general world knowledge about the place, city, cuisine, brand, or business as a substitute for source evidence.
- When the source is sparse, write a shorter useful description instead of filling gaps with guesses. It is acceptable for a simple Spot to stay concise.
- Never present a common local custom as something this specific business/place definitely offers unless you verified it for this place.
- For food businesses, mention a dish, drink, cooking method, heritage claim, atmosphere detail, or facility only when it appears in the supplied source fields.
- Do not turn subjective user experience into objective fact.
- Personal first-hand experience belongs in a separate JnQ Experience field, so this description should stay primarily objective.
- Do not include ticket prices, admission fees, menu prices, exact opening hours, or operating schedules in the main description, even when Google Search finds them. Those belong in separate structured Column Info fields.
- For attractions, in "什么时候最好看", describe season/light/route timing in general terms without quoting exact operating hours. Food and accommodation pages do not use this section.
- Never add generic advice based only on the category or local custom. For example, do not say to bring cash, expect queues, expect street parking, expect no air-conditioning, or expect shared tables unless that exact place was verified for that exact detail.
- Avoid hype such as "必访", "不容错过", "绝佳", "最纯正", or unsupported superlatives. Explain concrete reasons instead.
- Avoid research-process language such as "官方资料显示", "根据资料", "网上资料", "据称".
- Avoid excessive emoji, exclamation marks, marketing language, and exaggerated superlatives.
- Use natural Malaysian/Singaporean Chinese travel-writing style, but in Simplified Chinese.
- Same-section narrative should stay in compact paragraphs rather than being broken into many tiny lines.
- In 必看亮点, use "-" bullets with a blank line between major bullets; each bullet may have a short explanatory paragraph.
- In JnQ 小提醒, use compact consecutive "-" bullets.
- For restaurants/cafes, make the content food-led: explain the dining style, concrete signature dishes only when supported by source data or grounded search, atmosphere when supported, who it suits, and how to fit it into the day's route. Do not pad restaurant pages with generic sightseeing language.
- For accommodation, focus on room/stay character, practical strengths, location/use case, and who it suits. Do not turn it into a sightseeing article.
- For transport locations, interpret it as the most useful time to use or visit.
- Do not mention that you are an AI.
- Target roughly 600-1200 Chinese characters when the source supports it; use less for simple places rather than padding with invented detail.
`

function clean(value: unknown) {
  return String(value || '').trim()
}


const verificationSchema = {
  type: 'object',
  properties: {
    safe: { type: 'boolean' },
    unsupported_claims: {
      type: 'array',
      items: { type: 'string' },
    },
    corrected_description: { type: 'string' },
  },
  required: ['safe', 'unsupported_claims', 'corrected_description'],
} as const

const verificationInstructions = `You are a strict factual editor for JnQ Journey.

You will receive:
1) source: the ONLY allowed evidence for this Spot
2) candidate_description: a generated public-facing Chinese description

Rules:
- Treat only the supplied source as truth. Do not use memory, outside knowledge, common customs, or assumptions.
- Mark safe=false if ANY factual or practical claim is not explicitly supported by source.
- Unsupported generic advice also counts as unsafe when it asserts place-specific behavior or conditions. Examples: quieter in the morning, queues, parking availability, dress rules, prayer etiquette, best light, recommended dishes, signature items, local popularity, famous/oldest/history, facilities, atmosphere, views, or crowd patterns unless source supports them.
- Rephrasing is allowed only when it preserves the exact factual meaning of source.
- If unsafe, return a corrected_description that removes every unsupported claim while preserving as much of the useful JnQ Markdown structure as the evidence allows.
- Do not collapse all supported facts into "## 介绍" when they naturally belong in a category section. For example, verified food offerings belong under "## 🍽️ 吃什么", verified stay characteristics under the accommodation section, and verified attraction features under highlights.
- Omit a section only when there is genuinely no source-supported content for it. It is acceptable for the remaining sections to be short.
- Do not add new facts while correcting.
- If safe, corrected_description must equal candidate_description exactly.
- Output Simplified Chinese only inside corrected_description.`

async function verifyDescription(source: unknown, candidate: string) {
  const result = await generateGeminiJson<{
    safe?: unknown
    unsupported_claims?: unknown
    corrected_description?: unknown
  }>({
    instructions: verificationInstructions,
    input: JSON.stringify({ source, candidate_description: candidate }),
    schema: verificationSchema as unknown as Record<string, unknown>,
    temperature: 0,
    model: process.env.GEMINI_VERIFIER_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  })

  const safe = result.safe === true
  const unsupported = Array.isArray(result.unsupported_claims)
    ? result.unsupported_claims.map((item) => clean(item)).filter(Boolean)
    : []
  const corrected = clean(result.corrected_description)

  if (!corrected) throw new Error('Gemini verifier returned an empty Spot description.')
  return { safe, unsupported, corrected }
}

function hasStandardStructure(value: string) {
  const base =
    value.includes('## 介绍') &&
    value.includes('## 👣 怎么去') &&
    value.includes('## 💡 JnQ 小提醒')

  const attraction =
    value.includes('## ⭐ 必看亮点') &&
    value.includes('## 🍂 什么时候最好看') &&
    value.includes('## ❤️ 建议怎么玩')

  const food =
    value.includes('## 🍽️ 吃什么') &&
    value.includes('## ❤️ 建议怎么吃')

  const accommodation =
    value.includes('## ⭐ 住宿亮点') &&
    value.includes('## 🛏️ 适合怎么住')

  return base && (attraction || food || accommodation)
}

export async function optimizeSpotDescription(spotId: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration for Spot optimization.')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: row, error } = await supabase
    .from('locations')
    .select('id,name,name_cn,category,address,description,review,experience_zh,tags,visit_date,opening_hours,price_info,region_id,regions:region_id(id,name,name_cn,country)')
    .eq('id', spotId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Unable to load Spot for optimization.')
  if (!row) return { skipped: true, reason: 'Spot not found or inactive.' }

  const existingDescription = clean(row.description)
  const category = clean(row.category) || 'attraction'
  if (hasStandardStructure(existingDescription)) {
    return { skipped: true, reason: 'Spot description already uses the JnQ structure.' }
  }

  const region = Array.isArray((row as any).regions) ? (row as any).regions[0] : (row as any).regions
  const source = {
    id: Number(row.id),
    name: clean(row.name),
    name_cn: clean(row.name_cn),
    category,
    address: clean(row.address),
    region: {
      name: clean(region?.name),
      name_cn: clean(region?.name_cn),
      country: clean(region?.country),
    },
    visit_date: clean(row.visit_date),
    opening_hours_for_context_only: row.opening_hours || null,
    price_info_for_context_only: row.price_info || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    existing_description: existingDescription,
    existing_review: clean(row.review),
    existing_experience_for_context_only: clean(row.experience_zh),
  }

  const evidenceChars =
    existingDescription.length +
    clean(row.review).length +
    clean(row.experience_zh).length +
    clean(row.address).length +
    JSON.stringify(Array.isArray(row.tags) ? row.tags : []).length

  const maxOutputChars = evidenceChars < 150 ? 600 : evidenceChars < 400 ? 900 : 1300

  const generated = await generateGeminiJson<{ description?: unknown }>({
    instructions: `${instructions}\n- Keep the finished description at or below ${maxOutputChars} Chinese characters. Do not pad the text to reach a target length.`,
    input: JSON.stringify(source),
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
      },
      required: ['description'],
    },
    temperature: 0.1,
    model: process.env.GEMINI_CONTENT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  })

  const candidate = clean(generated.description)
  if (!candidate || candidate.length > maxOutputChars + 120) throw new Error('Gemini returned an invalid Spot description.')
  if (!hasStandardStructure(candidate)) throw new Error('Gemini did not return a recognized JnQ Spot structure.')

  const firstCheck = await verifyDescription(source, candidate)
  let description = firstCheck.safe ? candidate : firstCheck.corrected

  if (!description.includes('## 介绍')) {
    throw new Error('Gemini verifier removed the Spot introduction.')
  }

  if (!firstCheck.safe) {
    const secondCheck = await verifyDescription(source, description)
    if (!secondCheck.safe) {
      throw new Error(
        `Gemini factual verification failed: ${secondCheck.unsupported.slice(0, 3).join(' | ') || 'unsupported claims remain'}`
      )
    }
    description = secondCheck.corrected
  }

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
