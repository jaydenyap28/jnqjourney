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
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
