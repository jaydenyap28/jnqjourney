import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { createLocalizationIO, readAuthoritativeLocalization } from '@/lib/server/localization-publisher.mjs'
import { spotTranslationSource } from '@/lib/spot-localization-authoring'
import { assertCurrentSpotGenerationRequest, extractResponsesApiJson, parseSpotEnglishGeneration, spotEnglishGenerationSchema, spotTranslationFieldLimit } from '@/lib/spot-localization-generation'

export const config = { api: { bodyParser: { sizeLimit: '128kb' } } }

const translationInstructions = `Translate the supplied Chinese JnQ Journey travel content into natural English. Preserve factual meaning exactly. Do not add facts, opening hours, prices, history, claims, recommendations, or promotional exaggeration. Preserve Markdown structure in description and review, including headings, bullets, links, and paragraph breaks. Keep proper nouns and place names accurate. Keep address concise and natural. Do not translate URLs. Output English only. Each empty source field must produce an empty string.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  const auth = await requireAdminRequest(new Request('http://localhost/api/admin/spot-localization/generate', { headers: { authorization: req.headers.authorization || '' } }))
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())
  if (req.method !== 'POST') return res.status(405).end()
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: '未配置 OPENAI_API_KEY，管理员无法生成英文草稿。' })

  const id = Number(req.query.id)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Spot ID' })

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { data: row, error } = await db.from('locations').select('*').eq('id', id).single()
    if (error || !row) return res.status(404).json({ error: 'Spot not found' })
    const spot = { ...row, id, name: String(row.name || ''), description: String(row.description || '').trim() || null, review: String(row.review || '').trim() || null, address: String(row.address || '').trim() || null }
    const source = spotTranslationSource(spot)
    if (Object.values(source).some((text) => text.length > spotTranslationFieldLimit)) return res.status(400).json({ error: 'Spot source exceeds the 30k field limit.' })

    const current = await readAuthoritativeLocalization(createLocalizationIO())
    assertCurrentSpotGenerationRequest(req.body, current.revision, source)

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.6-luna',
        instructions: translationInstructions,
        input: JSON.stringify(source),
        tools: [],
        text: { format: { type: 'json_schema', name: 'spot_english_translation', strict: true, schema: spotEnglishGenerationSchema } },
      }),
    })
    if (!openaiResponse.ok) return res.status(502).json({ error: 'OpenAI 英文草稿生成失败，请稍后重试。' })
    const generated = parseSpotEnglishGeneration(extractResponsesApiJson(await openaiResponse.json()), source)
    const { data: latestRow, error: latestError } = await db.from('locations').select('*').eq('id', id).single()
    if (latestError || !latestRow) return res.status(409).json({ error: '中文内容或版本已变更，请重新载入后再生成。' })
    const latestSpot = { ...latestRow, id, name: String(latestRow.name || ''), description: String(latestRow.description || '').trim() || null, review: String(latestRow.review || '').trim() || null, address: String(latestRow.address || '').trim() || null }
    const latest = await readAuthoritativeLocalization(createLocalizationIO())
    assertCurrentSpotGenerationRequest(req.body, latest.revision, spotTranslationSource(latestSpot))
    return res.json({ revision: current.revision, fields: Object.fromEntries(Object.entries(generated).map(([key, text]) => [key, { source: source[key as keyof typeof source], text }])) })
  } catch (error) {
    const message = error instanceof Error ? error.message : '英文草稿生成失败。'
    const conflict = /conflict/i.test(message)
    return res.status(conflict ? 409 : 400).json({ error: conflict ? '中文内容或版本已变更，请重新载入后再生成。' : message })
  }
}
