import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ArrowRight, ExternalLink, MapPinned } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import FallbackImage from '@/components/FallbackImage'
import GuideRouteMap from '@/components/GuideRouteMap'
import AffiliateCard from '@/components/AffiliateCard'
import { readGuideBySlug } from '@/lib/server/guides-store'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: {
    slug: string
  }
}

interface LinkedSpot {
  id: number
  name: string
  name_cn?: string | null
  category?: string | null
  latitude?: number | null
  longitude?: number | null
  visit_date?: string | null
  image_url?: string | null
  images?: string[] | null
  region_id?: number | null
  regions?: {
    id?: number
    name?: string | null
    name_cn?: string | null
    country?: string | null
  } | null
}

interface GuideAffiliateLink {
  id: number
  title?: string | null
  provider?: string | null
  link_type?: string | null
  location_id?: number | null
  region_id?: number | null
  is_active?: boolean | null
}

function getYouTubeID(url: string) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null
    }
    if (parsed.pathname.includes('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null
    }
    if (parsed.pathname.includes('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('/')[0] || null
    }
    return parsed.searchParams.get('v')
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const guide = await readGuideBySlug(params.slug)

  if (!guide) {
    return {
      title: '\u653b\u7565\u4e0d\u5b58\u5728 | JnQ Journey',
    }
  }

  const routeText = guide.route.map((item) => item.name).filter(Boolean).slice(0, 3).join(' / ')
  const seoTitle = routeText ? `${guide.title} | ${routeText} Travel Guide | JnQ Journey` : `${guide.title} | JnQ Journey`
  const seoDescription = guide.summary || guide.tagline || guide.title

  return {
    title: seoTitle,
    description: seoDescription,
    alternates: {
      canonical: `/guide/${guide.slug}`,
    },
    openGraph: {
      type: 'article',
      title: guide.title,
      description: seoDescription,
      url: absoluteUrl(`/guide/${guide.slug}`),
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.title,
      description: seoDescription,
    },
  }
}

async function fetchGuideSpots(names: string[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey || !names.length) return []

  const wanted = new Set(names.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))
  if (!wanted.size) return []

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  const allRows: LinkedSpot[] = []
  const pageSize = 500
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('locations')
      .select(`
        id,
        name,
        name_cn,
        category,
        latitude,
        longitude,
        visit_date,
        image_url,
        images,
        region_id,
        regions:region_id (
          id,
          name,
          name_cn,
          country
        )
      `)
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) return []

    const batch = Array.isArray(data) ? (data as LinkedSpot[]) : []
    allRows.push(...batch)

    if (batch.length < pageSize) break
    from += pageSize
  }

  return allRows
}

