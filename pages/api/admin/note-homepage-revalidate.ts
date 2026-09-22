import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAdminRequest } from '@/lib/server/admin-auth'

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await requireAdminRequest(
    new Request('http://localhost/api/admin/note-homepage-revalidate', {
      headers: { authorization: req.headers.authorization || '' },
    })
  )
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())

  try {
    await res.revalidate('/en')
    return res.json({ ok: true })
  } catch {
    return res.status(503).json({ error: 'English homepage refresh failed. The translation was saved and will appear after ISR refresh.' })
  }
}
