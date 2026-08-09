import { NextResponse } from 'next/server'
import { readPublicGuideBySlug, readPublicGuides } from '@/lib/server/public-content-store'
import { PUBLIC_CACHE_CONTROL, PRIVATE_NO_STORE } from '@/lib/public-data'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { resolveGuidePublicMedia } from '@/lib/server/public-content-media'

export const runtime = 'nodejs'
export const revalidate = 600

export async function GET(request: Request) {
  const slug = String(new URL(request.url).searchParams.get('slug') || '').trim()
  const { locations } = await resolvePublicData()
  if (slug) {
    const guide = await readPublicGuideBySlug(slug)
    if (!guide) return NextResponse.json({ error: 'Guide not found.' }, { status: 404, headers: { 'Cache-Control': PRIVATE_NO_STORE } })
    return NextResponse.json({ guide: resolveGuidePublicMedia(guide, locations) }, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
  }
  const guides = (await readPublicGuides()).map((storedGuide) => {
    const guide = resolveGuidePublicMedia(storedGuide, locations)
    return ({
    slug: guide.slug,
    shortTitle: guide.shortTitle,
    title: guide.title,
    tagline: guide.tagline,
    summary: guide.summary,
    duration: guide.duration,
    budget: guide.budget,
    budgetScope: guide.budgetScope,
    travelStyle: guide.travelStyle,
    coverImage: guide.coverImage,
    route: guide.route.map((stop) => ({ name: stop.name })),
    })
  })
  return NextResponse.json(
    { guides },
    {
      headers: {
        'Cache-Control': PUBLIC_CACHE_CONTROL,
      },
    }
  )
}
