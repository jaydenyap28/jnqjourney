import { NextResponse } from 'next/server'
import { readPublishedPackage } from '@/lib/server/travel-packages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
}

// Use the same live-first published snapshot fallback as the package pages.
// During a Supabase quota outage, known published pages must not be rejected
// by the middleware while the page renderer correctly recovers from the outage.
export async function GET(_: Request, { params }: { params: { slug: string } }) {
  try {
    const published = await readPublishedPackage(params.slug)
    if (!published) return new NextResponse('Not Found', { status: 404, headers: NO_STORE_HEADERS })
    return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('[package-visibility]', error)
    return NextResponse.json({ error: 'Visibility check unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}
