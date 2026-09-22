import { NextResponse } from 'next/server'
import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { publishSpotBatch } from '@/lib/server/spot-publication'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }
const MAX_BATCH_SIZE = 4

function validIds(value: unknown) {
  if (!Array.isArray(value)) return null
  const ids = Array.from(new Set(value.map(Number))).filter((id) => Number.isInteger(id) && id > 0)
  return ids.length && ids.length <= MAX_BATCH_SIZE ? ids : null
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400, headers: HEADERS })
  }

  const ids = validIds(body?.ids)
  if (!ids) {
    return NextResponse.json(
      { ok: false, error: `Provide 1-${MAX_BATCH_SIZE} valid Spot IDs.` },
      { status: 400, headers: HEADERS }
    )
  }

  try {
    const result = await publishSpotBatch(ids, 'supabase-admin-spot-batch-refresh')
    return NextResponse.json({ ok: true, ...result }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Batch Spot snapshot refresh failed; previous snapshots remain active.' },
      { status: 503, headers: HEADERS }
    )
  }
}
