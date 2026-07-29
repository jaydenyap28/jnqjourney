import { NextResponse } from 'next/server'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import { readReviewedGuideBudgetDisplay } from '@/lib/server/guide-budget-store'
import { readGuideBySlug } from '@/lib/server/guides-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await requireAdminRequest(request)
  if (!admin.ok) return admin.response

  const guideSlug = new URL(request.url).searchParams.get('guide_slug')?.trim() || ''
  if (!guideSlug) return NextResponse.json({ error: 'Missing guide_slug.' }, { status: 400 })

  const guide = await readGuideBySlug(guideSlug)
  if (!guide || guide.slug !== guideSlug) {
    return NextResponse.json({ error: 'Unknown guide_slug.' }, { status: 404 })
  }

  try {
    const snapshot = await readReviewedGuideBudgetDisplay(guideSlug)
    if (!snapshot) return NextResponse.json({ error: 'No reviewed actual-spend snapshot found.' }, { status: 404 })

    return NextResponse.json({
      guide: { budget: guide.budget, budgetItems: guide.budgetItems, budgetScope: guide.budgetScope },
      snapshot,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load reviewed preview.' }, { status: 500 })
  }
}
