import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { publishLocationBatch } from '@/lib/server/publish-location-batch'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'
import { validPublicationPath } from '@/lib/publication-plan'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const headers = { 'Cache-Control': 'private, no-store' }
  let change: import('@/lib/publication-plan').PublicationChange = {kind:'spot'}
  try {
    const { ids, previousPaths = [], previousEnglishPaths = [] } = await request.json()
    if (!Array.isArray(ids) || !ids.length || !ids.every(id => Number.isSafeInteger(id) && id > 0)) {
      return NextResponse.json({ error: 'Provide positive location IDs.' }, { status: 400, headers })
    }
    if (![previousPaths, previousEnglishPaths].every(paths => Array.isArray(paths) && paths.length <= 1000 && paths.every(path => typeof path === 'string' && validPublicationPath(path)))) return NextResponse.json({ error: 'Invalid recovery scope' }, { status: 400, headers })
    change={kind:'spot',ids,previousPaths,previousEnglishPaths}
    const published = await publishLocationBatch(ids)
    change={...change,previousPaths:[...new Set([...previousPaths,...published.recovery?.previousPaths || []])],previousEnglishPaths:[...new Set([...previousEnglishPaths,...published.recovery?.previousEnglishPaths || []])]}
    return publicationResponse({ ok: true, ids, generatedAt: published.generatedAt }, await invalidatePublication(request, change, { previousLocations: published.previousLocations }))
  } catch (error) {
    return publicationFailure(error, change)
  }
}
