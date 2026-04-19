import { NextResponse } from 'next/server'
import { readGuides } from '@/lib/server/guides-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 600 // Cache for 10 minutes

export async function GET() {
  const guides = await readGuides()
  return NextResponse.json(
    { guides },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
      },
    }
  )
}
