import 'server-only'

import { revalidatePath, revalidateTag } from 'next/cache'

import { resolvePublicSnapshotBundleUncached } from '@/lib/server/public-data-resolver'
import { readAuthoritativePublicSpotsByIds } from '@/lib/server/public-spot-resolver'
import { syncSpotEnglishTranslations } from '@/lib/server/spot-english-sync'
import {
  uploadPublicDataSnapshot,
  uploadPublicSpotIndex,
  uploadPublicSpotSnapshot,
} from '@/lib/server/r2'

export interface PublishSpotBatchResult {
  generatedAt: string
  refreshed: Array<{ id: number; slug: string; url: string }>
  skipped: number[]
  english: Awaited<ReturnType<typeof syncSpotEnglishTranslations>>
  locationsUrl: string
  indexUrl: string
}

export async function publishSpotBatch(ids: number[], sourceType = 'supabase-auto-spot-sync'): Promise<PublishSpotBatchResult> {
  const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isInteger(id) && id > 0)
  if (!uniqueIds.length) throw new Error('No valid Spot IDs to publish.')

  const generatedAt = new Date().toISOString()
  const source = { type: sourceType, generatedAt }

  const english = await syncSpotEnglishTranslations(uniqueIds)
  const [{ data }, spots] = await Promise.all([
    resolvePublicSnapshotBundleUncached(),
    readAuthoritativePublicSpotsByIds(uniqueIds),
  ])

  const spotById = new Map(spots.map((spot) => [spot.id, spot]))
  const refreshed: Array<{ id: number; slug: string; url: string }> = []
  const skipped: number[] = []

  for (const id of uniqueIds) {
    const spot = spotById.get(id)
    if (!spot) {
      skipped.push(id)
      continue
    }

    const url = await uploadPublicSpotSnapshot(
      spot.slug,
      Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, spot })}\n`)
    )
    refreshed.push({ id: spot.id, slug: spot.slug, url })
  }

  const refreshedIdSet = new Set(uniqueIds)
  const slugs = data.locations
    .map((location) => location.slug)
    .filter((slug) => {
      const match = String(slug || '').match(/-(\d+)$/)
      return !match || !refreshedIdSet.has(Number(match[1]))
    })

  for (const item of refreshed) slugs.push(item.slug)

  const [locationsUrl, indexUrl] = await Promise.all([
    uploadPublicDataSnapshot(
      'locations.json',
      Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, locations: data.locations })}\n`)
    ),
    uploadPublicSpotIndex(
      Buffer.from(`${JSON.stringify({
        schemaVersion: 1,
        source,
        slugs: Array.from(new Set(slugs)).sort(),
      })}\n`)
    ),
  ])

  revalidateTag('public-data')
  revalidateTag('public-locations')
  revalidateTag('public-spots')

  for (const item of refreshed) {
    revalidateTag(`public-spot:${item.slug}`)
    revalidatePath(`/spot/${item.slug}`)
    revalidatePath(`/en/spot/${item.slug}`)
    revalidatePath(`/api/spots/${item.slug}`)
  }

  return {
    generatedAt,
    refreshed,
    skipped,
    english,
    locationsUrl,
    indexUrl,
  }
}
