import './assert-server'
import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SPOT_FIELDS } from '../../cloudflare/spot-loop/publication-gate.mjs'
import { controlledMediaValue } from '@/lib/controlled-media'
import { isolatedReadIds } from './consumer-scope'

export const PUBLIC_READ_LIMITS = { page: 200, pages: 50, rpc: 20, feedBytes: 4 * 1024 * 1024 } as const
export class PublicReadUnavailable extends Error {
  constructor() { super('Authoritative public source unavailable.'); this.name = 'PublicReadUnavailable' }
}
export function publicServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new PublicReadUnavailable()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8000) }),
  } })
}
export function validatePublicRows(value: unknown, ids: number[]) {
  if (!Array.isArray(value) || value.length > ids.length || new Set(value.map(row => row.id)).size !== value.length || value.some(row =>
    !ids.includes(row.id) || row.id === 450 || row.status !== 'active' || ![null, 'published'].includes(row.publication_status) ||
    PUBLIC_SPOT_FIELDS.some((key: string) => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !PUBLIC_SPOT_FIELDS.includes(key)))) throw new PublicReadUnavailable()
  return controlledMediaValue(value) as Record<string, any>[]
}
export async function readPublicRows(ids?: number[]) {
  const db = publicServiceClient()
  const isolated = isolatedReadIds()
  if (isolated && ids?.some(id => !isolated.includes(id))) return []
  const selected = ids == null ? (isolated || []) : [...new Set(ids)]
  if (selected.some(id => !Number.isSafeInteger(id) || id <= 0) || selected.length > PUBLIC_READ_LIMITS.page * PUBLIC_READ_LIMITS.pages) throw new PublicReadUnavailable()
  if (ids == null && !isolated) {
    // The internal ID inventory is never a public response or a visibility
    // decision. Each page is re-qualified by the existing transaction RPC.
    let cursor = 0
    let ended = false
    for (let page = 0; page < PUBLIC_READ_LIMITS.pages; page++) {
      const result = await db.from('locations').select('id').gt('id', cursor).order('id').limit(PUBLIC_READ_LIMITS.page)
      if (result.error || !Array.isArray(result.data)) throw new PublicReadUnavailable()
      for (const row of result.data) {
        if (!Number.isSafeInteger(row.id) || row.id <= cursor) throw new PublicReadUnavailable()
        cursor = row.id; selected.push(row.id)
      }
      if (result.data.length < PUBLIC_READ_LIMITS.page) { ended = true; break }
    }
    if (!ended) throw new PublicReadUnavailable()
  }
  const rows: Record<string, any>[] = []
  for (let start = 0; start < selected.length; start += PUBLIC_READ_LIMITS.rpc) {
    const batch = selected.slice(start, start + PUBLIC_READ_LIMITS.rpc)
    const result = await db.rpc('jnq_public_spots', { p_ids: batch })
    if (result.error) throw new PublicReadUnavailable()
    rows.push(...validatePublicRows(result.data, batch))
  }
  return rows
}
