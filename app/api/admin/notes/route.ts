import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { normalizeNotePayload, readAuthoritativeNotes, mutateAuthoritativeNotes } from '@/lib/server/notes-store'
import { mergeNoteSave, NoteConflictError } from '@/lib/note-sync'
import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'
import type { PublicationChange, PublicationCatalog } from '@/lib/publication-plan'
import type { LongformNote } from '@/lib/notes'

export const runtime = 'nodejs'
const ADMIN_HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }
async function finish(request: Request, payload: Record<string, unknown>, change: PublicationChange, previous: Partial<PublicationCatalog> = {}) {
  try { return publicationResponse(payload, await invalidatePublication(request, change, previous)) }
  catch (error) { return publicationFailure(error, change) }
}

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
    if (rawPayload?.action === 'revalidate-public') {
      const slug = String(rawPayload?.slug || '').trim()
      if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) || slug.length > 150) return NextResponse.json({ error: 'Invalid Note slug.' }, { status: 400, headers: ADMIN_HEADERS })
      revalidateTag('notes')
      revalidateTag(`note:${slug}`)
      revalidatePath('/')
      revalidatePath('/notes')
      revalidatePath('/api/notes')
      revalidatePath(`/notes/${slug}`)
      revalidatePath('/sitemap.xml')
      return finish(request, { ok: true, slug, revalidated: ['notes', `note:${slug}`] }, { kind: 'note', slugs: [slug] })
    }
    const previousSlug = String(rawPayload?.previousSlug || '').trim()
    const payload = normalizeNotePayload(rawPayload)

    if (!payload.slug || !payload.title) {
      return NextResponse.json({ error: '笔记至少需要 slug 和标题。' }, { status: 400 })
    }

    let previousNotes: LongformNote[] = []
    const savedNotes = await mutateAuthoritativeNotes((notes) => {
      previousNotes = notes.slice()
      return mergeNoteSave(notes, payload, previousSlug, rawPayload.expectedUpdatedAt)
    })
    const savedNote = savedNotes.find((item) => item.slug === payload.slug) || payload
    revalidateTag('notes')
    revalidateTag(`note:${payload.slug}`)
    revalidatePath('/')
    revalidatePath('/notes')
    revalidatePath('/api/notes')
    revalidatePath(`/notes/${payload.slug}`)
    // Every old alias can hold its own route response (including a redirect).
    for (const alias of savedNote.aliases || []) {
      revalidateTag(`note:${alias}`)
      revalidatePath(`/notes/${alias}`)
    }
    revalidatePath('/sitemap.xml')
    if (previousSlug && previousSlug !== payload.slug) revalidatePath(`/notes/${previousSlug}`)
    return finish(request, { note: savedNote }, { kind: 'note', slugs: [payload.slug], previousSlugs: [previousSlug, ...(savedNote.aliases || [])].filter(Boolean) }, { previousNotes })
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

    let aliases: string[] = []
    let previousNotes: LongformNote[] = []
    await mutateAuthoritativeNotes((notes) => {
      previousNotes = notes.slice()
      const existing = notes.find((item) => item.slug === slug)
      aliases = existing?.aliases || []
      if (existing && (existing.updatedAt || '') !== searchParams.get('expectedUpdatedAt')) throw new NoteConflictError()
      return notes.filter((item) => item.slug !== slug)
    })
    revalidateTag('notes')
    revalidateTag(`note:${slug}`)
    revalidatePath('/')
    revalidatePath('/notes')
    revalidatePath('/api/notes')
    revalidatePath(`/notes/${slug}`)
    for (const alias of aliases) {
      revalidateTag(`note:${alias}`)
      revalidatePath(`/notes/${alias}`)
    }
    revalidatePath('/sitemap.xml')
    return finish(request, { ok: true }, { kind: 'note', slugs: [slug], previousSlugs: aliases }, { previousNotes })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '删除笔记失败。' }, { status: error instanceof NoteConflictError ? 409 : 500, headers: ADMIN_HEADERS })
  }
}




