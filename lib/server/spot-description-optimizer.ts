import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { generateGeminiGroundedText } from '@/lib/server/gemini-grounded-text'
const REQUIRED_HEADINGS_BY_CATEGORY: Record<string, readonly string[]> = {
  attraction: [
    '## 介绍',
    '## ⭐ 必看亮点',
    '## 🍂 什么时候最好看',
    '## ❤️ 建议怎么玩',
    '## 👣 怎么去',
    '## 💡 JnQ 小提醒',
  ],
  food: [
    '## 介绍',
    '## 🍽️ 吃什么',
    '## ❤️ 建议怎么吃',
    '## 👣 怎么去',
    '## 💡 JnQ 小提醒',
  ],
  accommodation: [
    '## 介绍',
    '## ⭐ 住宿亮点',
    '## 🛏️ 适合怎么住',
    '## 👣 怎么去',
    '## 💡 JnQ 小提醒',
  ],
}

const instructions = `You are editing Chinese destination content for JnQ Journey.

Use Google Search grounding to research and then rewrite the supplied Spot into polished Simplified Chinese Markdown.

Choose the structure by what the place actually is after checking the supplied data and grounded search. The database category is only a hint and can occasionally be wrong:

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
- Every place-specific factual claim must be supported either by the supplied database fields or by information you verified through Google Search in this request.
- Do NOT invent history, architecture, attractions, dishes, prices, opening hours, transport lines, distances, rankings, awards, views, facilities, or personal experiences.
- When the supplied source is sparse, actively research the place with Google Search. If the identity is ambiguous or trustworthy information remains limited, write a shorter cautious description instead of filling gaps with guesses.
- Never present a common local custom as something this specific business/place definitely offers unless you verified it for this place.
- For food businesses, do not invent signature dishes, cooking methods, heritage status, queue situation, air-conditioning, parking, or opening patterns. Mention only details verified for that exact business.
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

function hasStandardStructure(value: string) {
  return Object.values(REQUIRED_HEADINGS_BY_CATEGORY).some((required) =>
    required.every((heading) => value.includes(heading))
  )
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

  const generated = await generateGeminiGroundedText({
    instructions,
    input: JSON.stringify(source),
  })

  const description = clean(generated.text)
  if (!description || description.length > 12000) throw new Error('Gemini returned an invalid Spot description.')
  if (!hasStandardStructure(description)) throw new Error('Gemini did not return a recognized JnQ Spot structure.')

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
