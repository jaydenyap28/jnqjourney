import { NextResponse } from 'next/server'
import { packageVisibility } from '@/lib/server/package-visibility'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
}

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const status = await packageVisibility(params.slug)
  if (status === 204) return new NextResponse(null, { status, headers: NO_STORE_HEADERS })
  if (status === 404) return new NextResponse('Not Found', { status, headers: NO_STORE_HEADERS })
  return NextResponse.json(
    { error: status === 502 ? 'Visibility check failed' : 'Visibility check unavailable' },
    { status, headers: NO_STORE_HEADERS },
  )
}
