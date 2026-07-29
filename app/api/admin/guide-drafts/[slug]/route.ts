import { NextResponse } from 'next/server'

import { jiangnanGuideDraft, jiangnanPriceCandidates, JIANGNAN_GUIDE_DRAFT_SLUG } from '@/lib/guide-drafts'
import { requireAdminRequest } from '@/lib/server/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const { slug } = await params
  if (slug !== JIANGNAN_GUIDE_DRAFT_SLUG) return NextResponse.json({ error: 'Guide draft not found.' }, { status: 404 })
  return NextResponse.json({ guide: jiangnanGuideDraft, priceCandidates: jiangnanPriceCandidates }, { headers: { 'Cache-Control': 'private, no-store' } })
}
