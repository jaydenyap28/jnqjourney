import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { normalizeGuidePayload, readGuideBySlug, readGuides, saveGuides } from '@/lib/server/guides-store'
import { orderedGuideAttractions } from '@/lib/guide-attractions'

export const runtime = 'nodejs'

function guideAttractionSignature(guide: ReturnType<typeof normalizeGuidePayload>) {
  const days = guide.days.map((day) => orderedGuideAttractions(day).map((item) => [item.spotId || null, item.spotSlug || null, item.displayOrder, item.enabled !== false]))
  const segments = (guide.itinerarySegments || []).flatMap((segment) =>
    segment.verifiedRoutes.map((route) => [route.dayNumber || null, orderedGuideAttractions(route).map((item) => [item.spotId || null, item.spotSlug || null, item.displayOrder, item.enabled !== false])])
  )
  return JSON.stringify({ days, segments })
}

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
    const payload = normalizeGuidePayload(rawPayload, { enforceBudgetTotal: true })

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

    await saveGuides(guides)
    const savedGuide = await readGuideBySlug(payload.slug)
    if (!savedGuide || savedGuide.title !== payload.title || guideAttractionSignature(savedGuide) !== guideAttractionSignature(payload)) {
      return NextResponse.json({ error: 'Guide was not persisted by the authoritative store.' }, { status: 409 })
    }
    revalidatePath('/')
    revalidatePath('/guide')
    revalidatePath(`/guide/${payload.slug}`)
    revalidatePath('/admin/guides')
    revalidatePath(`/admin/guides/${payload.slug}`)
    if (previousSlug && previousSlug !== payload.slug) revalidatePath(`/guide/${previousSlug}`)
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





