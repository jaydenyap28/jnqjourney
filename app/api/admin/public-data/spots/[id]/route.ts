import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { readAuthoritativePublicSpotById } from '@/lib/server/public-spot-resolver'
import { uploadPublicSpotIndex, uploadPublicSpotSnapshot } from '@/lib/server/r2'

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
    const spot = await readAuthoritativePublicSpotById(id)
    const generatedAt = new Date().toISOString()
    const source = { type: 'supabase-admin-spot-refresh', generatedAt }
    const { locations } = await resolvePublicData()
    const slugs = locations.map((location) => location.slug).filter((slug) => !slug.endsWith(`-${id}`))
    let spotUrl: string | null = null
    if (spot) {
      spotUrl = await uploadPublicSpotSnapshot(
        spot.slug,
        Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, spot })}\n`)
      )
      slugs.push(spot.slug)
    }
    const uniqueSlugs = Array.from(new Set(slugs)).sort()
    const indexUrl = await uploadPublicSpotIndex(Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, slugs: uniqueSlugs })}\n`))
    revalidateTag('public-spots')
    if (spot) {
      revalidateTag(`public-spot:${spot.slug}`)
      revalidatePath(`/spot/${spot.slug}`)
      revalidatePath(`/api/spots/${spot.slug}`)
    }
    return NextResponse.json({ ok: true, generatedAt, spot: spot ? { id: spot.id, slug: spot.slug, url: spotUrl } : null, indexUrl }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Spot snapshot refresh failed; the previous snapshot remains active.' },
      { status: 503, headers: HEADERS }
    )
  }
}
