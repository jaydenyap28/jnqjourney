import { NextResponse } from 'next/server'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import {
  listGuideBudgetSnapshots,
  updateGuideBudgetSnapshot,
} from '@/lib/server/guide-budget-store'
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
    return NextResponse.json({ error: 'Unknown guide_slug.' }, { status: 400 })
  }
  try {
    return NextResponse.json({ snapshots: await listGuideBudgetSnapshots(guideSlug) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load snapshots.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminRequest(request)
  if (!admin.ok) return admin.response
  try {
    const body = await request.json()
    const id = String(body?.id || '').trim()
    const action = String(body?.action || '').trim()
    if (!id || !['review', 'reject', 'publish', 'restore', 'merge_unclassified'].includes(action)) {
      return NextResponse.json({ error: 'Invalid snapshot action.' }, { status: 400 })
    }
    const snapshot = await updateGuideBudgetSnapshot(id, action as any)
    return NextResponse.json({ snapshot })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to update snapshot.' }, { status: 400 })
  }
}
