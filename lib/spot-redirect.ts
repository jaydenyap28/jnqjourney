export interface SpotRoutingRecord { id: number; status?: string | null; redirect_url?: string | null; redirect_type?: number | null }

// Local editorial URLs only: prevents open redirects and encoded path tricks.
export function normalizeSpotRedirect(value: unknown) {
  const path = String(value || '').trim()
  if (!path) return null
  if (!/^\/(?:en\/)?(?:spot|notes)\/[\p{L}\p{N}_-]+$/u.test(path)) throw new Error('Redirect must be a local /notes/slug or /spot/slug URL without query or fragment.')
  if (/\/spot\//.test(path) && !/-[1-9]\d*$/.test(path)) throw new Error('Spot redirect must include its numeric ID.')
  return path
}

export async function resolveSpotRouting(id: number, read: (id: number) => Promise<SpotRoutingRecord | null>) {
  const seen = new Set<number>()
  let currentId = id
  let destination: string | null = null
  let status: 301 | 302 = 301
  for (let depth = 0; depth < 16; depth++) {
    if (seen.has(currentId)) throw new Error('Spot redirect loop detected.')
    seen.add(currentId)
    const row = await read(currentId)
    if (!row) return { visible: false }
    const target = normalizeSpotRedirect(row.redirect_url)
    if (!target) return { visible: row.status === 'active', ...(destination && row.status === 'active' ? { destination, status } : {}) }
    if (depth === 0) status = row.redirect_type === 302 ? 302 : 301
    destination = target
    if (!/\/spot\//.test(target)) return { visible: false, destination, status }
    currentId = Number(target.match(/-(\d+)$/)?.[1])
  }
  throw new Error('Spot redirect chain exceeds 16 hops.')
}
