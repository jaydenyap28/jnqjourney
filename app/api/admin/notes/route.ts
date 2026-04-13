import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { normalizeNotePayload, readNotes, saveNotes } from '@/lib/server/notes-store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const notes = await readNotes()
  return NextResponse.json({ notes })
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
    return NextResponse.json({ note: savedNote })
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

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '删除笔记失败。' }, { status: 500 })
  }
}




