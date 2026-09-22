import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import { readAuthoritativePublicSpotById } from '@/lib/server/public-spot-resolver'

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } }

const MAX_BATCH_SIZE = 20

function validIds(value: unknown) {
  if (!Array.isArray(value)) return null
  const ids = Array.from(new Set(value.map(Number))).filter((id) => Number.isSafeInteger(id) && id > 0)
  return ids.length && ids.length <= MAX_BATCH_SIZE ? ids : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await requireAdminRequest(
    new Request('http://localhost/api/admin/spot-content-revalidate/batch', {
      headers: { authorization: req.headers.authorization || '' },
    })
  )
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())

  const ids = validIds(req.body?.ids)
  if (!ids) return res.status(400).json({ error: `Provide 1-${MAX_BATCH_SIZE} valid Spot IDs.` })

  const refreshed: Array<{ id: number; slug: string }> = []
  const failed: Array<{ id: number; error: string }> = []

  for (const id of ids) {
    try {
      const spot = await readAuthoritativePublicSpotById(id)
      if (!spot) {
        failed.push({ id, error: 'Spot not found or not published.' })
        continue
      }
      await res.revalidate(`/en/spot/${spot.slug}`)
      refreshed.push({ id, slug: spot.slug })
    } catch (error) {
      failed.push({
        id,
        error: error instanceof Error ? error.message : 'English page refresh failed.',
      })
    }
  }

  return res.status(failed.length ? 207 : 200).json({
    ok: failed.length === 0,
    refreshed,
    failed,
  })
}
