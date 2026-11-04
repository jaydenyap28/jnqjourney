import { supabaseReadKey } from './supabase-read-key'

// Shared by Edge Middleware and the existing API. The publication decision
// stays live even when the package HTML is served from ISR.
export async function packageVisibility(slug: string): Promise<204 | 404 | 502 | 503> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return 404
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = supabaseReadKey()
  if (!base || !key) return 503
  try {
    const endpoint = new URL('/rest/v1/travel_packages', base)
    endpoint.search = new URLSearchParams({ select: 'id', slug: `eq.${slug}`, status: 'eq.published', limit: '1' }).toString()
    const response = await fetch(endpoint, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    })
    if (!response.ok) return 502
    const rows = await response.json()
    if (!Array.isArray(rows)) return 502
    if (rows.length === 0) return 404
    return rows.length === 1 && Number.isSafeInteger(rows[0]?.id) && rows[0].id > 0 ? 204 : 502
  } catch {
    return 503
  }
}
