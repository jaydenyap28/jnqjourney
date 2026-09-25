import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { generateGeminiJson } from '@/lib/server/gemini-json'
// All public Spot categories use one shared timing heading; this also lets legacy structures re-enter optimization.
const instructions = `You are editing Chinese destination content for JnQ Journey.

Rewrite the supplied Spot into polished Simplified Chinese Markdown using ONLY the supplied source fields. Do not use outside knowledge, model memory, assumptions, or generic facts about similar places.

Choose the structure by the supplied place information. The database category is a hint and can occasionally be wrong:

Use an editorial structure with NO emoji in headings.

The only required section is:
## 介绍

Add the following sections only when the supplied source contains useful, place-specific evidence for them. Omit a section entirely rather than filling it with generic planning language.

For attraction, optional sections:
## 看点
## 什么时候去
## 怎么安排
## 交通与到达
## JnQ 提醒

For food, optional sections:
## 值得看什么
## 吃什么
## 什么时候去
## 用餐建议
## 交通与到达
## JnQ 提醒

For accommodation, optional sections:
## 住宿亮点
## 什么时候去
## 住宿建议
## 交通与到达
## JnQ 提醒

Do not create a section unless it adds information a traveller can actually use.

Editorial rules:
- The result must feel like a useful travel guide written for a traveller deciding whether and how to visit, not an encyclopedia, database note, internal reconciliation note, or social-media hype.
- The opening should quickly answer: what is this place, what is distinctive about it, and why would a traveller include it. Avoid generic filler such as merely saying it is "convenient", "worth stopping by", or "suitable for photos" unless the source supports a concrete reason.
- Never expose internal data-cleaning, sourcing, recovery, or provenance language to readers. Do not write phrases such as "旧行程记录", "现有记录", "现有资料", "资料中记录", "住宿记录显示", "同次行程记录", "本次记录", "根据记录", "在本篇记录中", "统一记录为", "不另列为", "资料尚未确认", or similar wording. Preserve the underlying fact, but rewrite it directly as natural visitor-facing prose. If there is no useful fact underneath, omit the sentence or section entirely.
- Preserve ALL useful factual details already present in the source. Restructure and polish them; do not summarize them away.
- Treat numbers and operational details as high-priority facts to preserve: times, seasons, dates, prices, distances, durations, quantities, free/paid status, exact route guidance, named viewpoints, dishes, facilities, and concrete first-hand logistics.
- legacy_archive_summary, when present, is an archived pre-optimizer public summary. Use it as recovery evidence for useful facts that may have disappeared from the current description.
- If legacy_archive_summary conflicts with current structured fields such as address, opening_hours_for_context_only or price_info_for_context_only, prefer the current structured field and omit the conflicting archived claim.
- If the existing description contains a useful fact such as "夏季约19:00亮灯、秋冬约18:00", that fact must survive in the rewrite unless another supplied source field directly contradicts it.
- Do not delete a meaningful practical detail just to make the writing shorter.
- Every place-specific factual claim must be directly supported by the supplied fields. If a detail is not explicitly present in the supplied fields, treat it as unknown and omit it.
- Do NOT invent history, architecture, attractions, dishes, cooking methods, prices, opening hours, transport lines, distances, rankings, awards, views, facilities, payment methods, queue patterns, parking, or personal experiences.
- Do not use general world knowledge about the place, city, cuisine, brand, or business as a substitute for source evidence.
- When the source is sparse, write a shorter useful description instead of filling gaps with guesses. It is acceptable for a simple Spot to stay concise.
- Never present a common local custom as something this specific business/place definitely offers unless you verified it for this place.
- For food businesses, mention a dish, drink, cooking method, heritage claim, atmosphere detail, or facility only when it appears in the supplied source fields.
- Do not turn subjective user experience into objective fact.
- Personal first-hand experience belongs in a separate JnQ Experience field, so this description should stay primarily objective.
- Do not include ticket prices, admission fees, menu prices, exact opening hours, or operating schedules in the main description, even when Google Search finds them. Those belong in separate structured Column Info fields.
- Use "什么时候去" only when the source supports genuinely useful timing guidance. For attractions, this may be season/light/route timing; for food, meal/visit timing; for accommodation, arrival/stay timing. Do not quote ordinary opening hours in the prose, but DO preserve useful timing facts that affect the experience, such as seasonal lighting times, sunset timing, show times, ferry cutoffs, or the user's recorded best arrival time. If the source does not support specific timing guidance, omit the section entirely.
- Never add generic advice based only on the category or local custom. For example, do not say to bring cash, expect queues, expect street parking, expect no air-conditioning, or expect shared tables unless that exact place was verified for that exact detail.
- Avoid hype such as "必访", "不容错过", "绝佳", "最纯正", or unsupported superlatives. Explain concrete reasons instead.
- Avoid research-process language such as "官方资料显示", "根据资料", "网上资料", "据称".
- Avoid excessive emoji, exclamation marks, marketing language, and exaggerated superlatives.
- Use natural Malaysian/Singaporean Chinese travel-writing style, but in Simplified Chinese.
- Same-section narrative should stay in compact paragraphs rather than being broken into many tiny lines.
- In 看点 / 住宿亮点 / 值得看什么, use "-" bullets only when there are at least two concrete supported points; otherwise use one compact paragraph.
- In JnQ 提醒, use compact consecutive "-" bullets, and omit the section when there is no useful place-specific reminder.
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
- If unsafe, return a corrected_description that removes every unsupported claim while preserving the full JnQ Markdown structure already present in candidate_description.
- "## 介绍" must remain. Every other H2 section is optional.
- If a non-introduction section has no useful place-specific evidence, remove that entire section instead of filling it with neutral or generic planning text.
- Generic filler such as "可按当天路线灵活安排。", "可根据自己的行程节奏安排停留。" or "可按页面地址与地图导航前往。" should not appear in the final public description.
- Public copy must not mention its evidence source or recovery process. Phrases such as "旧行程记录", "现有记录", "现有资料", "资料中记录", "住宿记录显示", "同次行程记录", "本次记录" or "根据记录" are editorial leakage. Mark safe=false and rewrite the same supported fact directly for travellers.
- Mark safe=false when the candidate omits useful supported facts from the source, even if every sentence it kept is factually safe. Add each omission to unsupported_claims prefixed with "MISSING:" and restore those facts in corrected_description.
- Pay special attention to omitted numbers, times, seasons, prices, distances, durations, free/paid status, route details and named viewpoints.
- For "交通与到达", include the section only when the source contains useful transport/location guidance beyond merely repeating the address. Do not invent a route, station, walking time, parking condition, or transport mode.
- Never expand a neutral fallback into unsupported details such as "白天前来", "可以进入", "现场参拜", "避开人潮", "光线更好", "方便停车", or similar claims unless the source explicitly supports them.
- Do not collapse all supported facts into "## 介绍" when they naturally belong in a category section. For example, verified food offerings belong under "## 🍽️ 吃什么", verified stay characteristics under the accommodation section, and verified attraction features under highlights.
- It is acceptable for a section to be very short when the source is sparse.
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
    model: process.env.GEMINI_VERIFIER_MODEL || 'gemini-3.5-flash-lite',
  })

  const safe = result.safe === true
  const unsupported = Array.isArray(result.unsupported_claims)
    ? result.unsupported_claims.map((item) => clean(item)).filter(Boolean)
    : []
  const corrected = clean(result.corrected_description)

  if (!corrected) throw new Error('Gemini verifier returned an empty Spot description.')
  return { safe, unsupported, corrected }
}

function buildEvidenceSafeFallback(source: {
  name: string
  name_cn: string
  category: string
  address: string
  region: { name: string; name_cn: string; country: string }
}) {
  const displayName = clean(source.name_cn) || clean(source.name) || '这个地点'
  const regionName = clean(source.region?.name_cn) || clean(source.region?.name)
  const address = clean(source.address)
  const intro = address
    ? `${displayName}位于${address}。`
    : regionName
      ? `${displayName}位于${regionName}。`
      : `${displayName}。`

  return `## 介绍

