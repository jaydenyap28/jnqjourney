import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { readAuthoritativePublicSpotById } from '@/lib/server/public-spot-resolver'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAdminRequest(new Request('http://localhost/api/admin/spot-content-revalidate', { headers: { authorization: req.headers.authorization || '' } }))
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())
  const id = Number(req.query.id)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Spot ID' })
  try {
    const spot = await readAuthoritativePublicSpotById(id)
    if (spot) await res.revalidate(`/en/spot/${spot.slug}`)
    return res.json({ ok: true })
  } catch {
    return res.status(503).json({ error: 'Spot saved; English page refresh failed. Please retry refresh.' })
  }
}
