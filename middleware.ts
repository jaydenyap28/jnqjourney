import { NextRequest, NextResponse } from 'next/server'
import { packageVisibility } from '@/lib/server/package-visibility'

const BLOCKED_SEO = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'X-JNQ-SEO-Indexable': 'false' }

async function guardSpot(request: NextRequest) {
  const slug = request.nextUrl.pathname.split('/').filter(Boolean).at(-1)
  if (!slug) return NextResponse.next()
  // This uncached routing decision precedes static page/alias resolution, so
  // hidden source pages and every old alias return an actual HTTP 301/302.
  try {
    const endpoint = new URL(`/api/spot-routing/${encodeURIComponent(slug)}`, request.url)
    if (request.nextUrl.pathname.startsWith('/en/')) endpoint.searchParams.set('locale', 'en')
    const routingResponse = await fetch(endpoint, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000) })
    if (routingResponse.status === 404) return new NextResponse('Not Found', { status: 404, headers: BLOCKED_SEO })
    if (!routingResponse.ok) throw new Error('Spot routing unavailable')
    const routing = await routingResponse.json()
    if (routing.destination) {
      if (typeof routing.destination !== 'string' || !/^\/(?:en\/)?(?:spot|notes)\/[\p{L}\p{N}_-]+$/u.test(routing.destination)) throw new Error('Invalid routing destination')
      const response = NextResponse.redirect(new URL(routing.destination, request.url), routing.status === 302 ? 302 : 301)
      for (const [key, value] of Object.entries(BLOCKED_SEO)) response.headers.set(key, value)
      return response
    }
    if (routing.visible === false) return new NextResponse('Not Found', { status: 404, headers: BLOCKED_SEO })
    if (routing.visible !== true) throw new Error('Invalid routing visibility')
    const nextResponse = NextResponse.next()
    const source = routingResponse.headers.get('X-JNQ-Data-Source')
    if (source) nextResponse.headers.set('X-JNQ-Data-Source', source)
    // This header never overrides the page's robots metadata. English pages
    // require an explicit, complete translation decision from the routing API.
    const indexable = routingResponse.headers.get('X-JNQ-SEO-Indexable') === 'true'
    nextResponse.headers.set('X-JNQ-SEO-Indexable', String(indexable))
    if (!indexable) nextResponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return nextResponse
  } catch {
    return new NextResponse('Spot temporarily unavailable.', { status: 503, headers: { ...BLOCKED_SEO, 'Retry-After': '30' } })
  }
}

async function guardPackage(request: NextRequest) {
  const pathParts = request.nextUrl.pathname.split('/').filter(Boolean)
  const slug = pathParts[1]
  if (!slug) return NextResponse.next()
  if (slug === 'hainan') return NextResponse.next()

  if (['tioman-aman-resort-3d2n', 'tioman-paya-beach-resort-3d2n', 'tioman-barat-resort-3d2n'].includes(slug)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/packages/tioman-3d2n'
    return NextResponse.redirect(redirectUrl, 308)
  }

  try {
    const status = await packageVisibility(slug)
    if (status === 204) {
      const nextResponse = NextResponse.next()
      nextResponse.headers.set('X-JnQ-Package-Guard', 'published')
      return nextResponse
    }

    if (status === 404) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: {
          ...BLOCKED_SEO,
          'Content-Type': 'text/plain; charset=utf-8',
          'X-JnQ-Package-Guard': 'not-published',
        },
      })
    }

    console.error('[package-visibility]', status)
  } catch (error) {
    console.error('[package-visibility]', error)
  }
  return new NextResponse('Package temporarily unavailable.', { status: 503, headers: { ...BLOCKED_SEO, 'Retry-After': '30' } })
}

export async function middleware(request: NextRequest) {
  if (/^\/(?:en\/)?spot\//.test(request.nextUrl.pathname)) return guardSpot(request)
  return guardPackage(request)
}

export const config = {
  matcher: ['/packages/:path*', '/spot/:path*', '/en/spot/:path*'],
}
