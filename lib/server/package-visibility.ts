import publishedSnapshot from '@/data/travel-packages-snapshot.json'

// Edge-safe visibility read: no internal API request or full package renderer.
// Preserve main's verified published backup only for unavailable live sources.
export async function packageVisibility(slug: string): Promise<204 | 404 | 503> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return 404
  const backup = () => publishedSnapshot.packages.some(item => item.slug === slug && item.status === 'published') ? 204 as const : 503 as const
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return backup()
  try {
    const endpoint = new URL('/rest/v1/travel_packages', base)
    endpoint.search = new URLSearchParams({ select: 'id', slug: `eq.${slug}`, status: 'eq.published', limit: '1' }).toString()
    const response = await fetch(endpoint, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(4000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } })
    if (!response.ok) return backup()
    const rows: unknown = await response.json()
    if (!Array.isArray(rows)) return 503
    if (rows.length === 0) return 404
    return rows.length === 1 && Number.isSafeInteger(rows[0]?.id) && rows[0].id > 0 ? 204 : 503
  } catch { return backup() }
}
