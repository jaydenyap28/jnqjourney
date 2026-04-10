import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { normalizeGuidePayload, readGuides, saveGuides } from '@/lib/server/guides-store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const guides = await readGuides()
  return NextResponse.json({ guides })
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const rawPayload = await request.json()
    const previousSlug = String(rawPayload?.previousSlug || '').trim()
    const payload = normalizeGuidePayload(rawPayload)

    if (!payload.slug || !payload.title) {
      return NextResponse.json({ error: '攻略至少需要 slug 和标题。' }, { status: 400 })
    }

    const guides = await readGuides()
    const existingIndex = guides.findIndex(
      (item) =>
        item.slug === payload.slug ||
        (previousSlug && item.slug === previousSlug) ||
        (Array.isArray(item.aliases) && item.aliases.includes(payload.slug)) ||
        (previousSlug && Array.isArray(item.aliases) && item.aliases.includes(previousSlug))
    )

    if (existingIndex >= 0) {
      guides[existingIndex] = payload
    } else {
      guides.unshift(payload)
    }

    const savedGuides = await saveGuides(guides)
    const savedGuide =
      savedGuides.find((item) => item.slug === payload.slug || (previousSlug && item.slug === previousSlug)) || payload
    return NextResponse.json({ guide: savedGuide, savedAt: new Date().toISOString() })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '保存攻略失败。' }, { status: 500 })
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

    const guides = await readGuides()
    const nextGuides = guides.filter((item) => item.slug !== slug)
    await saveGuides(nextGuides)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '删除攻略失败。' }, { status: 500 })
  }
}





