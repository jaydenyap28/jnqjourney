import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { normalizeGuidePayload, readGuideBySlug, readGuides, saveGuides } from '@/lib/server/guides-store'
import { orderedGuideAttractions } from '@/lib/guide-attractions'
import { countLegacyGuideLinkedSpots } from '@/lib/guide-legacy-migration'
import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { publishManualGuideTripCost } from '@/lib/server/public-guide-trip-cost'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'
import type { PublicationChange, PublicationCatalog } from '@/lib/publication-plan'

export const runtime = 'nodejs'
const ADMIN_HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }
async function finish(request: Request, payload: Record<string, unknown>, change: PublicationChange, previous: Partial<PublicationCatalog> = {}) {
  try { return publicationResponse(payload, await invalidatePublication(request, change, previous)) }
  catch (error) { return publicationFailure(error, change) }
}

function guideAttractionSignature(guide: ReturnType<typeof normalizeGuidePayload>) {
  const days = guide.days.map((day) => orderedGuideAttractions(day).map((item) => [item.spotId || null, item.spotSlug || null, item.displayOrder, item.enabled !== false]))
  const segments = (guide.itinerarySegments || []).flatMap((segment) =>
    segment.verifiedRoutes.map((route) => [route.dayNumber ?? null, orderedGuideAttractions(route).map((item) => [item.spotId || null, item.spotSlug || null, item.displayOrder, item.enabled !== false])])
  )
  return JSON.stringify({ days, segments, attractions: guide.attractions, accommodationStays: guide.accommodationStays })
}

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const guides = await readGuides()
  return NextResponse.json({ guides }, { headers: ADMIN_HEADERS })
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const rawPayload = await request.json()
    if (rawPayload?.action === 'revalidate-public') {
      const slug = String(rawPayload.slug || '').trim()
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 150) return NextResponse.json({ error: 'Invalid Guide slug.' }, { status: 400, headers: ADMIN_HEADERS })
      revalidateTag('guides')
      revalidateTag(`guide:${slug}`)
      revalidatePath('/')
      revalidatePath('/guide')
      revalidatePath('/api/guides')
      revalidatePath(`/guide/${slug}`)
      revalidatePath('/sitemap.xml')
      return finish(request, { ok: true, slug }, { kind: 'guide', slugs: [slug] })
    }
    const legacyLinkedSpotCount = countLegacyGuideLinkedSpots(rawPayload)
    if (legacyLinkedSpotCount) {
      return NextResponse.json(
        { error: `Guide saves require canonical attractions; received ${legacyLinkedSpotCount} legacy linkedSpots.` },
        { status: 400, headers: ADMIN_HEADERS }
      )
    }
    const previousSlug = String(rawPayload?.previousSlug || '').trim()
    const payload = normalizeGuidePayload(rawPayload, { enforceBudgetTotal: true })

    if (!payload.slug || !payload.title) {
      return NextResponse.json({ error: '攻略至少需要 slug 和标题。' }, { status: 400 })
    }

    const guides = await readGuides()
    const previousGuides = guides.slice()
    const existingIndex = guides.findIndex(
      (item) =>
        item.slug === payload.slug ||
        (previousSlug && item.slug === previousSlug) ||
        (Array.isArray(item.aliases) && item.aliases.includes(payload.slug)) ||
        (previousSlug && Array.isArray(item.aliases) && item.aliases.includes(previousSlug))
    )

    if (existingIndex >= 0) {
      payload.aliases = Array.from(new Set([...(guides[existingIndex].aliases || []), ...(payload.aliases || []), guides[existingIndex].slug])).filter((slug) => slug !== payload.slug)
      guides[existingIndex] = payload
    } else {
      guides.unshift(payload)
    }

    await saveGuides(guides)
    const savedGuide = await readGuideBySlug(payload.slug)
    if (!savedGuide || savedGuide.title !== payload.title || guideAttractionSignature(savedGuide) !== guideAttractionSignature(payload)) {
      return NextResponse.json({ error: 'Guide was not persisted by the authoritative store.' }, { status: 409, headers: ADMIN_HEADERS })
    }
    let tripCostSnapshotUpdated = true
    let tripCostSnapshotWarning: string | null = null
    try {
      await publishManualGuideTripCost(savedGuide)
    } catch (error: any) {
      tripCostSnapshotUpdated = false
      tripCostSnapshotWarning = error?.message || 'Guide saved, but the public Trip Cost snapshot was not updated.'
    }
    for (const alias of savedGuide.aliases || []) {
      revalidateTag(`guide:${alias}`)
      revalidatePath(`/guide/${alias}`)
    }
    revalidateTag('guides')
    revalidateTag(`guide:${payload.slug}`)
    revalidateTag('guide-trip-costs')
    revalidateTag(`guide-trip-cost:${payload.slug}`)
    if (previousSlug && previousSlug !== payload.slug) revalidateTag(`guide:${previousSlug}`)
    revalidatePath('/')
    revalidatePath('/guide')
    revalidatePath('/api/guides')
    revalidatePath(`/guide/${payload.slug}`)
    revalidatePath('/sitemap.xml')
    revalidatePath('/admin/guides')
    revalidatePath(`/admin/guides/${payload.slug}`)
    if (previousSlug && previousSlug !== payload.slug) revalidatePath(`/guide/${previousSlug}`)
    if (!tripCostSnapshotUpdated) return NextResponse.json({ guide: savedGuide, tripCostSnapshotUpdated, tripCostSnapshotWarning,
      error: 'Guide saved, but public Trip Cost publication failed. Reload before retrying publication.',
    }, { status: 503, headers: ADMIN_HEADERS })
    return finish(request, { guide: savedGuide, savedAt: new Date().toISOString(), tripCostSnapshotUpdated, tripCostSnapshotWarning },
      { kind: 'guide', slugs: [payload.slug], previousSlugs: [previousSlug, ...(savedGuide.aliases || [])].filter(Boolean) }, { previousGuides })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '保存攻略失败。' }, { status: 500, headers: ADMIN_HEADERS })
  }
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const { searchParams } = new URL(request.url)
    const slug = String(searchParams.get('slug') || '').trim()
    if (!slug) {
      return NextResponse.json({ error: '缺少 slug。' }, { status: 400, headers: ADMIN_HEADERS })
    }

    const guides = await readGuides()
    const aliases = guides.find((item) => item.slug === slug)?.aliases || []
    const nextGuides = guides.filter((item) => item.slug !== slug)
    await saveGuides(nextGuides)
    revalidateTag('guides')
    revalidateTag(`guide:${slug}`)
    revalidatePath('/')
    revalidatePath('/guide')
    revalidatePath('/api/guides')
    revalidatePath(`/guide/${slug}`)
    for (const alias of aliases) {
      revalidateTag(`guide:${alias}`)
      revalidatePath(`/guide/${alias}`)
    }
    revalidatePath('/sitemap.xml')
    return finish(request, { ok: true }, { kind: 'guide', slugs: [slug], previousSlugs: aliases }, { previousGuides: guides })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '删除攻略失败。' }, { status: 500, headers: ADMIN_HEADERS })
  }
}





