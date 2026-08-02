import { NextResponse } from 'next/server'
import { readGuides } from '@/lib/server/guides-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const guides = await readGuides()
  return NextResponse.json(
    { guides },
    {
      headers: {
        // Guide edits are administered from the same authoritative storage;
        // caching this response can otherwise expose an older day ordering.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    }
  )
}
