import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PublicLocation, PublicRegion } from '@/lib/public-data'
import type { PublicSpotRecord, PublicSpotLookup } from '@/lib/public-spot'

interface PublicFallbackSnapshot {
  schemaVersion: 1
  version: string
  withdrawnIds: number[]
  locations: PublicLocation[]
  regions: PublicRegion[]
  spots: Record<string, PublicSpotRecord>
  eligibility: Record<string, { status: string; publication_status: string | null; indexableAtCapture: boolean }>
}

let pending: Promise<PublicFallbackSnapshot> | undefined
export async function readPublicFallbackSnapshot() {
  // Emergency rollback disables this independent layer. Never silently fall
  // through to the frozen 547-item set, which would resurrect withdrawn IDs.
  if (process.env.VERCEL_ENV === 'preview' || process.env.JNQ_PUBLIC_FALLBACK === 'disabled') throw new Error('Public fallback disabled')
  pending ??= readFile(path.join(process.cwd(), 'public-data/fallback/2026-10-30.json'), 'utf8').then(raw => {
    const value = JSON.parse(raw) as PublicFallbackSnapshot
    if (value.schemaVersion !== 1 || value.version !== '2026-10-30' || !Array.isArray(value.locations) || !Array.isArray(value.regions) || !value.spots || !value.eligibility || !value.withdrawnIds?.includes(450)) throw new Error('Invalid public fallback snapshot')
    if (value.locations.some(row => value.withdrawnIds.includes(row.id)) || value.spots['450']) throw new Error('Withdrawn Spot in public fallback')
    return value
  }).catch(error => { pending = undefined; throw error })
  return pending
}

export async function readFallbackSpot(id: number): Promise<PublicSpotLookup> {
  const snapshot = await readPublicFallbackSnapshot()
  const spot = snapshot.spots[String(id)]
  const state = snapshot.eligibility[String(id)]
  if (snapshot.withdrawnIds.includes(id) || !spot || !state || state.status !== 'active' || (state.publication_status !== null && state.publication_status !== 'published') || spot.publication_status !== state.publication_status) return { status: 'not-found', authoritative: true }
  // indexableAtCapture documents the source policy. The caller always marks
  // static-fallback noindex, including records that once qualified.
  return { status: 'found', spot }
}
