import { NextResponse } from 'next/server'

import { PRIVATE_NO_STORE } from '@/lib/public-data'
import { dataSourceHeader, resolvePublicData } from '@/lib/server/public-data-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const data = await resolvePublicData()
    return NextResponse.json(
      { locations: data.locations, regions: data.regions },
      { headers: { 'Cache-Control': PRIVATE_NO_STORE, 'X-JNQ-Data-Source': dataSourceHeader(data.source) } }
    )
  } catch {
    return NextResponse.json(
      { error: { code: 'PUBLIC_DATA_UNAVAILABLE', message: 'Public travel data is temporarily unavailable.' } },
      { status: 503, headers: { 'Cache-Control': PRIVATE_NO_STORE } }
    )
  }
}