async function fetchGuideRegionSpots(regionIds: number[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey || !regionIds.length) return []

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      name_cn,
      category,
      latitude,
      longitude,
      visit_date,
      image_url,
      images,
      region_id,
      regions:region_id (
        id,
        name,
        name_cn,
        country
      )
    `)
    .in('region_id', regionIds)
    .order('visit_date', { ascending: true })
    .order('id', { ascending: true })

  if (error || !data) return []
  return data as LinkedSpot[]
}

function resolveSpotByName(name: string, allSpots: LinkedSpot[], spotMap: Map<string, LinkedSpot>) {
  const exact = spotMap.get(String(name || '').trim().toLowerCase())
  if (exact) return exact

  const normalized = normalizeText(name)
  if (!normalized) return null

  for (const spot of allSpots) {
    if (normalizeText(spot.name) === normalized || normalizeText(spot.name_cn) === normalized) return spot
  }

  for (const spot of allSpots) {
    const normalizedName = normalizeText(spot.name)
    const normalizedNameCn = normalizeText(spot.name_cn)
    if ((normalizedName && normalizedName.includes(normalized)) || (normalizedNameCn && normalizedNameCn.includes(normalized))) {
      return spot
    }
  }

  return null
}

async function fetchGuideAffiliateLinks(linkIds: number[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey || !linkIds.length) return []

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase
    .from('affiliate_links')
    .select('id, title, provider, link_type, location_id, region_id, is_active')
    .in('id', linkIds)
    .eq('is_active', true)

  if (error || !data) return []

  const order = new Map(linkIds.map((id, index) => [id, index]))
  return (data as GuideAffiliateLink[]).sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999))
}

function getSpotCover(spot: LinkedSpot) {
  return spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function parseDayRange(dayLabel?: string | null) {
  const text = String(dayLabel || '')
  const range = text.match(/day\s*(\d+)\s*[-~to]+\s*(\d+)/i)
  if (range) {
    return { start: Number(range[1]), end: Number(range[2]) }
  }
  const single = text.match(/day\s*(\d+)/i)
  if (single) {
    const day = Number(single[1])
    return { start: day, end: day }
  }
  return null
}

function parseGuideDayNumber(dayLabel?: string | null) {
  const match = String(dayLabel || '').match(/day\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

function formatVisitDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function spotTypeLabel(category?: string | null) {
  if (category === 'food') return '\u7f8e\u98df'
  if (category === 'accommodation') return '\u4f4f\u5bbf'
  return '\u666f\u70b9'
}

function getPrimaryRegionId(spots: LinkedSpot[]) {
  return spots.find((spot) => typeof spot.region_id === 'number')?.region_id ?? null
}

function resolveStaySource(
  days: Array<{ dayLabel?: string | null; stay?: string; stayRangeStart?: number; stayRangeEnd?: number }>,
  dayNumber: number
) {
  const currentDay = days.find((day) => {
    const range = parseDayRange(day.dayLabel)
    const labelDay = range?.start ?? null
    return labelDay === dayNumber
  })

  if (currentDay && 'stay' in currentDay && !String(currentDay.stay || '').trim()) {
    return null
  }

  return (
    days.find((day) => {
      if (!day.stay) return false
      const dayRange = parseDayRange(day.dayLabel)
      const start = Number(day.stayRangeStart ?? dayRange?.start ?? dayNumber)
      const end = Number(day.stayRangeEnd ?? dayRange?.end ?? start)
      return dayNumber >= start && dayNumber <= end
    }) || null
  )
}

function shouldShowDaySummary(summary?: string | null) {
  const text = String(summary || '').trim()
  if (!text) return false
  return (
    !text.includes('\u5df2\u8bb0\u5f55\u7684\u6253\u5361\u65e5\u671f') &&
    !text.includes('\u8ddf\u7740\u8fd9\u4e00\u5929\u7684\u771f\u5b9e\u6253\u5361\u987a\u5e8f\u5f80\u4e0b\u770b') &&
    !text.includes('\u81ea\u52a8\u6574\u7406') &&
    !text.includes('\u6751\u4e00\u5929')
  )
}

function resolveStaySpotByName(stayName: string, allSpots: LinkedSpot[]) {
  const normalized = normalizeText(stayName)
  if (!normalized) return null
  for (const spot of allSpots) {
    const name = normalizeText(spot.name)
    const nameCn = normalizeText(spot.name_cn)
    if (name === normalized || nameCn === normalized) return spot
  }
  for (const spot of allSpots) {
    const name = normalizeText(spot.name)
    const nameCn = normalizeText(spot.name_cn)
    if ((name && name.includes(normalized)) || (nameCn && nameCn.includes(normalized))) return spot
    if ((normalized && normalized.includes(name)) || (normalized && normalized.includes(nameCn))) return spot
  }
  return null
}

function resolveMatchingRegionSpot(stopName: string, spots: LinkedSpot[]) {
  const normalizedStop = normalizeText(stopName)
  if (!normalizedStop) return null

  return (
    spots.find((spot) => {
      const regionName = normalizeText(spot.regions?.name)
      const regionCn = normalizeText(spot.regions?.name_cn)

      return (
        regionName === normalizedStop ||
        regionCn === normalizedStop ||
        (regionName && (regionName.includes(normalizedStop) || normalizedStop.includes(regionName))) ||
        (regionCn && (regionCn.includes(normalizedStop) || normalizedStop.includes(regionCn)))
      )
    }) || null
  )
}

export default async function GuideDetailPage({ params }: PageProps) {
  const guide = await readGuideBySlug(params.slug)

  if (!guide) {
    notFound()
  }

  if (params.slug !== guide.slug) {
    redirect(`/guide/${guide.slug}`)
  }

  const allLinkedNames = Array.from(
    new Set([
      ...(guide.featuredSpotNames || []),
      ...guide.days.flatMap((day) => day.linkedSpots || []),
      ...guide.days.flatMap((day) => (day.stay ? [day.stay] : [])),
      ...guide.route.flatMap((stop) => (stop.mapSpotName ? [stop.mapSpotName] : [])),
    ])
  )

  const linkedSpots = await fetchGuideSpots(allLinkedNames)
  const preliminarySpotMap = new Map(
    linkedSpots.flatMap((spot) => {
      const entries: Array<[string, LinkedSpot]> = []
      if (spot.name) entries.push([spot.name.trim().toLowerCase(), spot])
      if (spot.name_cn) entries.push([spot.name_cn.trim().toLowerCase(), spot])
      return entries
    })
  )

  const routeRegions = guide.route.map((stop) => {
    const mappedSpotName = String(stop.mapSpotName || '').trim().toLowerCase()
    const mappedSpot = mappedSpotName ? preliminarySpotMap.get(mappedSpotName) : null
    const matchingSpot = resolveMatchingRegionSpot(stop.name, linkedSpots)

    const regionName = String(matchingSpot?.regions?.name || '').trim()
    const regionCn = String(matchingSpot?.regions?.name_cn || '').trim()
    const stopName = String(stop.name || '').trim()
    const primaryLabel = regionCn || stopName
    const normalizedPrimary = normalizeText(primaryLabel)
    const routeSecondaryLabel = regionName && normalizeText(regionName) !== normalizedPrimary ? regionName : ''

    return {
      ...stop,
      stopLabel: stop.stopLabel || undefined,
      regionId: matchingSpot?.regions?.id ?? null,
      latitude:
        typeof stop.latitude === 'number'
          ? stop.latitude
          : typeof mappedSpot?.latitude === 'number'
            ? mappedSpot.latitude
            : matchingSpot?.latitude ?? null,
      longitude:
        typeof stop.longitude === 'number'
          ? stop.longitude
          : typeof mappedSpot?.longitude === 'number'
            ? mappedSpot.longitude
            : matchingSpot?.longitude ?? null,
      markerLabel: primaryLabel,
      primaryLabel,
      regionLabel: routeSecondaryLabel || primaryLabel,
      secondaryLabel: routeSecondaryLabel,
      href:
        matchingSpot?.regions?.id && matchingSpot.regions?.name
          ? buildRegionPath(matchingSpot.regions.name, matchingSpot.regions.id)
          : null,
    }
  })

  const supplementalRegionIds = Array.from(
    new Set(
      routeRegions
        .map((stop) => stop.regionId)
        .concat(linkedSpots.map((spot) => spot.region_id ?? null))
        .filter((value): value is number => typeof value === 'number')
    )
  )
  const regionSpots = await fetchGuideRegionSpots(supplementalRegionIds)
  const allGuideSpots = Array.from(
    new Map([...linkedSpots, ...regionSpots].map((spot) => [spot.id, spot])).values()
  )
  const spotMap = new Map(
    allGuideSpots.flatMap((spot) => {
      const entries: Array<[string, LinkedSpot]> = []
      if (spot.name) entries.push([spot.name.trim().toLowerCase(), spot])
      if (spot.name_cn) entries.push([spot.name_cn.trim().toLowerCase(), spot])
      return entries
    })
  )

  const affiliateRegions = routeRegions.filter(
    (stop, index, list) => stop.regionId && list.findIndex((item) => item.regionId === stop.regionId) === index
  )
  const selectedAffiliateLinks = await fetchGuideAffiliateLinks(guide.featuredAffiliateLinkIds || [])
  const selectedSidebarLinks = await fetchGuideAffiliateLinks(guide.sidebarAffiliateLinkIds || guide.featuredAffiliateLinkIds || [])
  const selectedSidebarAffiliateIds = selectedSidebarLinks.map((link) => link.id)

  const datedDayPlans = guide.days.map((day, index) => {
    const dayNumber = parseGuideDayNumber(day.dayLabel) || index + 1
    const staySource = resolveStaySource(guide.days, dayNumber)
    const stayRawName = String(staySource?.stay || day.stay || '').trim()
    const stayName = stayRawName.toLowerCase()

    const linkedOrder = new Map(
      (day.linkedSpots || []).map((name, orderIndex) => [String(name || '').trim().toLowerCase(), orderIndex])
    )

    const orderedSpots = (day.linkedSpots || [])
      .map((name) => resolveSpotByName(String(name || ''), allGuideSpots, spotMap))
      .filter((spot): spot is LinkedSpot => Boolean(spot))

    const matchedSpotKeys = new Set(
      orderedSpots.flatMap((spot) =>
        [spot.name, spot.name_cn].map((value) => normalizeText(value)).filter(Boolean)
      )
    )

    const unresolvedSpotNames = (day.linkedSpots || []).filter((name) => {
      const normalized = normalizeText(name)
      return normalized && !matchedSpotKeys.has(normalized)
    })

    const formattedDate = orderedSpots.find((spot) => spot.visit_date)?.visit_date
      ? formatVisitDate(String(orderedSpots.find((spot) => spot.visit_date)?.visit_date))
      : ''

    return {
      date: orderedSpots.find((spot) => spot.visit_date)?.visit_date || '',
      formattedDate,
      dayNumber,
      title: day.title || `${orderedSpots[0]?.regions?.name_cn || orderedSpots[0]?.regions?.name || '旅行日'} 行程`,
      summary: day.summary || '',
      videoUrl: day.videoUrl,
      transport: day.transport,
      transportPrice: day.transportPrice,
      stay: staySource?.stay || day.stay,
      stayNote: day.stayNote || '',
      highlights: day.highlights || [],
      spots: orderedSpots,
      unresolvedSpotNames,
      staySpot:
        (stayName ? spotMap.get(stayName) || null : null) ||
        resolveStaySpotByName(stayRawName, allGuideSpots) ||
        orderedSpots.find((spot) => {
          if (!stayName) return false
          return (
            String(spot.name || '').trim().toLowerCase() === stayName ||
            String(spot.name_cn || '').trim().toLowerCase() === stayName
          )
        }) ||
        null,
      orderedSpotIds: orderedSpots.map((spot) => spot.id),
      displaySpots: orderedSpots.filter((spot) => spot.category !== 'accommodation'),
      primaryRegionId: getPrimaryRegionId(orderedSpots),
    }
  })

  const routeMapPoints = routeRegions.flatMap((stop, index) => {
    const latitude = typeof stop.latitude === 'number' ? Number(stop.latitude) : null
    const longitude = typeof stop.longitude === 'number' ? Number(stop.longitude) : null

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return []
    }

    return [
      {
        id: index + 1,
        label: stop.primaryLabel || stop.name,
        stopLabel: stop.stopLabel || `D${index + 1}`,
        latitude: Number(latitude),
        longitude: Number(longitude),
        regionLabel: stop.secondaryLabel || undefined,
      },
    ]
  })

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.summary || guide.tagline || guide.title,
    author: {
      '@type': 'Organization',
      name: 'Jayden & Qing \u4e00\u8d77\u770b\u4e16\u754c',
    },
    mainEntityOfPage: absoluteUrl(`/guide/${guide.slug}`),
    inLanguage: ['zh-CN', 'en'],
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_18%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_20%),linear-gradient(180deg,#0b1220_0%,#050913_55%,#020308_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-12">
          <div
            className={`overflow-hidden rounded-[34px] border border-white/10 p-4 shadow-[0_36px_120px_rgba(0,0,0,0.32)] md:rounded-[42px] md:p-10 ${guide.coverAccent}`}
            style={
              guide.coverImage
                ? {
                    backgroundImage: `linear-gradient(120deg,rgba(2,6,23,0.88),rgba(2,6,23,0.6) 45%,rgba(2,6,23,0.34)), url(${guide.coverImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <div className="relative z-10 space-y-4 md:space-y-6">
                <div className="space-y-4">
                  <p className="section-kicker text-xs text-amber-100/80">{'Travel Guide / \u6e38\u8bb0'}</p>
                  <h1 className="font-display max-w-4xl text-[2.35rem] leading-[0.96] text-white md:text-[5.4rem]">
                    {guide.title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-white/82 md:text-xl md:leading-9">{guide.tagline}</p>
                  <p className="max-w-3xl text-sm leading-7 text-white/66 md:text-base md:leading-8">{guide.summary}</p>
                </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-7 md:px-8 md:py-14">
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="space-y-8 md:space-y-12">
            {routeMapPoints.length ? (
              <section className="space-y-5">
                <div>
                  <p className="section-kicker text-xs text-amber-300/80">{'Route Map / \u8def\u7ebf\u5730\u56fe'}</p>
                  <h2 className="font-display mt-2 text-4xl leading-tight text-white md:text-[2.8rem]">{'\u8def\u7ebf\u5730\u56fe'}</h2>
                </div>
                <div className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.24)]">
                  <GuideRouteMap
                    points={routeMapPoints}
                    theme="dark"
                    showCards={false}
                    className="space-y-4"
                    emptyMessage={'\u8fd9\u7bc7\u653b\u7565\u76ee\u524d\u8fd8\u6ca1\u6709\u8db3\u591f\u7684\u5750\u6807\u8d44\u6599\u6765\u7ed8\u5236\u8def\u7ebf\u5730\u56fe\u3002'}
                  />
                </div>
              </section>
            ) : null}

            <section className="space-y-5">
              <div>
                <p className="section-kicker text-xs text-amber-300/80">{'Budget / \u9884\u7b97'}</p>
                <h2 className="font-display mt-2 text-4xl leading-tight text-white md:text-[2.6rem]">{'\u9884\u7b97\u62c6\u89e3'}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {guide.budget ? (
                  <div className="rounded-[20px] border border-amber-300/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-3.5 md:rounded-[26px] md:p-5">
                    <p className="text-sm text-amber-100/70">Budget / 总预算</p>
                    <p className="mt-2 text-3xl font-semibold text-white md:text-[2.1rem]">{guide.budget}</p>
                  </div>
                ) : null}
                {guide.budgetItems.map((item, index) => (
                  <div
                    key={`${item.label || 'budget-item'}-${item.amount}-${index}`}
                    className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-3.5 md:rounded-[26px] md:p-5"
                  >
                    <p className="text-sm text-white/58">{item.label || 'Budget Item / 预算项'}</p>
                    <p className="mt-2 text-2xl font-semibold text-white md:text-[1.9rem]">
                      {[item.currency, item.amount].filter(Boolean).join(' ')}
                    </p>
                    {item.note ? <p className="mt-3 text-sm leading-6 text-gray-300">{item.note}</p> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-5">
                <div>
                  <p className="section-kicker text-xs text-amber-300/80">{'Daily Plan / \u6bcf\u65e5\u5b89\u6392'}</p>
                  <h2 className="font-display mt-2 text-4xl leading-tight text-white md:text-[2.8rem]">{'\u6bcf\u65e5\u5b89\u6392'}</h2>
                </div>

              <div className="space-y-4">
                {(datedDayPlans.length ? datedDayPlans : []).map((day) => (
                  <div
                    key={`${day.date}-${day.dayNumber}`}
                    className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] shadow-[0_24px_70px_rgba(0,0,0,0.18)] md:rounded-[32px]"
                  >
                    <div className="grid grid-cols-[74px_minmax(0,1fr)] gap-0 lg:grid-cols-[190px_minmax(0,1fr)]">
                      <div className="border-r border-white/10 bg-black/20 px-3 py-3 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
                        <p className="section-kicker text-xs text-amber-300/80">{`Day ${day.dayNumber}`}</p>
                        <p className="mt-2 text-2xl font-semibold text-white md:mt-4 md:text-3xl">{String(day.dayNumber).padStart(2, '0')}</p>
                        <p className="mt-2 text-[11px] leading-4 text-white/60 md:mt-3 md:text-sm">{day.formattedDate || '\u65c5\u884c\u65e5'}</p>
                      </div>
                      <div className="px-4 py-4 md:px-6 md:py-7">
                        <h3 className="text-[1.25rem] font-semibold leading-tight text-white md:text-[1.8rem]">{day.title}</h3>
                        {shouldShowDaySummary(day.summary) ? <p className="mt-3 text-sm leading-7 text-gray-300">{day.summary}</p> : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {day.highlights.map((highlight) => (
                            <span key={highlight} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/90">
                              {highlight}
                            </span>
                          ))}
                        </div>

                        {day.displaySpots.length || day.unresolvedSpotNames.length ? (
                          <div className="mt-4 rounded-[22px] border border-amber-400/15 bg-black/20 p-3 md:mt-6 md:rounded-[26px] md:p-5">
                            <div className="flex items-end justify-between gap-4">
                              <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-amber-200/75">{'\u5f53\u5929\u76f8\u5173\u5730\u70b9'}</p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                                {day.displaySpots.length + day.unresolvedSpotNames.length} {'\u4e2a\u5730\u70b9'}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                              {day.displaySpots.map((spot) => {
                                const orderIndex = day.orderedSpotIds.indexOf(spot.id)

                                return (
                                  <Link
                                    key={spot.id}
                                    href={buildLocationPath(spot.name, spot.id)}
                                    className="group overflow-hidden rounded-[16px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10 md:rounded-[24px]"
                                  >
                                    <div className="relative aspect-square overflow-hidden bg-black/20 md:aspect-[16/10]">
                                      <FallbackImage
                                        src={getSpotCover(spot)}
                                        alt={spot.name}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 320px"
                                        className="object-cover transition duration-500 group-hover:scale-105"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                                      <div className="absolute left-3 top-3 flex items-center gap-2">
                                        <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-white/90">
                                          {spotTypeLabel(spot.category)}
                                        </span>
                                        {orderIndex >= 0 ? (
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-[11px] font-semibold text-slate-950">
                                            {orderIndex + 1}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="space-y-1 p-2.5 md:space-y-2 md:p-4">
                                      <div className="line-clamp-2 text-sm font-medium leading-5 text-white md:text-base md:leading-6">{spot.name_cn || spot.name}</div>
                                      <div className="text-xs text-white/55">
                                        {spot.regions?.name_cn || spot.regions?.name || 'Yunnan'}
                                      </div>
                                    </div>
                                  </Link>
                                )
                              })}
                              {day.unresolvedSpotNames.map((spotName) => (
                                <div
                                  key={`pending-${day.dayNumber}-${spotName}`}
                                  className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4"
                                >
                                  <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/80 inline-flex">
                                    {'已关联景点'}
                                  </div>
                                  <div className="mt-4 font-medium text-white">{spotName}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          {day.transport ? (
                            <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 md:min-h-[220px] md:rounded-[24px] md:p-5">
                              <p className="text-xs uppercase tracking-[0.22em] text-white/45">{'\u4ea4\u901a'}</p>
                              <p className="mt-3 text-sm leading-7 text-white">{day.transport}</p>
                              {day.transportPrice ? <p className="mt-3 text-sm font-medium text-amber-200">{day.transportPrice}</p> : null}
                            </div>
                          ) : null}
                        </div>

                        {day.staySpot || day.stay ? (
                          <div className="mt-3 rounded-[20px] border border-sky-400/15 bg-sky-500/10 p-3 md:mt-5 md:rounded-[26px] md:p-5">
                            <div className="flex items-end justify-between gap-4">
                              <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">{'\u5f53\u65e5\u4f4f\u5bbf'}</p>
                              </div>
                            </div>
                            {day.staySpot ? (
                              <Link
                                href={buildLocationPath(day.staySpot.name, day.staySpot.id)}
                                className="group mt-3 grid overflow-hidden rounded-[18px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10 md:mt-4 md:rounded-[24px] md:grid-cols-[120px_minmax(0,1fr)]"
                              >
                                <div className="relative min-h-[84px] overflow-hidden bg-black/20 md:min-h-[108px]">
                                  <FallbackImage
                                    src={getSpotCover(day.staySpot)}
                                    alt={day.staySpot.name}
                                    fill
                                    sizes="(max-width: 768px) 100vw, 220px"
                                    className="object-cover transition duration-500 group-hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                                  <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-white/90">
                                    {'\u4f4f\u5bbf'}
                                  </div>
                                </div>
                                <div className="flex min-w-0 flex-col justify-center space-y-1 p-3 md:space-y-2 md:p-4">
                                  <div className="font-medium text-white">{day.staySpot.name_cn || day.staySpot.name}</div>
                                  <div className="text-xs text-white/55">
                                    {day.staySpot.regions?.name_cn || day.staySpot.regions?.name || 'Yunnan'}
                                  </div>
                                </div>
                              </Link>
                            ) : null}
                            {day.stayNote ? (
                              <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 text-white/82 md:mt-4 md:px-4 md:py-3 md:leading-7">
                                {day.stayNote}
                              </div>
                            ) : null}
                            {day.stay && !day.staySpot ? (
                              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-white/82 md:mt-4 md:p-4 md:leading-7">
                                {day.stay}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {day.staySpot ? (
                          <div className="mt-4">
                            <AffiliateCard
                              locationId={day.staySpot.id}
                              regionId={day.staySpot.region_id || undefined}
                              category="accommodation"
                              limit={1}
                              title={'\u70b9\u51fb\u8fd9\u91cc\u9884\u8ba2'}
                              className="bg-white/5"
                              compact
                              hideHeader
                            />
                          </div>

                        ) : null}


                        {day.videoUrl && getYouTubeID(day.videoUrl) ? (
                          <div className="mt-5 rounded-[26px] border border-red-400/15 bg-red-500/10 p-4 md:p-5">
                            <p className="text-xs uppercase tracking-[0.24em] text-red-200/80">{'\u5f53\u65e5\u5f71\u7247'}</p>
                            <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/30">
                              <div className="aspect-video">
                                <iframe
                                  src={`https://www.youtube.com/embed/${getYouTubeID(day.videoUrl)}?rel=0`}
                                  title={`${day.title} YouTube video`}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                  className="h-full w-full"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {day.transport && day.primaryRegionId ? (
                          <div className="mt-5">
                            <AffiliateCard
                              regionId={day.primaryRegionId}
                              limit={2}
                              title={'\u4ea4\u901a\u4e0e\u9884\u8ba2\u63a8\u8350'}
                              className="bg-white/5"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {!datedDayPlans.length
                  ? guide.days.map((day) => {
                      const daySpots = (day.linkedSpots || [])
                        .map((name) => spotMap.get(name.trim().toLowerCase()))
                        .filter((spot): spot is LinkedSpot => Boolean(spot))

                      return (
                        <div key={day.dayLabel} className="rounded-[30px] border border-white/10 bg-white/5 p-6">
                          <div className="grid gap-5 lg:grid-cols-[120px_minmax(0,1fr)]">
                            <div>
                              <p className="section-kicker text-xs text-amber-300/80">{day.dayLabel}</p>
                            </div>
                            <div>
                              <h3 className="text-2xl font-semibold text-white">{day.title}</h3>
                              {shouldShowDaySummary(day.summary) ? <p className="mt-3 text-sm leading-7 text-gray-300">{day.summary}</p> : null}
                              <div className="mt-4 flex flex-wrap gap-2">
                                {day.highlights.map((highlight) => (
                                  <span key={highlight} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/90">
                                    {highlight}
                                  </span>
                                ))}
                              </div>
                              {daySpots.length ? (
                                <div className="mt-5 rounded-[24px] border border-amber-400/15 bg-black/20 p-4">
                                  <p className="text-xs uppercase tracking-[0.24em] text-amber-200/75">{'\u76f8\u5173\u666f\u70b9'}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {daySpots.map((spot) => (
                                      <Link
                                        key={spot.id}
                                        href={buildLocationPath(spot.name, spot.id)}
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                                      >
                                        {spot.name_cn || spot.name}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  : null}
              </div>
            </section>


          </div>

          <aside className="space-y-5 xl:sticky xl:top-24">
            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5">
              <p className="section-kicker text-xs text-amber-300/80">{'Route / \u8def\u7ebf'}</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">{'\u8def\u7ebf\u603b\u89c8'}</h3>
              <div className="mt-4 space-y-3">
                {routeRegions.map((stop, index) => {
                  const content = (
                    <>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white">
                          {stop.stopLabel || index + 1}
                        </div>
                      <div className="flex-1 rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
                        <div className="font-medium text-white">{stop.primaryLabel || stop.name}</div>
                        {stop.secondaryLabel ? (
                          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/45">{stop.secondaryLabel}</div>
                        ) : null}
                      </div>
                    </>
                  )

                  return stop.href ? (
                    <Link key={stop.name} href={stop.href} className="flex items-center gap-3 transition hover:translate-x-1">
                      {content}
                    </Link>
                  ) : (
                    <div key={stop.name} className="flex items-center gap-3">
                      {content}
                    </div>
                  )
                })}
              </div>
            </div>

            {selectedSidebarAffiliateIds.length ? (
              <AffiliateCard
                linkIds={selectedSidebarAffiliateIds}
                limit={Math.max(selectedSidebarAffiliateIds.length, 1)}
                title={'\u8def\u7ebf\u9884\u8ba2\u7cbe\u9009'}
                className="bg-white/5"
                hideHeader
              />
            ) : null}
            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5">
              <p className="section-kicker text-xs text-amber-300/80">{'Next Step / \u7ee7\u7eed\u63a2\u7d22'}</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">{'\u7ee7\u7eed\u63a2\u7d22'}</h3>
              <div className="mt-4 space-y-3">
                <Link href="/guide" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white transition hover:bg-white/10">
                  {'\u67e5\u770b\u66f4\u591a\u653b\u7565'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/region" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white transition hover:bg-white/10">
                  {'\u6309\u5730\u533a\u7ee7\u7eed\u627e\u666f\u70b9'}
                  <MapPinned className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}









