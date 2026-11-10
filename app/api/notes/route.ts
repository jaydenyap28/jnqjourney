import { NextResponse } from 'next/server'
import { readPublicNoteBySlug, readPublicNotes } from '@/lib/server/public-content-store'
import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveNotePublicMedia } from '@/lib/server/public-content-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function read(request: Request) {
  const slug = String(new URL(request.url).searchParams.get('slug') || '').trim()
  const { locations } = await resolvePublicData()
  if (slug) {
    const storedNote = await readPublicNoteBySlug(slug)
    if (!storedNote?.published) {
      return NextResponse.json({ error: 'Note not found.' }, { status: 404, headers: { 'Cache-Control': PRIVATE_NO_STORE } })
    }
    return NextResponse.json(
      { note: resolveNotePublicMedia(storedNote, locations) },
      { headers: { 'Cache-Control': PRIVATE_NO_STORE } }
    )
  }
  const notes = (await readPublicNotes()).map((storedNote) => {
    const note = resolveNotePublicMedia(storedNote, locations)
    return {
      slug: note.slug,
      shortTitle: note.shortTitle,
      title: note.title,
      kicker: note.kicker,
      tagline: note.tagline,
      summary: note.summary,
      coverImage: note.coverImage,
      coverAccent: note.coverAccent,
      tags: note.tags,
      updatedAt: note.updatedAt,
    }
  })
  return NextResponse.json(
    { notes },
    {
      headers: {
        'Cache-Control': PRIVATE_NO_STORE,
      },
    }
  )
}

export async function GET(request: Request) {
  try { return await read(request) } catch { return NextResponse.json({error:{code:'PUBLIC_DATA_UNAVAILABLE',message:'Public content temporarily unavailable.'}}, {status:503,headers:{'Cache-Control':PRIVATE_NO_STORE}}) }
}
