import 'server-only'
import { readPublicRows } from './public-spot-projection'
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
  const live = await resolveSpotRouting(id, async spotId => {
    const row = (await readPublicRows([spotId]))[0]
    return row ? verifiedRoutingRow(row, spotId) : null
  })
  return {...live, source: 'supabase'}
}
