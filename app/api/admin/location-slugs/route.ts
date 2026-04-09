import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { readLocationSlugForId, saveLocationSlugForId } from '@/lib/server/location-slugs-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const id = Number(searchParams.get('id'))

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Missing valid location id.' }, { status: 400 })
  }

  const slug = await readLocationSlugForId(id)
  return NextResponse.json({ slug })
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const id = Number(body?.id)
    const slug = String(body?.slug || '').trim()

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Missing valid location id.' }, { status: 400 })
    }

    const savedSlug = await saveLocationSlugForId(id, slug)
    return NextResponse.json({ slug: savedSlug })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save location slug.' }, { status: 500 })
  }
}
