import { NextResponse } from 'next/server'

import {
  BudgetContractError,
  validateMoneyBotSnapshot,
  validateNonce,
  validateRequestFreshness,
  verifyRequestSignature,
} from '@/lib/server/guide-budget-contract'
import {
  claimBudgetSyncNonce,
  importBudgetSnapshot,
} from '@/lib/server/guide-budget-store'
import { readGuideBySlug } from '@/lib/server/guides-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
}

export async function POST(request: Request) {
  const secret = process.env.JNQ_BUDGET_SYNC_SECRET
  if (!secret) return NextResponse.json({ error: 'Budget sync is not configured.' }, { status: 503 })

  const timestamp = request.headers.get('x-jnq-timestamp') || ''
  const nonce = request.headers.get('x-jnq-nonce') || ''
  const signature = request.headers.get('x-jnq-signature') || ''
  const rawBody = await request.text()

  try {
    validateRequestFreshness(timestamp)
    validateNonce(nonce)
  } catch {
    return unauthorized()
  }
  if (!verifyRequestSignature(secret, timestamp, nonce, rawBody, signature)) return unauthorized()

  try {
    const claimed = await claimBudgetSyncNonce(nonce, timestamp)
    if (!claimed) return unauthorized()

    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw new BudgetContractError('Request body must be valid JSON.')
    }
    const snapshot = validateMoneyBotSnapshot(parsed)
    const guide = await readGuideBySlug(snapshot.guide_slug)
    if (!guide || guide.slug !== snapshot.guide_slug) {
      throw new BudgetContractError('Unknown guide_slug.')
    }
    const result = await importBudgetSnapshot(snapshot)
    return NextResponse.json(
      {
        ok: true,
        imported: !result.alreadyImported,
        snapshot: {
          id: result.record.id,
          guide_slug: result.record.guide_slug,
          review_status: result.record.review_status,
          snapshot_version: result.record.snapshot_version,
          checksum: result.record.checksum,
        },
      },
      { status: result.alreadyImported ? 200 : 201 }
    )
  } catch (error: any) {
    if (error instanceof BudgetContractError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = String(error?.message || 'Budget sync failed.')
    if (message.includes('different checksum')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('Guide budget sync failed:', message)
    return NextResponse.json({ error: 'Budget sync failed.' }, { status: 500 })
  }
}
