import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { validPublicationPath } from '@/lib/publication-plan'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAdminRequest(new Request('http://localhost/api/admin/publication-revalidate', { headers: { authorization: req.headers.authorization || '' } }))
  if (!auth.ok) return res.status(auth.response.status).json(await auth.response.json())
  const paths = req.body?.paths
  if (!Array.isArray(paths) || paths.length > 1000 || !paths.every(path => typeof path === 'string' && path.startsWith('/en') && validPublicationPath(path))) return res.status(400).json({ error: 'Invalid English publication paths' })
  const refreshed: string[] = []
  try {
    for (const route of new Set<string>(paths)) {
      if (process.env.JNQ_OFFLINE_RUNTIME_FIXTURE) console.info('[offline-publication] revalidate-start', route)
      // Next 14 Pages ISR: refresh generated paths and allow cached 404s; do
      // not create hundreds of never-visited related pages during a bulk save.
      await res.revalidate(route, { unstable_onlyGenerated: true })
      refreshed.push(route)
      if (process.env.JNQ_OFFLINE_RUNTIME_FIXTURE) console.info('[offline-publication] revalidate-finish', route)
    }
    return res.json({ ok: true, refreshed })
  } catch {
    return res.status(503).json({ ok: false, partial: true, refreshed, error: 'English cache refresh failed; retry publication only.' })
  }
}
