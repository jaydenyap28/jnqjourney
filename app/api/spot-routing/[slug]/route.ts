import { NextResponse } from 'next/server'
import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { readSpotRouting } from '@/lib/server/spot-routing'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const headers = { 'Cache-Control': 'no-store' }
  const id = extractLocationIdFromSlug(params.slug)
  if (!id) return NextResponse.json({ visible: false }, { headers })
  try {
    return NextResponse.json(await readSpotRouting(id), { headers })
  } catch {
    return NextResponse.json({ error: 'Spot routing temporarily unavailable.' }, { status: 503, headers })
  }
}
