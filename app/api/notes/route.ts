import { NextResponse } from 'next/server'
import { readPublishedNotes } from '@/lib/server/notes-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const notes = await readPublishedNotes()
  return NextResponse.json(
    { notes },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
