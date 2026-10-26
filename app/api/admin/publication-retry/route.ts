import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { invalidatePublication, publicationFailure, publicationResponse } from '@/lib/server/publication'
import type { PublicationChange } from '@/lib/publication-plan'
import { validPublicationPath } from '@/lib/publication-plan'

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const change: PublicationChange = await request.json().catch(() => ({}))
  if (!['spot', 'guide', 'note', 'price', 'widget', 'affiliate'].includes(change.kind)
    || (change.priceSource !== undefined && !['highlights','trip-cost'].includes(change.priceSource))
    || (change.ids !== undefined && (!Array.isArray(change.ids) || !change.ids.length || !change.ids.every(id => Number.isSafeInteger(id) && id > 0)))
    || ![change.previousPaths || [], change.previousEnglishPaths || []].every(values => Array.isArray(values) && values.length <= 1000 && values.every(value => typeof value === 'string' && validPublicationPath(value)))
    || ![change.slugs || [], change.previousSlugs || []].every(values => Array.isArray(values) && values.every(slug => typeof slug === 'string' && /^[\p{L}\p{N}_-]{1,150}$/u.test(slug)))) return NextResponse.json({ error: 'Invalid publication identity' }, { status: 400 })
  try { return publicationResponse({ ok: true, mutationRepeated: false }, await invalidatePublication(request, change)) }
  catch (error) { return publicationFailure(error, change) }
}
