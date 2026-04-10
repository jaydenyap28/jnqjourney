import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import {
  normalizeKlookWidgetPayload,
  readKlookWidgets,
  saveKlookWidgets,
} from '@/lib/server/klook-widgets-store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  const widgets = await readKlookWidgets()
  return NextResponse.json({ widgets })
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const payload = normalizeKlookWidgetPayload(await request.json())
    if (!payload.title || !payload.htmlCode) {
      return NextResponse.json({ error: 'Widget title and HTML code are required.' }, { status: 400 })
    }

    const widgets = await readKlookWidgets()
    const nextWidgets = widgets.filter((item) => item.id !== payload.id)
    nextWidgets.unshift({
      ...payload,
      updatedAt: new Date().toISOString(),
      createdAt: payload.createdAt || new Date().toISOString(),
    })

    const saved = await saveKlookWidgets(nextWidgets)
    const widget = saved.find((item) => item.id === payload.id) || payload
    return NextResponse.json({ widget, savedAt: new Date().toISOString() })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save Klook widget.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const { searchParams } = new URL(request.url)
    const id = String(searchParams.get('id') || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Missing widget id.' }, { status: 400 })
    }

    const widgets = await readKlookWidgets()
    await saveKlookWidgets(widgets.filter((item) => item.id !== id))
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete Klook widget.' }, { status: 500 })
  }
}
