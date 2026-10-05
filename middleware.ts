import { NextRequest, NextResponse } from 'next/server'

async function guardSpot(request: NextRequest) {
  const slug = request.nextUrl.pathname.split('/').filter(Boolean).at(-1)
  if (!slug) return NextResponse.next()
  // This uncached routing decision precedes static page/alias resolution, so
  // hidden source pages and every old alias return an actual HTTP 301/302.
  try {
    const routingResponse = await fetch(new URL(`/api/spot-routing/${encodeURIComponent(slug)}`, request.url), { cache: 'no-store' })
    if (!routingResponse.ok) throw new Error('Spot routing unavailable')
    const routing = await routingResponse.json()
    if (routing.destination) return NextResponse.redirect(new URL(routing.destination, request.url), routing.status === 302 ? 302 : 301)
    if (!routing.visible) return new NextResponse('Not Found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow' } })
  } catch {
    return new NextResponse('Spot temporarily unavailable.', { status: 503, headers: { 'Retry-After': '30', 'X-Robots-Tag': 'noindex' } })
  }
  const endpoint = new URL(`/api/spots/${encodeURIComponent(slug)}`, request.url)
  try {
    const response = await fetch(endpoint, { cache: 'force-cache' })
    if (response.ok) {
      const nextResponse = NextResponse.next()
      const source = response.headers.get('X-JNQ-Data-Source')
      const seoIndexable = response.headers.get('X-JNQ-SEO-Indexable')
      const qualityScore = response.headers.get('X-JNQ-SEO-Quality-Score')
      if (source) nextResponse.headers.set('X-JNQ-Data-Source', source)
      if (qualityScore) nextResponse.headers.set('X-JNQ-SEO-Quality-Score', qualityScore)
      if (seoIndexable === '0') nextResponse.headers.set('X-Robots-Tag', 'noindex, follow')
      return nextResponse
    }
    if (response.status === 404) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
      })
    }
    if (response.status === 503) {
      return new NextResponse('This spot is temporarily unavailable. Please try again shortly.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30', 'X-Robots-Tag': 'noindex' },
      })
    }
  } catch (error) {
    console.error('[spot-visibility]', error)
  }
  return NextResponse.next()
}

async function guardPackage(request: NextRequest) {
  const pathParts = request.nextUrl.pathname.split('/').filter(Boolean)
  const slug = pathParts[1]
  if (!slug) return NextResponse.next()

  // Destination hubs under /packages (for example /packages/hainan) are
  // editorial comparison pages, not rows in travel_packages. Let Next.js
  // resolve these static routes instead of checking package publication.
  if (slug === 'hainan') return NextResponse.next()

  if (['tioman-aman-resort-3d2n', 'tioman-paya-beach-resort-3d2n', 'tioman-barat-resort-3d2n'].includes(slug)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/packages/tioman-3d2n'
    return NextResponse.redirect(redirectUrl, 308)
  }

  const endpoint = new URL(`/api/package-visibility/${encodeURIComponent(slug)}`, request.url)

  try {
    const response = await fetch(endpoint, { cache: 'no-store' })
    if (response.status === 204) {
      const nextResponse = NextResponse.next()
      nextResponse.headers.set('X-JnQ-Package-Guard', 'published')
      return nextResponse
    }

    if (response.status === 404) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-JnQ-Package-Guard': 'not-published',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      })
    }

    console.error('[package-visibility]', response.status, await response.text())
    return NextResponse.next()
  } catch (error) {
    console.error('[package-visibility]', error)
    return NextResponse.next()
  }
}

export async function middleware(request: NextRequest) {
  if (/^\/(?:en\/)?spot\//.test(request.nextUrl.pathname)) return guardSpot(request)
  return guardPackage(request)
}

export const config = {
  matcher: ['/packages/:path*', '/spot/:path*', '/en/spot/:path*'],
}
