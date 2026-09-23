import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { spotContentChineseSource } from '@/lib/spot-content'
import { assertCurrentSpotContentGenerationSource, parseSpotContentEnglishGeneration, spotContentEnglishGenerationSchema, spotTranslationFieldLimit } from '@/lib/spot-localization-generation'
import { generateGeminiJson } from '@/lib/server/gemini-json'

export const config = { api: { bodyParser: { sizeLimit: '128kb' } } }

const translationInstructions = `Translate the supplied Chinese JnQ Journey Spot fields into natural English. Experience: preserve the first-person personal-experience tone and paragraph structure where practical. SEO title: translate only the supplied Chinese SEO title naturally, concisely, preserving place names, with no keyword stuffing. SEO description: faithfully translate only the supplied Chinese SEO description as a concise natural meta description, target 160 characters or fewer when practical, and never truncate mid-word. Do not invent experiences, recommendations, prices, facts, claims, or promotional exaggeration. Output English only. Each empty source field must produce an empty string.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  const auth = await requireAdminRequest(new Request('http://localhost/api/admin/spot-content/generate-english', { headers: { authorization: req.headers.authorization || '' } }))
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())
  if (req.method !== 'POST') return res.status(405).end()
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: '未配置 GEMINI_API_KEY，管理员无法生成英文草稿。' })

  const id = Number(req.query.id)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Spot ID' })

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { data: row, error } = await db.from('locations').select('experience_zh,seo_title_zh,seo_description_zh').eq('id', id).single()
    if (error || !row) return res.status(404).json({ error: 'Spot not found' })
    const source = spotContentChineseSource(row)
    if (Object.values(source).some((text) => text.length > spotTranslationFieldLimit)) return res.status(400).json({ error: 'Spot source exceeds the 30k field limit.' })
    assertCurrentSpotContentGenerationSource(req.body, source)

    const generated = parseSpotContentEnglishGeneration(
      await generateGeminiJson({
        instructions: translationInstructions,
        input: JSON.stringify(source),
        schema: spotContentEnglishGenerationSchema as unknown as Record<string, unknown>,
      }),
      source
    )
    const { data: latestRow, error: latestError } = await db.from('locations').select('experience_zh,seo_title_zh,seo_description_zh').eq('id', id).single()
    if (latestError || !latestRow) return res.status(409).json({ error: '中文内容已变更，请重新载入后再生成。' })
    assertCurrentSpotContentGenerationSource(req.body, spotContentChineseSource(latestRow))
    return res.json({ fields: generated })
  } catch (error) {
    const message = error instanceof Error ? error.message : '英文草稿生成失败。'
    const conflict = /conflict/i.test(message)
    return res.status(conflict ? 409 : 400).json({ error: conflict ? '中文内容已变更，请重新载入后再生成。' : message })
  }
}
