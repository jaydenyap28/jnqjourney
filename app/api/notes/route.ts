import { NextResponse } from 'next/server'
import { readPublishedNotes } from '@/lib/server/notes-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 600 // Cache for 10 minutes

export async function GET() {
  const notes = await readPublishedNotes()
  return NextResponse.json(
    { notes },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
      },
    }
  )
}
