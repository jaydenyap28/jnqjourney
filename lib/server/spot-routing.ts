import 'server-only'
import { supabaseReadKey } from './supabase-read-key'
import { createClient } from '@supabase/supabase-js'
import { resolveSpotRouting } from '@/lib/spot-redirect'

export async function readSpotRouting(id: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = supabaseReadKey(true)
  if (!url || !key) throw new Error('Spot routing service is unavailable.')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Visibility is authoritative on every request, including cold starts and
    // repeated requests within one Next process. Never use the default GET cache.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  return resolveSpotRouting(id, async spotId => {
    let result = await client.from('locations').select('id,publication_status,redirect_url,redirect_type').eq('id', spotId).abortSignal(AbortSignal.timeout(4000)).maybeSingle()
    // During additive migration rollout old rows remain readable. Never silently
    // ignore any error other than the genuinely absent optional columns.
    if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
      const legacy = await client.from('locations').select('id').eq('id', spotId).abortSignal(AbortSignal.timeout(4000)).maybeSingle()
      if (legacy.error) throw new Error(legacy.error.message)
      return legacy.data
    }
    if (result.error) throw new Error(result.error.message)
    return result.data
  })
}
