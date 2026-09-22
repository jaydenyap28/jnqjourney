import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { publishSpotBatch } from '@/lib/server/spot-publication'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HEADERS = { 'Cache-Control': 'private, no-store' }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration for automatic Spot sync.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function remainingCount(supabase: ReturnType<typeof adminClient>) {
  const { count } = await supabase
    .from('spot_publication_sync')
    .select('spot_id', { count: 'exact', head: true })
    .is('synced_source_updated_at', null)
  return Number(count || 0)
}

async function runOne() {
  const supabase = adminClient()
  const { data: claimRows, error: claimError } = await supabase.rpc('claim_next_spot_publication_sync')
  if (claimError) throw new Error(claimError.message || 'Unable to claim pending Spot publication.')

  const claim = Array.isArray(claimRows) ? claimRows[0] : null
  if (!claim?.spot_id) {
    return {
      ok: true,
      processed: false,
      remaining: await remainingCount(supabase),
    }
  }

  const id = Number(claim.spot_id)
  try {
    const publication = await publishSpotBatch([id], 'supabase-auto-spot-sync')
    const { error: completeError } = await supabase.rpc('complete_spot_publication_sync', { p_spot_id: id })
    if (completeError) throw new Error(completeError.message || 'Unable to mark Spot publication complete.')

    return {
      ok: true,
      processed: true,
      id,
      publication,
      remaining: await remainingCount(supabase),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic Spot publication failed.'
    try {
      await supabase.rpc('fail_spot_publication_sync', { p_spot_id: id, p_error: message })
    } catch {}
    return {
      ok: false,
      processed: true,
      id,
      error: message,
      remaining: await remainingCount(supabase),
    }
  }
}

export async function GET() {
  try {
    const result = await runOne()
    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: HEADERS })
  } catch (error) {
    return NextResponse.json(
      { ok: false, processed: false, error: error instanceof Error ? error.message : 'Automatic Spot sync failed.' },
      { status: 503, headers: HEADERS }
    )
  }
}

export async function POST() {
  return GET()
}
