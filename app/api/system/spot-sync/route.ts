import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { publishSpotBatch } from '@/lib/server/spot-publication'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const HEADERS = { 'Cache-Control': 'private, no-store' }
const SYSTEM_JOB_NAME = 'jnq_spot_publication_sync_cron'
const PUBLICATION_BATCH_SIZE = 3

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

async function runBatch(skipEnglish = false) {
  const supabase = adminClient()
  const claims: Array<{ id: number; sourceUpdatedAt: string }> = []
  const batchSize = skipEnglish ? 20 : PUBLICATION_BATCH_SIZE

  for (let index = 0; index < batchSize; index += 1) {
    const { data: claimRows, error: claimError } = await supabase.rpc('claim_next_spot_publication_sync')
    if (claimError) throw new Error(claimError.message || 'Unable to claim pending Spot publication.')

    const claim = Array.isArray(claimRows) ? claimRows[0] : null
    if (!claim?.spot_id || !claim?.source_updated_at) break
    claims.push({
      id: Number(claim.spot_id),
      sourceUpdatedAt: String(claim.source_updated_at),
    })
  }

  const ids = claims.map((claim) => claim.id)

  if (!ids.length) {
    return {
      ok: true,
      processed: false,
      ids: [],
      remaining: await remainingCount(supabase),
    }
  }

  try {
    const publication = await publishSpotBatch(ids, 'supabase-auto-spot-sync', { syncEnglish: !skipEnglish })
    const skipped = new Set(publication.skipped.map(Number))
    const completed: number[] = []
    const deferred: number[] = []
    const failed: Array<{ id: number; error: string }> = []

    for (const claim of claims) {
      const id = claim.id
      if (skipped.has(id)) {
        const message = 'Spot was skipped during publication.'
        try {
          await supabase.rpc('fail_spot_publication_sync', { p_spot_id: id, p_error: message })
        } catch {}
        failed.push({ id, error: message })
        continue
      }

      const { data: sourceStillCurrent, error: completeError } = await supabase.rpc('complete_spot_publication_sync', {
        p_spot_id: id,
        p_source_updated_at: claim.sourceUpdatedAt,
      })
      if (completeError) {
        const message = completeError.message || 'Unable to mark Spot publication complete.'
        try {
          await supabase.rpc('fail_spot_publication_sync', { p_spot_id: id, p_error: message })
        } catch {}
        failed.push({ id, error: message })
        continue
      }

      if (sourceStillCurrent !== true) {
        deferred.push(id)
        continue
      }

      completed.push(id)
    }

    return {
      ok: failed.length === 0,
      processed: true,
      ids,
      completed,
      deferred,
      failed,
      publication,
      remaining: await remainingCount(supabase),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic Spot publication failed.'
    for (const id of ids) {
      try {
        await supabase.rpc('fail_spot_publication_sync', { p_spot_id: id, p_error: message })
      } catch {}
    }

    return {
      ok: false,
      processed: true,
      ids,
      completed: [],
      failed: ids.map((id) => ({ id, error: message })),
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

    const skipEnglish = new URL(request.url).searchParams.get('skipEnglish') === '1'
    const result = await runBatch(skipEnglish)
    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: HEADERS })
  } catch (error) {
    return NextResponse.json(
      { ok: false, processed: false, error: error instanceof Error ? error.message : 'Automatic Spot sync failed.' },
      { status: 503, headers: HEADERS }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
