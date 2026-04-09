import { NextResponse } from 'next/server'
import { readPublishedNotes } from '@/lib/server/notes-store'

export const runtime = 'nodejs'

export async function GET() {
  const notes = await readPublishedNotes()
  return NextResponse.json({ notes })
}
