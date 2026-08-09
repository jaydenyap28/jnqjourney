import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { resolvePublicDataUncachedForSnapshot } from '@/lib/server/public-data-resolver'
import { uploadPublicDataSnapshot } from '@/lib/server/r2'

export const runtime = 'nodejs'
const HEADERS = { 'Cache-Control': PRIVATE_NO_STORE }

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const data = await resolvePublicDataUncachedForSnapshot()
    const generatedAt = new Date().toISOString()
    const source = { type: 'supabase-admin-rebuild', generatedAt }
    const [locationsUrl, regionsUrl] = await Promise.all([
      uploadPublicDataSnapshot('locations.json', Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, locations: data.locations })}\n`)),
      uploadPublicDataSnapshot('regions.json', Buffer.from(`${JSON.stringify({ schemaVersion: 1, source, regions: data.regions })}\n`)),
    ])
    revalidateTag('public-data')
    revalidateTag('public-locations')
    revalidateTag('public-regions')
    return NextResponse.json({ ok: true, generatedAt, counts: { locations: data.locations.length, regions: data.regions.length }, urls: { locations: locationsUrl, regions: regionsUrl } }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Snapshot rebuild failed; the previous snapshot remains active.' }, { status: 503, headers: HEADERS })
  }
}
