import { NextResponse } from 'next/server'

import { PUBLIC_CACHE_CONTROL } from '@/lib/public-data'
import { PublicSpotUnavailableError, getPublicSpotBySlug } from '@/lib/server/public-spot-resolver'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const resolved = await getPublicSpotBySlug(params.slug)
    if (!resolved) {
      return NextResponse.json(
        { error: 'Spot not found.', code: 'spot_not_found' },
        { status: 404, headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } }
      )
    }
    return NextResponse.json(
      { spot: resolved.spot },
      { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL, 'X-JNQ-Data-Source': resolved.source } }
    )
  } catch (error) {
    const message = error instanceof PublicSpotUnavailableError ? 'Spot data is temporarily unavailable.' : 'Unable to load spot data.'
    return NextResponse.json(
      { error: message, code: 'spot_data_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } }
    )
  }
}
