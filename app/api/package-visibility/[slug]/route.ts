import { NextResponse } from 'next/server'
import { packageVisibility } from '@/lib/server/package-visibility'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const status = await packageVisibility(params.slug)
  return new NextResponse(status === 204 ? null : status === 404 ? 'Not Found' : 'Visibility check unavailable', {
    status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
