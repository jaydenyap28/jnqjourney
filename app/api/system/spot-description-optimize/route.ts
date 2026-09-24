import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { optimizeSpotDescription } from '@/lib/server/spot-description-optimizer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const HEADERS = { 'Cache-Control': 'private, no-store' }
const SYSTEM_JOB_NAME = 'jnq_spot_description_optimizer_cron'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration for Spot optimization queue.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function remainingCount(supabase: ReturnType<typeof adminClient>) {
  const { count } = await supabase
    .from('spot_description_optimization_queue')
    .select('spot_id', { count: 'exact', head: true })
    .is('completed_at', null)
    .lt('attempts', 5)

  return Number(count || 0)
}

async function isAuthorizedSystemJob(request: Request) {
  const authorization = String(request.headers.get('authorization') || '').trim()
  if (!authorization.startsWith('Bearer ')) return false

  const token = authorization.slice('Bearer '.length).trim()
  if (!token) return false

  const supabase = adminClient()
  const { data, error } = await supabase.rpc('verify_system_job_secret', {
    p_job_name: SYSTEM_JOB_NAME,
    p_token: token,
  })

  return !error && data === true
}

async function runOne() {
  const supabase = adminClient()
  const { data: claimRows, error: claimError } = await supabase.rpc('claim_next_spot_description_optimization')
  if (claimError) throw new Error(claimError.message || 'Unable to claim pending Spot optimization.')

  const claim = Array.isArray(claimRows) ? claimRows[0] : null
  if (!claim?.spot_id) {
    return { ok: true, processed: false, remaining: await remainingCount(supabase) }
  }

  const id = Number(claim.spot_id)

  try {
    const result = await optimizeSpotDescription(id)
    if (
      result.skipped &&
      result.reason !== 'Spot description already uses the JnQ structure.' &&
      result.reason !== 'Spot not found or inactive.'
    ) {
      throw new Error(result.reason || 'Spot optimization did not produce a complete JnQ rewrite.')
    }

    const { error: completeError } = await supabase.rpc('complete_spot_description_optimization', { p_spot_id: id })
    if (completeError) throw new Error(completeError.message || 'Unable to mark Spot optimization complete.')

    return {
      ok: true,
      processed: true,
      id,
      result,
      remaining: await remainingCount(supabase),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic Spot optimization failed.'
    try {
      await supabase.rpc('fail_spot_description_optimization', { p_spot_id: id, p_error: message })
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

export async function GET(request: Request) {
  try {
    if (!(await isAuthorizedSystemJob(request))) {
      return NextResponse.json(
        { ok: false, processed: false, error: 'Unauthorized system job request.' },
        { status: 401, headers: HEADERS }
      )
    }

    const result = await runOne()
    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: HEADERS })
  } catch (error) {
    return NextResponse.json(
      { ok: false, processed: false, error: error instanceof Error ? error.message : 'Automatic Spot optimization failed.' },
      { status: 503, headers: HEADERS }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
