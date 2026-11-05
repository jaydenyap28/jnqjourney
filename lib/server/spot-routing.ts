import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveSpotRouting, type SpotRoutingRecord } from '@/lib/spot-redirect'

function verifiedRoutingRow(value: unknown, id: number): SpotRoutingRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unverified Spot routing response.')
  const row = value as Record<string, unknown>
  const publicationStatus = row.publication_status
  if (row.id !== id || typeof row.status !== 'string' || !row.status.trim()
    || !(publicationStatus === null || publicationStatus === 'published' || publicationStatus === 'draft' || publicationStatus === 'hidden')
    || !(row.redirect_url === null || typeof row.redirect_url === 'string')
    || !(row.redirect_type === null || row.redirect_type === 301 || row.redirect_type === 302)) {
    throw new Error('Required current Spot routing fields are unavailable.')
  }
  // Explicit null is the existing legacy-published value. Undefined/missing
  // fields above are rejected, never replaced by an id/status-only query.
  const redirectUrl = row.redirect_url?.trim() || null
  return {
    id,
    publication_status: row.status !== 'active' && !redirectUrl ? 'hidden' : publicationStatus,
    redirect_url: redirectUrl,
    redirect_type: row.redirect_type,
  }
}

export async function readSpotRouting(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || id === 450) return { visible: false }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Current Spot routing source is unavailable.')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Visibility checks must never be served from Next's fetch cache.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error' }) },
  })
  // A single real cancellation deadline also bounds the complete redirect chain.
  const signal = AbortSignal.timeout(2500)
  const live = await resolveSpotRouting(id, async spotId => {
    if (spotId === 450) return null
    const result = await client.from('locations')
      .select('id,status,publication_status,redirect_url,redirect_type')
      .eq('id', spotId)
      .abortSignal(signal)
      .maybeSingle()
    if (result.error) throw new Error('Current Spot routing query failed.')
    if (result.data === null) return null
    return verifiedRoutingRow(result.data, spotId)
  })
  return { ...live, source: 'supabase' }
}
