import { NextResponse } from 'next/server'
import { readGuideBySlug, readGuides } from '@/lib/server/guides-store'
import { PUBLIC_CACHE_CONTROL, PRIVATE_NO_STORE } from '@/lib/public-data'

export const runtime = 'nodejs'
export const revalidate = 600

export async function GET(request: Request) {
  const slug = String(new URL(request.url).searchParams.get('slug') || '').trim()
  if (slug) {
    const guide = await readGuideBySlug(slug)
    if (!guide) return NextResponse.json({ error: 'Guide not found.' }, { status: 404, headers: { 'Cache-Control': PRIVATE_NO_STORE } })
    return NextResponse.json({ guide }, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
  }
  const guides = (await readGuides()).map((guide) => ({
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
  }))
  return NextResponse.json(
    { guides },
    {
      headers: {
        'Cache-Control': PUBLIC_CACHE_CONTROL,
      },
    }
  )
}
