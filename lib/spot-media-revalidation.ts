import { createHmac, timingSafeEqual } from 'node:crypto'
import { slugifyLocationName } from './location-routing.ts'

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
type Alias = { spotId: number; slug: string }

export function resolveSpotSnapshotSlug(id: number, index: { schemaVersion: number; slugs: string[] }) {
  if (!Number.isSafeInteger(id) || id <= 0 || index?.schemaVersion !== 1 || !Array.isArray(index.slugs)) throw new Error('Invalid Spot index')
  const matches = index.slugs.filter(slug => typeof slug === 'string' && slug.endsWith(`-${id}`))
  if (matches.length !== 1 || !SAFE_SLUG.test(matches[0])) throw new Error('Spot snapshot identity must be unique')
  return matches[0]
}

// Same canonical base rule as location-slugs-store, without invoking its local
// persistence or save paths. Only fresh authoritative Storage mappings are accepted.
export function confirmedSpotAliases(map: Record<string, string>, spot: { id: number; name: string }): Alias[] {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Invalid authoritative alias map')
  const aliases: Alias[] = []
  for (const [key, value] of Object.entries(map)) {
    if (!/^[1-9]\d*$/.test(key) || typeof value !== 'string') throw new Error('Invalid authoritative alias entry')
    const base = slugifyLocationName(value.trim())
    if (base) aliases.push({ spotId: Number(key), slug: `${base}-${key}` })
  }
  if (!aliases.some(alias => alias.spotId === spot.id)) aliases.push({ spotId: spot.id, slug: `${slugifyLocationName(spot.name) || 'spot'}-${spot.id}` })
  return aliases
}

export function planSpotInvalidation(id: number, requestedSlug: string, snapshotSlug: string,
  snapshot: { schemaVersion: number; spot: { id: number; slug: string } }, aliases: Alias[]) {
  if (snapshot?.schemaVersion !== 1 || snapshot.spot?.id !== id || snapshot.spot?.slug !== snapshotSlug) throw new Error('Snapshot read-back identity mismatch')
  const known = [{ spotId: id, slug: `spot-${id}` }, { spotId: id, slug: snapshotSlug }, ...aliases]
  if (!SAFE_SLUG.test(requestedSlug) || requestedSlug.length > 200) throw new Error('Invalid requested alias')
  const owners = new Set(known.filter(alias => alias.slug === requestedSlug).map(alias => alias.spotId))
  if (owners.size !== 1 || !owners.has(id)) throw new Error('Unknown, ambiguous or wrong-Spot alias')
  const slugs = [...new Set(known.filter(alias => alias.spotId === id).map(alias => alias.slug))]
  for (const slug of slugs) {
    if (!SAFE_SLUG.test(slug) || slug.length > 200 || !slug.endsWith(`-${id}`) || known.some(alias => alias.slug === slug && alias.spotId !== id)) throw new Error('Alias collision or unsafe cache identity')
  }
  return { snapshotSlug, slugs, paths: slugs.flatMap(slug => [`/spot/${slug}`, `/api/spots/${slug}`]), tags: slugs.map(slug => `public-spot:${slug}`) }
}

export function verifySpotRevalidation(body: string, signature: string, secret: string, now = Date.now()) {
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) throw new Error('Invalid maintenance signature')
  const expected = createHmac('sha256', secret).update(body).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new Error('Invalid maintenance signature')
  const payload = JSON.parse(body) as { slug: string; sha256: string; issuedAt: number }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug) || !/^[a-f0-9]{64}$/.test(payload.sha256) ||
      !Number.isFinite(payload.issuedAt) || Math.abs(now - payload.issuedAt) > 60_000) throw new Error('Invalid or expired revalidation payload')
  return payload
}
