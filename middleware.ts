import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const slug = request.nextUrl.pathname.split('/').filter(Boolean)[1]
  if (!slug) return NextResponse.next()

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

export const config = {
  matcher: ['/packages/:path*'],
}
