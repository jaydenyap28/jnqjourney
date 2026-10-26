import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { readAuthoritativePublicSpotById } from '@/lib/server/public-spot-resolver'
import { publishLocationBatch } from '@/lib/server/publish-location-batch'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid Spot id.' }, { status: 400, headers: HEADERS })
  }

  try {
    const body = request.body ? await request.json() : null
    if (body?.action === 'revalidate-public') {
      const current = await readAuthoritativePublicSpotById(id)
      revalidateTag('public-spots') // manual refresh may follow an index hide/republish
      revalidateTag(`public-spot:spot-${id}`)
      revalidatePath(`/spot/spot-${id}`)
      revalidatePath(`/api/spots/spot-${id}`)
      if (current) {
        revalidateTag(`public-spot:${current.slug}`)
        revalidatePath(`/spot/${current.slug}`)
        revalidatePath(`/api/spots/${current.slug}`)
      }
      return publicationResponse({ ok: true, id, refreshed: true }, await invalidatePublication(request, { kind: 'spot', ids: [id], slugs: current ? [current.slug] : [] }))
    }
    // Single and batch publications share the same ordered recovery contract.
    const published = await publishLocationBatch([id])
    const spot = published.spots.find(value=>value.id===id) || null
    return publicationResponse({ ok: true, generatedAt:published.generatedAt, spot, locationsUrl:published.locationsUrl,indexUrl:published.indexUrl },
      await invalidatePublication(request, { kind: 'spot', ids: [id], slugs: spot ? [spot.slug] : [], previousSlugs: body?.previousSlugs || [],...published.recovery }, { previousLocations:published.previousLocations }))
  } catch (error: any) {
    return publicationFailure(error, { kind: 'spot', ids: [id] })
  }
}
