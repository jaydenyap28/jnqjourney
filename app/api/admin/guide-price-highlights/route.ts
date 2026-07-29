import { NextResponse } from 'next/server'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import {
  readGuidePriceHighlightsForAdmin,
  replaceGuidePriceHighlights,
} from '@/lib/server/guide-price-highlights-store'
import { readGuideBySlug } from '@/lib/server/guides-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
}

export async function GET(request: Request) {
  const admin = await requireAdminRequest(request)
  if (!admin.ok) return admin.response

  const guideSlug = new URL(request.url).searchParams.get('guide_slug')?.trim() || ''
  if (!guideSlug) {
    return NextResponse.json({ error: 'Missing guide_slug.' }, { status: 400, headers: privateHeaders })
  }
  const guide = await readGuideBySlug(guideSlug)
  if (!guide || guide.slug !== guideSlug) {
    return NextResponse.json({ error: 'Unknown guide_slug.' }, { status: 404, headers: privateHeaders })
  }

  try {
    const records = await readGuidePriceHighlightsForAdmin(guideSlug)
    return NextResponse.json({ records }, { headers: privateHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to load price highlights.' },
      { status: 500, headers: privateHeaders }
    )
  }
}
export async function PUT(request: Request) {
  const admin = await requireAdminRequest(request)
  if (!admin.ok) return admin.response

  try {
    const body = await request.json()
    const guideSlug = String(body?.guideSlug || '').trim()
    if (!guideSlug || !Array.isArray(body?.records)) {
      return NextResponse.json(
        { error: 'guideSlug and records are required.' },
        { status: 400, headers: privateHeaders }
      )
    }
    const guide = await readGuideBySlug(guideSlug)
    if (!guide || guide.slug !== guideSlug) {
      return NextResponse.json({ error: 'Unknown guideSlug.' }, { status: 404, headers: privateHeaders })
    }
    const records = await replaceGuidePriceHighlights(guideSlug, body.records)
    return NextResponse.json({ records }, { headers: privateHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to save price highlights.' },
      { status: 400, headers: privateHeaders }
    )
  }
}
