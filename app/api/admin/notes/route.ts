import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { normalizeNotePayload, readNotes, saveNotes } from '@/lib/server/notes-store'
import { PRIVATE_NO_STORE } from '@/lib/public-data'

export const runtime = 'nodejs'
const ADMIN_HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const notes = await readNotes()
  return NextResponse.json({ notes }, { headers: ADMIN_HEADERS })
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const rawPayload = await request.json()
    const previousSlug = String(rawPayload?.previousSlug || '').trim()
    const payload = normalizeNotePayload(rawPayload)

    if (!payload.slug || !payload.title) {
      return NextResponse.json({ error: '笔记至少需要 slug 和标题。' }, { status: 400 })
    }

    const notes = await readNotes()
    const existingIndex = notes.findIndex(
      (item) =>
        item.slug === payload.slug ||
        (previousSlug && item.slug === previousSlug) ||
        (Array.isArray(item.aliases) && item.aliases.includes(payload.slug)) ||
        (previousSlug && Array.isArray(item.aliases) && item.aliases.includes(previousSlug))
    )

    if (existingIndex >= 0) {
      notes[existingIndex] = payload
    } else {
      notes.unshift(payload)
    }

    const savedNotes = await saveNotes(notes)
    const savedNote = savedNotes.find((item) => item.slug === payload.slug) || payload
    revalidateTag('notes')
    revalidatePath('/')
    revalidatePath('/notes')
    revalidatePath('/api/notes')
    revalidatePath(`/notes/${payload.slug}`)
    if (previousSlug && previousSlug !== payload.slug) revalidatePath(`/notes/${previousSlug}`)
    return NextResponse.json({ note: savedNote }, { headers: ADMIN_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '保存笔记失败。' }, { status: 500 })
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

    const notes = await readNotes()
    const nextNotes = notes.filter((item) => item.slug !== slug)
    await saveNotes(nextNotes)
    revalidateTag('notes')
    revalidatePath('/')
    revalidatePath('/notes')
    revalidatePath('/api/notes')
    revalidatePath(`/notes/${slug}`)
    return NextResponse.json({ ok: true }, { headers: ADMIN_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '删除笔记失败。' }, { status: 500 })
  }
}




