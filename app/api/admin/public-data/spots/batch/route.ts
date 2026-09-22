import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { resolvePublicSnapshotBundleUncached } from '@/lib/server/public-data-resolver'
import { syncSpotEnglishTranslations } from '@/lib/server/spot-english-sync'
import { readAuthoritativePublicSpotById } from '@/lib/server/public-spot-resolver'
import { uploadPublicDataSnapshot, uploadPublicSpotIndex, uploadPublicSpotSnapshot } from '@/lib/server/r2'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }
const MAX_BATCH_SIZE = 4

function validIds(value: unknown) {
  if (!Array.isArray(value)) return null
  const ids = Array.from(new Set(value.map(Number))).filter((id) => Number.isInteger(id) && id > 0)
  return ids.length && ids.length <= MAX_BATCH_SIZE ? ids : null
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400, headers: HEADERS })
  }

  const ids = validIds(body?.ids)
  if (!ids) {
    return NextResponse.json(
      { ok: false, error: `Provide 1-${MAX_BATCH_SIZE} valid Spot IDs.` },
      { status: 400, headers: HEADERS }
    )
  }

  try {
    const generatedAt = new Date().toISOString()
    const source = { type: 'supabase-admin-spot-batch-refresh', generatedAt }
    const english = await syncSpotEnglishTranslations(ids)
    const { data } = await resolvePublicSnapshotBundleUncached()
    const { locations } = data

    const refreshed: Array<{ id: number; slug: string; url: string }> = []
    const skipped: number[] = []

    for (const id of ids) {
      const spot = await readAuthoritativePublicSpotById(id)
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

    const refreshedIdSet = new Set(ids)
    const slugs = locations
      .map((location) => location.slug)
      .filter((slug) => {
        const match = String(slug || '').match(/-(\d+)$/)
        return !match || !refreshedIdSet.has(Number(match[1]))
      })

    for (const item of refreshed) slugs.push(item.slug)

    const [locationsUrl, indexUrl] = await Promise.all([
      uploadPublicDataSnapshot(
        'locations.json',
        Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, locations })}\n`)
      ),
      uploadPublicSpotIndex(
        Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, slugs: Array.from(new Set(slugs)).sort() })}\n`)
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

    return NextResponse.json(
      {
        ok: true,
        generatedAt,
        refreshed,
        skipped,
        english,
        locationsUrl,
        indexUrl,
      },
      { headers: HEADERS }
    )
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Batch Spot snapshot refresh failed; previous snapshots remain active.' },
      { status: 503, headers: HEADERS }
    )
  }
}
