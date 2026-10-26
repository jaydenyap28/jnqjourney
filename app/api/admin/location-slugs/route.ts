import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { readLocationSlugForId, saveLocationSlugForId } from '@/lib/server/location-slugs-store'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { publishLocationBatch } from '@/lib/server/publish-location-batch'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const id = Number(searchParams.get('id'))

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Missing valid location id.' }, { status: 400 })
  }

  const slug = await readLocationSlugForId(id)
  return NextResponse.json({ slug })
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const id = Number(body?.id)
    const slug = String(body?.slug || '').trim()

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Missing valid location id.' }, { status: 400 })
    }

    const previousLocations = (await resolvePublicData()).locations
    const previousSlugs = previousLocations.filter(location => location.id === id).map(location => location.slug)
    const savedSlug = await saveLocationSlugForId(id, slug)
    // The full Spot form publishes once after this identity write. Standalone
    // alias edits must also rebuild snapshots and expire both old/new paths.
    if (body.deferPublication === true) return NextResponse.json({ slug: savedSlug, previousSlugs, publicationPending: true })
    try {
      await publishLocationBatch([id])
      return publicationResponse({ slug: savedSlug }, await invalidatePublication(request, { kind: 'spot', ids: [id], previousSlugs }, { previousLocations }))
    } catch (error) { return publicationFailure(error, { kind: 'spot', ids: [id], previousSlugs }) }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save location slug.' }, { status: 500 })
  }
}
