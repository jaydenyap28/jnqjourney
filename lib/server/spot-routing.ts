import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveSpotRouting, type SpotRoutingRecord } from '@/lib/spot-redirect'
import routingSnapshot from '@/data/spot-routing-snapshot.json'

const PUBLISHED_IDS = new Set<number>(routingSnapshot.publishedSpotIds)
const UNPUBLISHED_IDS = new Set<number>(routingSnapshot.unpublishedSpotIds)
const ROUTING_REDIRECTS = routingSnapshot.redirects as SpotRoutingRecord[]

function readSnapshotSpotRouting(id: number) {
  return resolveSpotRouting(id, async spotId => {
    const redirect = ROUTING_REDIRECTS.find(item => item.id === spotId)
    if (redirect) return redirect
    if (PUBLISHED_IDS.has(spotId)) return { id: spotId, publication_status: 'published' }
    if (UNPUBLISHED_IDS.has(spotId)) return { id: spotId, publication_status: 'hidden' }
    // New IDs were not reviewed when the backup was taken. Do not guess
    // their publication status from old CDN indexes or static files.
    throw new Error('Spot is not covered by verified public routing snapshot.')
  })
}

export async function readSpotRouting(id: number) {
  if (!Number.isInteger(id) || id <= 0 || id === 450) return { visible: false }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (url && key) {
    try {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      const live = await resolveSpotRouting(id, async spotId => {
        let result = await client.from('locations')
          .select('id,status,publication_status,redirect_url,redirect_type')
          .eq('id', spotId)
          .abortSignal(AbortSignal.timeout(2500))
          .maybeSingle()
        if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
          const legacy = await client.from('locations')
            .select('id,status')
            .eq('id', spotId)
            .abortSignal(AbortSignal.timeout(2500))
            .maybeSingle()
          if (legacy.error) throw new Error(legacy.error.message)
          return legacy.data && legacy.data.status === 'active' ? legacy.data : null
        }
        if (result.error) throw new Error(result.error.message)
        if (!result.data) return null
        // An inactive row can retain a redirect, but it must never render
        // as a published detail page by itself.
        return result.data.status !== 'active' && !result.data.redirect_url
          ? { ...result.data, publication_status: 'hidden' }
          : result.data
      })
      return { ...live, source: 'supabase' }
    } catch (error) {
      console.error('[spot-routing] Live routing unavailable. Using verified published snapshot:', error)
    }
  }

  const backup = await readSnapshotSpotRouting(id)
  return { ...backup, source: 'snapshot' }
}
