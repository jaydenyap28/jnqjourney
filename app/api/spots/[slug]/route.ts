import { NextResponse } from 'next/server'

import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { readSpotRouting } from '@/lib/server/spot-routing'
import { PublicSpotUnavailableError, getPublicSpotBySlug } from '@/lib/server/public-spot-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' }

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const id = extractLocationIdFromSlug(params.slug)
  if (!id || !Number.isSafeInteger(id) || id <= 0 || params.slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.slug)) {
    return NextResponse.json({ error: 'Spot not found.', code: 'spot_not_found' }, { status: 404, headers: HEADERS })
  }
  try {
    const routing = await readSpotRouting(id)
    if ('destination' in routing && routing.destination) {
      const response = NextResponse.redirect(new URL(routing.destination, request.url), routing.status === 302 ? 302 : 301)
      for (const [key, value] of Object.entries(HEADERS)) response.headers.set(key, value)
      return response
    }
    if (!routing.visible) return NextResponse.json({ error: 'Spot not found.', code: 'spot_not_found' }, { status: 404, headers: HEADERS })
    // Only the publication/routing gate is live. Payload and quality still use
    // the existing ID cache; HTTP response caching must not bypass this gate.
    const resolved = await getPublicSpotBySlug(params.slug)
    if (!resolved) {
      return NextResponse.json(
        { error: 'Spot not found.', code: 'spot_not_found' },
        { status: 404, headers: HEADERS }
      )
    }
    const { quality } = resolved
    return NextResponse.json(
      { spot: resolved.spot },
      {
        headers: {
          ...HEADERS,
          'X-JNQ-Data-Source': resolved.source,
          'X-JNQ-SEO-Indexable': quality.indexable && resolved.source !== 'static-fallback' ? '1' : '0',
          'X-JNQ-SEO-Quality-Score': String(quality.score),
        },
      }
    )
  } catch (error) {
    const message = error instanceof PublicSpotUnavailableError ? 'Spot data is temporarily unavailable.' : 'Unable to load spot data.'
    return NextResponse.json(
      { error: message, code: 'spot_data_unavailable' },
      { status: 503, headers: { ...HEADERS, 'Retry-After': '30' } }
    )
  }
}