${intro}`
}

function fillEmptyTipsSection(value: string) {
  return value
}

const disallowedPublicPatterns = [
  '可按当天路线灵活安排',
  '可根据自己的行程节奏安排停留',
  '可按页面地址与地图导航前往',
  '可结合页面照片与自己的兴趣判断是否安排停留',
  '可结合页面照片与自己的住宿需求判断是否适合',
  '可结合页面照片与自己的用餐偏好决定',
  '旧行程记录',
  '现有记录',
  '现有资料',
  '资料中记录',
  '住宿记录显示',
  '同次行程记录',
  '本次记录',
  '根据记录',
]

function hasStandardStructure(value: string) {
  return value.includes('## 介绍') && !disallowedPublicPatterns.some((pattern) => value.includes(pattern))
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
  const { data: queueState } = await supabase
    .from('spot_description_optimization_queue')
    .select('legacy_archive_summary')
    .eq('spot_id', spotId)
    .maybeSingle()
  const legacyArchiveSummary = clean(queueState?.legacy_archive_summary)

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
    legacy_archive_summary: legacyArchiveSummary,
    existing_review: clean(row.review),
    existing_experience_for_context_only: clean(row.experience_zh),
  }

  await supabase
    .from('spot_description_optimization_queue')
    .update({ source_snapshot: source })
    .eq('spot_id', spotId)

  const evidenceChars =
    existingDescription.length +
    legacyArchiveSummary.length +
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
    model: process.env.GEMINI_CONTENT_MODEL || 'gemini-3.5-flash',
  })

  const candidate = clean(generated.description)
  if (!candidate || candidate.length > maxOutputChars + 120 || !hasStandardStructure(candidate)) {
    const description = buildEvidenceSafeFallback(source)
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
      fallback: true,
    }
  }

  const firstCheck = await verifyDescription(source, candidate)
  let description = firstCheck.safe ? candidate : firstCheck.corrected

  if (!description.includes('## 介绍')) {
    throw new Error('Source is too sparse for a safe structured rewrite.')
  }

  if (!firstCheck.safe) {
    const secondCheck = await verifyDescription(source, description)
    description = secondCheck.safe ? secondCheck.corrected : buildEvidenceSafeFallback(source)
  }

  description = fillEmptyTipsSection(description)

  if (!hasStandardStructure(description)) {
    throw new Error('Verified Spot rewrite lost the required JnQ structure.')
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
