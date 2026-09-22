import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { normalizeNotePayload, readAuthoritativeNotes, mutateAuthoritativeNotes } from '@/lib/server/notes-store'
import { mergeNoteSave, NoteConflictError } from '@/lib/note-sync'
import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { cleanupUnusedNoteImages } from '@/lib/server/note-image-cleanup'
import { syncNoteCardEnglish } from '@/lib/server/note-card-english-sync'

export const runtime = 'nodejs'
export const maxDuration = 60
const ADMIN_HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const notes = await readAuthoritativeNotes()
    return NextResponse.json({ notes }, { headers: ADMIN_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 503, headers: ADMIN_HEADERS })
  }
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const rawPayload = await request.json()
    if (rawPayload?.action === 'cleanup-unused-images') {
      const notes = await readAuthoritativeNotes()
      const cleanup = await cleanupUnusedNoteImages(notes, undefined, {
        includeAllModern: true,
        includeLegacyInlineSweep: true,
      })
      return NextResponse.json({ ok: true, cleanup }, { headers: ADMIN_HEADERS })
    }
    if (rawPayload?.action === 'sync-english-cards' || rawPayload?.action === 'sync-english') {
      const requestedSlugs = Array.isArray(rawPayload?.slugs)
        ? Array.from(new Set(rawPayload.slugs.map((value: unknown) => String(value || '').trim()).filter(Boolean)))
        : []
      if (requestedSlugs.length !== 1) {
        return NextResponse.json({ error: '每次请提供 1 个 Note slug，系统会逐篇同步完整英文长文。' }, { status: 400, headers: ADMIN_HEADERS })
      }
      const notes = await readAuthoritativeNotes()
      const selected = notes.filter((note) => requestedSlugs.includes(note.slug) && note.published)
      const english = await syncNoteCardEnglish(selected)
      revalidatePath('/en')
      return NextResponse.json({ ok: true, english }, { headers: ADMIN_HEADERS })
    }
    if (rawPayload?.action === 'revalidate-public') {
      const slug = String(rawPayload?.slug || '').trim()
      if (!slug) return NextResponse.json({ error: '缺少 slug。' }, { status: 400, headers: ADMIN_HEADERS })
      revalidateTag('notes')
      revalidateTag(`note:${slug}`)
      revalidatePath('/')
      revalidatePath('/notes')
      revalidatePath('/api/notes')
      revalidatePath(`/notes/${slug}`)
      return NextResponse.json({ ok: true, slug, revalidated: ['notes', `note:${slug}`] }, { headers: ADMIN_HEADERS })
    }
    const previousSlug = String(rawPayload?.previousSlug || '').trim()
    const payload = normalizeNotePayload(rawPayload)

    if (!payload.slug || !payload.title) {
      return NextResponse.json({ error: '笔记至少需要 slug 和标题。' }, { status: 400 })
    }

    const savedNotes = await mutateAuthoritativeNotes((notes) =>
      mergeNoteSave(notes, payload, previousSlug, rawPayload.expectedUpdatedAt)
    )
    const savedNote = savedNotes.find((item) => item.slug === payload.slug) || payload
    let english = null
    let englishWarning = ''
    if (rawPayload?.syncEnglish === true && savedNote.published) {
      try {
        english = await syncNoteCardEnglish([savedNote])
        revalidatePath('/en')
      } catch (error: any) {
        englishWarning = error?.message || 'English Note card sync failed.'
        console.warn('[notes] English card sync failed after save:', englishWarning)
      }
    }
    let cleanup = null
    let cleanupWarning = ''
    try {
      cleanup = await cleanupUnusedNoteImages(savedNotes, [payload.slug, previousSlug].filter(Boolean))
    } catch (error: any) {
      cleanupWarning = error?.message || 'Unused Note image cleanup failed.'
      console.warn('[notes] R2 cleanup failed after save:', cleanupWarning)
    }
    revalidateTag('notes')
    revalidateTag(`note:${payload.slug}`)
    revalidatePath('/')
    revalidatePath('/notes')
    revalidatePath('/api/notes')
    revalidatePath(`/notes/${payload.slug}`)
    if (previousSlug && previousSlug !== payload.slug) revalidatePath(`/notes/${previousSlug}`)
    return NextResponse.json({
      note: savedNote,
      english,
      englishWarning: englishWarning || undefined,
      cleanup,
      cleanupWarning: cleanupWarning || undefined,
    }, { headers: ADMIN_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '保存笔记失败。' }, { status: error instanceof NoteConflictError ? 409 : 500, headers: ADMIN_HEADERS })
  }
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const { searchParams } = new URL(request.url)
    const slug = String(searchParams.get('slug') || '').trim()
    if (!slug) {
      return NextResponse.json({ error: '缺少 slug。' }, { status: 400 })
    }

    const savedNotes = await mutateAuthoritativeNotes((notes) => {
      const existing = notes.find((item) => item.slug === slug)
      if (existing && (existing.updatedAt || '') !== searchParams.get('expectedUpdatedAt')) throw new NoteConflictError()
      return notes.filter((item) => item.slug !== slug)
    })
    let cleanup = null
    let cleanupWarning = ''
    try {
      cleanup = await cleanupUnusedNoteImages(savedNotes, [slug])
    } catch (error: any) {
      cleanupWarning = error?.message || 'Unused Note image cleanup failed.'
      console.warn('[notes] R2 cleanup failed after delete:', cleanupWarning)
    }
    revalidateTag('notes')
    revalidateTag(`note:${slug}`)
    revalidatePath('/')
    revalidatePath('/notes')
    revalidatePath('/api/notes')
    revalidatePath(`/notes/${slug}`)
    return NextResponse.json({ ok: true, cleanup, cleanupWarning: cleanupWarning || undefined }, { headers: ADMIN_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '删除笔记失败。' }, { status: error instanceof NoteConflictError ? 409 : 500, headers: ADMIN_HEADERS })
  }
}




