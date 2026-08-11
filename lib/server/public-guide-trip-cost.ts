import 'server-only'

import { unstable_cache } from 'next/cache'

import staticSnapshot from '@/public-data/guide-trip-costs.json'
import type { TravelGuide } from '@/lib/guides'
import {
  normalizePublicGuideTripCost,
  resolvePublicGuideTripCost,
  type GuideBudgetDisplaySnapshot,
  type PublicGuideTripCost,
} from '@/lib/guide-budget'
import { readPublishedGuideBudget } from '@/lib/server/guide-budget-store'
import { uploadPublicGuideTripCostsSnapshot } from '@/lib/server/r2'

const TIMEOUT_MS = 4000

export interface PublicGuideTripCostRecord {
  slug: string
  snapshotVersion?: number
  tripCost: PublicGuideTripCost
}

interface PublicGuideTripCostSnapshot {
  schemaVersion: 1
  generatedAt: string
  tripCosts: PublicGuideTripCostRecord[]
}

function cdnBase() {
  return String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

export function normalizePublicGuideTripCostSnapshot(value: unknown): PublicGuideTripCostSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { schemaVersion?: unknown; generatedAt?: unknown; tripCosts?: unknown }
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.tripCosts)) return null
  const tripCosts = candidate.tripCosts.flatMap((record) => {
    if (!record || typeof record !== 'object') return []
    const source = record as { slug?: unknown; snapshotVersion?: unknown; tripCost?: unknown }
    const slug = String(source.slug || '').trim()
    const tripCost = normalizePublicGuideTripCost(source.tripCost)
    if (!slug || !tripCost) return []
    const snapshotVersion = Number(source.snapshotVersion)
    return [{
      slug,
      ...(Number.isSafeInteger(snapshotVersion) && snapshotVersion > 0 ? { snapshotVersion } : {}),
      tripCost,
    }]
  })
  if (tripCosts.length !== candidate.tripCosts.length) return null
  return {
    schemaVersion: 1,
    generatedAt: String(candidate.generatedAt || ''),
    tripCosts,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readCdnSnapshot(noStore = false) {
  const base = cdnBase()
  if (!base) return null
  try {
    const response = await fetchWithTimeout(`${base}/public-data/guide-trip-costs.json`, noStore
      ? { cache: 'no-store' }
      : { next: { revalidate: 3600, tags: ['guide-trip-costs'] } })
    if (!response.ok) return null
    return normalizePublicGuideTripCostSnapshot(await response.json())
  } catch {
    return null
  }
}

function readStaticSnapshot() {
  const snapshot = normalizePublicGuideTripCostSnapshot(staticSnapshot)
  if (!snapshot) throw new Error('The bundled Guide Trip Cost snapshot is invalid.')
  return snapshot
}

async function readPublicGuideTripCostUncached(guide: Pick<TravelGuide, 'slug' | 'budgetItems'>) {
  const snapshot = await readCdnSnapshot()
  const published = (snapshot || readStaticSnapshot()).tripCosts.find((item) => item.slug === guide.slug)
  if (published) return published.tripCost

  const actual = await readPublishedGuideBudget(guide.slug)
  return resolvePublicGuideTripCost(actual, guide.budgetItems)
}

export function readPublicGuideTripCost(guide: Pick<TravelGuide, 'slug' | 'budgetItems'>) {
  return unstable_cache(
    () => readPublicGuideTripCostUncached(guide),
    ['public-guide-trip-cost-v1', guide.slug],
    { revalidate: 3600, tags: ['guide-trip-costs', `guide-trip-cost:${guide.slug}`] },
  )()
}

async function publishRecord(record: PublicGuideTripCostRecord) {
  const current = await readCdnSnapshot(true) || readStaticSnapshot()
  const nextRecords = current.tripCosts.filter((item) => item.slug !== record.slug)
  nextRecords.push(record)
  nextRecords.sort((left, right) => left.slug.localeCompare(right.slug))
  const payload: PublicGuideTripCostSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tripCosts: nextRecords,
  }
  const normalized = normalizePublicGuideTripCostSnapshot(payload)
  if (!normalized || normalized.tripCosts.length !== nextRecords.length) {
    throw new Error('Refusing to publish an invalid Guide Trip Cost snapshot.')
  }
  return uploadPublicGuideTripCostsSnapshot(Buffer.from(`${JSON.stringify(normalized)}\n`, 'utf8'))
}

export async function publishActualGuideTripCost(slug: string, actual: GuideBudgetDisplaySnapshot, snapshotVersion?: number) {
  return publishRecord({
    slug,
    ...(snapshotVersion ? { snapshotVersion } : {}),
    tripCost: resolvePublicGuideTripCost(actual, []),
  })
}

export async function publishManualGuideTripCost(guide: Pick<TravelGuide, 'slug' | 'budgetItems'>) {
  const current = await readCdnSnapshot(true) || readStaticSnapshot()
  const existing = current.tripCosts.find((item) => item.slug === guide.slug)
  if (existing?.tripCost.source === 'published_actual') return null
  return publishRecord({ slug: guide.slug, tripCost: resolvePublicGuideTripCost(null, guide.budgetItems) })
}
