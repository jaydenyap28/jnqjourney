import { NextResponse } from 'next/server'

import { PUBLIC_CACHE_CONTROL, PRIVATE_NO_STORE } from '@/lib/public-data'
import { dataSourceHeader, resolvePublicData } from '@/lib/server/public-data-resolver'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET() {
  try {
    const data = await resolvePublicData()
    return NextResponse.json(
      { regions: data.regions },
      { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL, 'X-JNQ-Data-Source': dataSourceHeader(data.source) } }
    )
  } catch {
    return NextResponse.json(
      { error: { code: 'PUBLIC_DATA_UNAVAILABLE', message: 'Public region data is temporarily unavailable.' } },
      { status: 503, headers: { 'Cache-Control': PRIVATE_NO_STORE } }
    )
  }
}
