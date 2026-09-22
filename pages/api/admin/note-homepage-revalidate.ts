import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAdminRequest } from '@/lib/server/admin-auth'

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } }

function normalizeSlugs(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter((item) => item && /^[a-z0-9-]+$/i.test(item))
  )).slice(0, 50)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await requireAdminRequest(
    new Request('http://localhost/api/admin/note-homepage-revalidate', {
      headers: { authorization: req.headers.authorization || '' },
    })
  )
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())

  const slugs = normalizeSlugs(req.body?.slugs)

  try {
    await res.revalidate('/en')
    await res.revalidate('/en/notes')
    for (const slug of slugs) await res.revalidate(`/en/notes/${slug}`)
    return res.json({ ok: true, slugs })
  } catch {
    return res.status(503).json({ error: 'English Note pages refresh failed. The translation was saved and will appear after ISR refresh.' })
  }
}
