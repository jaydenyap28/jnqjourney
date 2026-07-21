import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return NextResponse.next()

  const slug = request.nextUrl.pathname.split('/').filter(Boolean)[1]
  if (!slug) return NextResponse.next()

  const endpoint = new URL('/rest/v1/travel_packages', supabaseUrl)
  endpoint.searchParams.set('slug', `eq.${slug}`)
  endpoint.searchParams.set('status', 'eq.published')
  endpoint.searchParams.set('select', 'id')
  endpoint.searchParams.set('limit', '1')

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('[package-visibility]', response.status, await response.text())
      return NextResponse.next()
    }

    const rows = (await response.json()) as Array<{ id: number }>
    if (rows.length > 0) return NextResponse.next()

    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('[package-visibility]', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/packages/:slug'],
}
