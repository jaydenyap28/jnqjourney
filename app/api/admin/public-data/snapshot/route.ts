import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { resolvePublicSnapshotBundleUncached } from '@/lib/server/public-data-resolver'
import { uploadPublicDataSnapshot, uploadPublicSpotIndex, uploadPublicSpotSnapshot } from '@/lib/server/r2'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const { data, spots } = await resolvePublicSnapshotBundleUncached()
    if (!spots.length || spots.length !== data.locations.length) {
      throw new Error('Authoritative Spot snapshot is empty or incomplete; the previous snapshot remains active.')
    }
    const generatedAt = new Date().toISOString()
    const source = { type: 'supabase-admin-rebuild', generatedAt }
    const [locationsUrl, regionsUrl] = await Promise.all([
      uploadPublicDataSnapshot('locations.json', Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, locations: data.locations })}\n`)),
      uploadPublicDataSnapshot('regions.json', Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, regions: data.regions })}\n`)),
    ])
    const spotUrls: string[] = []
    for (let offset = 0; offset < spots.length; offset += 12) {
      const batch = spots.slice(offset, offset + 12)
      spotUrls.push(...await Promise.all(batch.map((spot) =>
        uploadPublicSpotSnapshot(
          spot.slug,
          Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, spot })}\n`)
        )
      )))
    }
    const spotIndexUrl = await uploadPublicSpotIndex(Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      source,
      slugs: spots.map((spot) => spot.slug),
    })}\n`))
    revalidateTag('public-data')
    revalidateTag('public-locations')
    revalidateTag('public-regions')
    revalidateTag('public-spots')
    return NextResponse.json({ ok: true, generatedAt, counts: { locations: data.locations.length, regions: data.regions.length, spots: spots.length }, urls: { locations: locationsUrl, regions: regionsUrl, spotIndex: spotIndexUrl, firstSpot: spotUrls[0] || null } }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Snapshot rebuild failed; the previous snapshot remains active.' }, { status: 503, headers: HEADERS })
  }
}
