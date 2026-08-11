import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import {
  listGuideBudgetSnapshots,
  guideBudgetRecordToDisplaySnapshot,
  updateGuideBudgetSnapshot,
} from '@/lib/server/guide-budget-store'
import { readGuideBySlug } from '@/lib/server/guides-store'
import { publishActualGuideTripCost } from '@/lib/server/public-guide-trip-cost'
import { PRIVATE_NO_STORE } from '@/lib/public-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

export async function GET(request: Request) {
  const admin = await requireAdminRequest(request)
  if (!admin.ok) return admin.response
  const guideSlug = new URL(request.url).searchParams.get('guide_slug')?.trim() || ''
  if (!guideSlug) return NextResponse.json({ error: 'Missing guide_slug.' }, { status: 400, headers: HEADERS })
  const guide = await readGuideBySlug(guideSlug)
  if (!guide || guide.slug !== guideSlug) {
    return NextResponse.json({ error: 'Unknown guide_slug.' }, { status: 400, headers: HEADERS })
  }
  try {
    return NextResponse.json({ snapshots: await listGuideBudgetSnapshots(guideSlug) }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load snapshots.' }, { status: 500, headers: HEADERS })
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
      return NextResponse.json({ error: 'Invalid snapshot action.' }, { status: 400, headers: HEADERS })
    }
    const snapshot = await updateGuideBudgetSnapshot(id, action as any)
    let publicSnapshotUpdated: boolean | null = null
    let publicSnapshotWarning: string | null = null
    if (action === 'publish' || action === 'restore') {
      try {
        await publishActualGuideTripCost(
          snapshot.guide_slug,
          guideBudgetRecordToDisplaySnapshot(snapshot),
          snapshot.snapshot_version,
        )
        publicSnapshotUpdated = true
        revalidateTag('guide-trip-costs')
        revalidateTag(`guide-trip-cost:${snapshot.guide_slug}`)
        revalidatePath(`/guide/${snapshot.guide_slug}`)
        revalidatePath('/api/guides')
      } catch (error: any) {
        publicSnapshotUpdated = false
        publicSnapshotWarning = error?.message || 'Published Actual was saved, but the public snapshot was not updated.'
      }
    }
    return NextResponse.json({ snapshot, publicSnapshotUpdated, publicSnapshotWarning }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to update snapshot.' }, { status: 400, headers: HEADERS })
  }
}
