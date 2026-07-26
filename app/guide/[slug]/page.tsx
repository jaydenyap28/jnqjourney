import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ArrowRight, BedDouble, CalendarDays, ExternalLink, Film, MapPin, MapPinned, Navigation, Wallet } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import FallbackImage from '@/components/FallbackImage'
import GuideRouteMap from '@/components/GuideRouteMap'
import GuideQuickNav from '@/components/GuideQuickNav'
import GuideVideoCard from '@/components/GuideVideoCard'
import GuideGallery from '@/components/GuideGallery'
import AffiliateCard from '@/components/AffiliateCard'
import KlookWidgetEmbed from '@/components/KlookWidgetEmbed'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import AuthorTrustBlock from '@/components/AuthorTrustBlock'
import TravelPackageCard from '@/components/TravelPackageCard'
import { readGuideBySlug, readGuides } from '@/lib/server/guides-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'
import { absoluteUrl } from '@/lib/site'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'

// Linked spot cards must reflect a cover change immediately after it is saved.
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

import { buildPageTitle, buildMetaDescription, buildCanonicalUrl, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const guide = await readGuideBySlug(params.slug)

  if (!guide) {
    return {
      title: buildPageTitle('Guide not found'),
    }
  }

  const daysText = guide.duration ? `${guide.duration}` : ''
  const hasBudgetOrStay = guide.budget || guide.days.some(d => d.stay)
  const baseTitle = `${guide.title}${daysText ? ` (${daysText})` : ''} Travel Guide`

  const description = buildMetaDescription(
    guide.summary || guide.tagline || guide.title, 
    `Plan ${guide.title} with a day-by-day route, linked spots, transport notes${hasBudgetOrStay ? ', stays, budget references' : ''}, photos, and practical travel details from JnQ Journey.`
  )
  const canonicalUrl = buildCanonicalUrl(`/guide/${guide.slug}`)

  return {
    title: baseTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: buildOpenGraphData(baseTitle, description, `/guide/${guide.slug}`, guide.coverImage, 'article'),
    twitter: buildTwitterCardData(baseTitle, description, guide.coverImage),
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

function formatGuideMoney(value?: string | null, fallbackCurrency = 'RM') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^(rm|cny|jpy|thb|idr|usd|rmb|¥|￥|\$)/i.test(text)) return text
  return `${fallbackCurrency} ${text}`
}

function parseGuideMoney(value?: string | null) {
  const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function splitGuideParagraphs(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return []

  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g)?.map((part) => part.trim()).filter(Boolean) || [text]
  const paragraphs: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (!current || current.length + sentence.length <= 190) {
      current += sentence
      continue
    }
    paragraphs.push(current)
    current = sentence
  }

  if (current) paragraphs.push(current)
  return paragraphs
}

function routeStartDay(stopLabel?: string | null, fallback = 1) {
  const match = String(stopLabel || '').match(/\d+/)
  return match ? Number(match[0]) : fallback
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

  const accommodationSpots = allSpots.filter((spot) => String(spot.category || '').toLowerCase() === 'accommodation')

  for (const spot of accommodationSpots) {
    const name = normalizeText(spot.name)
    const nameCn = normalizeText(spot.name_cn)
    if (name === normalized || nameCn === normalized) return spot
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
  const guideCoverImage =
    guide.coverImage ||
    linkedSpots.map((spot) => spot.image_url || spot.images?.[0]).find(Boolean) ||
    regionSpots.map((spot) => spot.image_url || spot.images?.[0]).find(Boolean) ||
    ''
  const spotMap = new Map(
    allGuideSpots.flatMap((spot) => {
      const entries: Array<[string, LinkedSpot]> = []
      if (spot.name) entries.push([spot.name.trim().toLowerCase(), spot])
      if (spot.name_cn) entries.push([spot.name_cn.trim().toLowerCase(), spot])
      return entries
    })
  )

  const selectedSidebarLinks = await fetchGuideAffiliateLinks(guide.sidebarAffiliateLinkIds || guide.featuredAffiliateLinkIds || [])
  const selectedSidebarAffiliateIds = selectedSidebarLinks.map((link) => link.id)
  const guideKlookWidgetCode = String(guide.klookWidgetCode || '').trim()
  const relatedPackages = (await readPublishedPackages()).filter((item) => item.related_guide_slugs?.includes(guide.slug))


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

    const persistedDate = String(day.date || orderedSpots.find((spot) => spot.visit_date)?.visit_date || '').trim()
    const formattedDate = persistedDate
      ? formatVisitDate(persistedDate)
      : ''

    return {
      date: persistedDate,
      formattedDate,
      dayNumber,
      title: day.title || `${orderedSpots[0]?.regions?.name_cn || orderedSpots[0]?.regions?.name || '旅行日'} 行程`,
      summary: day.summary || '',
      videoUrl: day.videoUrl,
      transport: day.transport,
      transportPrice: day.transportPrice,
      stay: staySource?.stay || day.stay,
      stayStartDay: Number(
        staySource?.stayRangeStart ??
          parseDayRange(staySource?.dayLabel)?.start ??
          dayNumber
      ),
      stayNote: day.stayNote || '',
      gallery: day.gallery || [],
      reminder: day.reminder || '',
      highlights: day.highlights || [],
      spots: orderedSpots,
      unresolvedSpotNames,
      staySpot:
        (stayName ? spotMap.get(stayName) || null : null) ||
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
        dayNumber: routeStartDay(stop.stopLabel, index + 1),
      },
    ]
  })

  const allGuides = await readGuides()
  const relatedGuides = allGuides
    .filter(g => g.slug !== guide.slug)
    .slice(0, 3)

  const budgetItemsTotal = guide.budgetItems.reduce((total, item) => total + parseGuideMoney(item.amount), 0)
  const declaredBudgetTotal = parseGuideMoney(guide.budget)
  if (process.env.NODE_ENV !== 'production' && declaredBudgetTotal && budgetItemsTotal !== declaredBudgetTotal) {
    console.warn(
      `[guide:${guide.slug}] Budget mismatch: declared ${declaredBudgetTotal}, item total ${budgetItemsTotal}.`
    )
  }

  const itemListElement = routeRegions.map((stop, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: stop.primaryLabel || stop.name,
    url: stop.href ? absoluteUrl(stop.href) : undefined
  }))

  const structuredData: any = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.summary || guide.tagline || guide.title,
    image: guideCoverImage || undefined,
    author: [
      {
        '@type': 'Person',
        name: 'Jayden Yap',
        url: absoluteUrl('/about#jayden'),
      },
      {
        '@type': 'Person',
        name: 'Connie Qing',
        url: absoluteUrl('/about#qing'),
      },
    ],
    publisher: {
      '@type': 'Organization',
      name: 'JnQ Journey',
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/icon.png')
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': absoluteUrl(`/guide/${guide.slug}`)
    },
    inLanguage: ['zh-CN', 'en'],
  }

  if (itemListElement.length > 0) {
    structuredData.hasPart = {
      '@type': 'ItemList',
      itemListElement
    }
  }

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: absoluteUrl('/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Guides',
        item: absoluteUrl('/guide'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: guide.title,
        item: absoluteUrl(`/guide/${guide.slug}`),
      },
    ],
  }

  const budgetDenominator = declaredBudgetTotal || budgetItemsTotal

  return (
    <main className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.10),transparent_20%),linear-gradient(180deg,#0a101b_0%,#050912_48%,#020409_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />

      <header className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">
          <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-2 overflow-hidden text-xs text-white/58 md:text-sm">
            <Link href="/" className="shrink-0 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Home</Link>
            <span aria-hidden="true">›</span>
            <Link href="/guide" className="shrink-0 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Travel Guides</Link>
            <span aria-hidden="true">›</span>
            <span className="truncate text-white/38">{guide.title}</span>
          </nav>

          <div className={`relative isolate overflow-hidden rounded-[24px] border border-white/12 ${guide.coverAccent} md:rounded-[32px]`}>
            {guideCoverImage ? (
              <FallbackImage
                src={guideCoverImage}
                alt={`${guide.title} 完整路线攻略封面`}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 1280px"
                className="object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(2,6,18,0.90)_0%,rgba(2,6,18,0.70)_52%,rgba(2,6,18,0.48)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.12),transparent_30%)]" />

            <div className="relative grid gap-7 px-5 py-7 md:px-9 md:py-10 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.85fr)] lg:items-end">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-100/82">Travel Guide / 游记</p>
                  {guide.duration ? <span className="rounded-full border border-white/16 bg-black/22 px-2.5 py-1 text-[10px] text-white/85">{guide.duration}</span> : null}
                  {guide.travelStyle ? <span className="rounded-full border border-white/16 bg-black/22 px-2.5 py-1 text-[10px] text-white/85">{guide.travelStyle}</span> : null}
                </div>
                <h1 className="mt-5 max-w-[15ch] text-balance font-display text-[clamp(2.35rem,6vw,5.25rem)] leading-[0.98] tracking-[-0.035em] text-white">
                  {guide.title}
                </h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/90 md:text-xl md:leading-8">
                  {[guide.duration, guide.travelStyle, '完整攻略'].filter(Boolean).join(' · ')}
                </p>
                {guide.tagline ? <p className="mt-3 max-w-3xl text-sm leading-7 text-white/74 md:text-base md:leading-8">{guide.tagline}</p> : null}
                {guide.summary ? <p className="mt-2 max-w-3xl text-sm leading-7 text-white/64">{guide.summary}</p> : null}

                <dl className="mt-6 grid max-w-2xl grid-cols-3 divide-x divide-white/12 border-y border-white/12 bg-black/15 py-3">
                  <div className="px-3 first:pl-0">
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-white/45">行程</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{guide.duration || '待补充'}</dd>
                  </div>
                  <div className="px-3">
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-white/45">地区</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{routeRegions.length} 个主要地区</dd>
                  </div>
                  <div className="px-3 pr-0">
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-white/45">总预算</dt>
                    <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-white">{guide.budget ? formatGuideMoney(guide.budget) : '待补充'}</dd>
                  </div>
                </dl>
              </div>

              {routeRegions.length ? (
                <section aria-labelledby="hero-route-heading" className="border-l border-white/16 bg-black/20 p-4 backdrop-blur-md md:p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/75">Route / 路线</p>
                  <h2 id="hero-route-heading" className="mt-2 text-xl font-semibold text-white">路线总览</h2>
                  <ol className="mt-4 space-y-1">
                    {routeRegions.map((stop, index) => {
                      const startDay = routeStartDay(stop.stopLabel, index + 1)
                      return (
                        <li key={`${stop.name}-${index}`}>
                          <a
                            href={`#day-${startDay}`}
                            className="group grid min-h-12 grid-cols-[4.5rem_1fr_auto] items-center gap-2 border-t border-white/10 py-2.5 text-sm transition first:border-t-0 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                          >
                            <span className="font-semibold tabular-nums text-amber-200/80">{stop.stopLabel || `D${startDay}`}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-white">{stop.primaryLabel || stop.name}</span>
                              {stop.secondaryLabel ? <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.18em] text-white/40">{stop.secondaryLabel}</span> : null}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-white/38 transition group-hover:translate-x-0.5 group-hover:text-amber-200" />
                          </a>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <GuideQuickNav
        guideSlug={guide.slug}
        days={datedDayPlans.map((day) => ({ dayNumber: day.dayNumber, title: day.title }))}
        hasMap={routeMapPoints.length > 0}
        hasBudget={Boolean(guide.budget || guide.budgetItems.length)}
      />

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-10 md:px-8 md:py-16">
        {routeMapPoints.length ? (
          <section id="route-map" className="scroll-mt-24">
            <div className="grid gap-3 border-b border-white/10 pb-5 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Route Map / 路线地图</p>
                <h2 className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">路线地图</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-white/55">点击路线节点查看地区与对应天数；地图不可用时，仍可沿下方文字路线阅读。</p>
            </div>
            <div className="mt-6 border border-white/10 bg-white/[0.025] p-2 md:p-3">
              <GuideRouteMap
                points={routeMapPoints}
                guideSlug={guide.slug}
                theme="dark"
                showCards
                className="space-y-4"
                emptyMessage="这篇攻略目前还没有足够的坐标资料来绘制路线地图；请参考文字路线与每日行程。"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/68">
              {routeRegions.map((stop, index) => (
                <span key={`${stop.name}-route-text`} className="inline-flex items-center gap-3">
                  <span>{stop.primaryLabel || stop.name}</span>
                  {index < routeRegions.length - 1 ? <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-amber-200/55" /> : null}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {guide.budget || guide.budgetItems.length ? (
          <section id="budget" className="scroll-mt-24">
            <div className="border-b border-white/10 pb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Budget / 预算</p>
              <h2 className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">预算拆解</h2>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-4">
              {guide.budget ? (
                <div className="col-span-2 flex min-h-44 flex-col justify-between bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.17),transparent_45%),#0b111d] p-5 md:p-6">
                  <div className="flex items-center gap-2 text-amber-100/75">
                    <Wallet className="h-4 w-4" />
                    <p className="text-xs uppercase tracking-[0.22em]">总预算</p>
                  </div>
                  <p className="mt-5 text-[clamp(2rem,5vw,3.7rem)] font-semibold leading-none tabular-nums text-white">{formatGuideMoney(guide.budget)}</p>
                  <p className="mt-4 text-xs leading-6 text-white/50">未有明确人数口径，因此不标示为“每人预算”。</p>
                </div>
              ) : null}
              {guide.budgetItems.map((item, index) => {
                const amount = parseGuideMoney(item.amount)
                const percentage = budgetDenominator ? Math.min(100, Math.max(0, (amount / budgetDenominator) * 100)) : 0
                return (
                  <div key={`${item.label || 'budget-item'}-${item.amount}-${index}`} className="flex min-h-44 flex-col bg-[#0b111d] p-4 md:p-5">
                    <p className="min-h-10 text-xs leading-5 text-white/60">{item.label || '预算项'}</p>
                    <p className="mt-3 text-xl font-semibold tabular-nums text-white md:text-2xl">
                      {item.currency ? [item.currency, item.amount].filter(Boolean).join(' ') : formatGuideMoney(item.amount)}
                    </p>
                    <div className="mt-4 h-1 overflow-hidden bg-white/8" aria-hidden="true">
                      <div className="h-full bg-amber-300/75" style={{ width: `${percentage}%` }} />
                    </div>
                    {item.note ? <p className="mt-3 text-xs leading-5 text-white/48">{item.note}</p> : null}
                  </div>
                )
              })}
            </div>
            <p className="mt-4 border-l border-amber-300/35 pl-4 text-sm leading-7 text-white/58">
              预算根据当次行程记录整理，实际费用会因日期、汇率、房型和个人消费而不同。
            </p>
          </section>
        ) : null}

        {guideKlookWidgetCode || selectedSidebarAffiliateIds.length ? (
          <aside aria-label="路线预订精选" className="grid gap-4 md:grid-cols-2">
            {guideKlookWidgetCode ? (
              <KlookWidgetEmbed code={guideKlookWidgetCode} title="Klook 路线预订" description="与这篇路线相关的活动入口" className="bg-white/[0.035]" />
            ) : null}
            {selectedSidebarAffiliateIds.length ? (
              <AffiliateCard
                linkIds={selectedSidebarAffiliateIds}
                limit={Math.max(selectedSidebarAffiliateIds.length, 1)}
                title="路线预订精选"
                guideSlug={guide.slug}
                className="bg-white/[0.035]"
                hideHeader
                singleColumn
              />
            ) : null}
          </aside>
        ) : null}

        <section aria-labelledby="itinerary-heading">
          <div className="border-b border-white/10 pb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Day by Day / 每日行程</p>
            <h2 id="itinerary-heading" className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">每日行程</h2>
          </div>

          <div className="divide-y divide-white/10">
            {datedDayPlans.map((day) => {
              const videoId = day.videoUrl ? getYouTubeID(day.videoUrl) : null
              const regionName = day.displaySpots.find((spot) => spot.regions)?.regions?.name_cn || day.displaySpots.find((spot) => spot.regions)?.regions?.name
              const isContinuedStay = Boolean(day.stay && day.dayNumber > day.stayStartDay)

              return (
                <article id={`day-${day.dayNumber}`} key={`${day.date}-${day.dayNumber}`} className="scroll-mt-24 py-10 md:py-14">
                  <header className="grid gap-3 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-end">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">Day {day.dayNumber}</p>
                    <h3 className="text-3xl font-semibold leading-tight text-white md:text-4xl">{day.title}</h3>
                    {day.formattedDate ? <time dateTime={day.date} className="text-sm tabular-nums text-white/55">{day.formattedDate}</time> : null}
                  </header>

                  <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/68">
                    {day.displaySpots.length ? <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.035] px-3 py-1.5"><MapPin className="h-3.5 w-3.5" />{day.displaySpots.length} 个地点</span> : null}
                    {regionName ? <span className="border border-white/10 bg-white/[0.035] px-3 py-1.5">{regionName}</span> : null}
                    {day.stay ? <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.035] px-3 py-1.5"><BedDouble className="h-3.5 w-3.5" />{isContinuedStay ? '继续入住' : '有住宿'}</span> : null}
                    {videoId ? <span className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.035] px-3 py-1.5"><Film className="h-3.5 w-3.5" />有影片</span> : null}
                  </div>

                  {day.displaySpots.length > 1 ? (
                    <nav aria-label={`Day ${day.dayNumber} 今日路线`} className="mt-6 border-y border-white/10 py-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                        <Navigation className="h-3.5 w-3.5" /> 今日路线
                      </div>
                      <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        {day.displaySpots.map((spot, index) => (
                          <li key={`route-${day.dayNumber}-${spot.id}`} className="flex min-w-0 items-center gap-2">
                            <Link href={buildLocationPath(spot.name, spot.id)} className="truncate text-sm text-white/82 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                              {spot.name_cn || spot.name}
                            </Link>
                            {index < day.displaySpots.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 rotate-90 text-amber-200/45 sm:rotate-0" /> : null}
                          </li>
                        ))}
                      </ol>
                    </nav>
                  ) : null}

                  {shouldShowDaySummary(day.summary) ? (
                    <div className="mt-6 max-w-[800px] space-y-4 text-[15px] leading-[1.85] text-white/76 md:text-base">
                      {splitGuideParagraphs(day.summary).map((paragraph, index) => <p key={`${day.dayNumber}-summary-${index}`}>{paragraph}</p>)}
                    </div>
                  ) : null}

                  {day.highlights.length ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {day.highlights.map((highlight) => <span key={highlight} className="border-l border-amber-300/40 bg-white/[0.035] px-3 py-1.5 text-xs text-white/78">{highlight}</span>)}
                    </div>
                  ) : null}

                  {day.displaySpots.length || day.unresolvedSpotNames.length ? (
                    <section aria-label={`Day ${day.dayNumber} 相关地点`} className="mt-7">
                      <div className="flex items-end justify-between gap-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">当天相关地点</p>
                        <span className="text-xs tabular-nums text-white/48">{day.displaySpots.length} 张资料卡</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {day.displaySpots.map((spot) => {
                          const orderIndex = day.orderedSpotIds.indexOf(spot.id)
                          return (
                            <Link
                              key={spot.id}
                              href={buildLocationPath(spot.name, spot.id)}
                              className="group overflow-hidden border border-white/10 bg-white/[0.035] transition hover:border-white/22 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                            >
                              <div className="relative aspect-[4/3] overflow-hidden bg-black/25">
                                <FallbackImage
                                  src={getSpotCover(spot)}
                                  alt={`${spot.name_cn || spot.name} ${spot.regions?.name_cn || spot.regions?.name || ''} ${spot.category === 'food' ? '美食或环境照片' : '旅行照片'}`.trim()}
                                  fill
                                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
                                  className="object-cover transition duration-500 group-hover:scale-[1.025]"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                                <div className="absolute left-3 top-3 flex items-center gap-2">
                                  {orderIndex >= 0 ? <span className="flex h-7 w-7 items-center justify-center bg-amber-300 text-xs font-bold text-slate-950">{orderIndex + 1}</span> : null}
                                  <span className="bg-black/62 px-2.5 py-1 text-[10px] text-white/88 backdrop-blur">{spotTypeLabel(spot.category)}</span>
                                </div>
                              </div>
                              <div className="p-4">
                                <p className="text-base font-medium leading-6 text-white">{spot.name_cn || spot.name}</p>
                                <p className="mt-1 text-xs text-white/50">{spot.regions?.name_cn || spot.regions?.name || '地点'}</p>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                      {day.unresolvedSpotNames.length ? (
                        <div className="mt-3 border-l-2 border-amber-300/45 bg-amber-300/[0.05] px-4 py-3 text-sm leading-6 text-white/68">
                          待补完整景点资料：{day.unresolvedSpotNames.join('、')}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {day.transport ? (
                    <section aria-label={`Day ${day.dayNumber} 交通`} className="mt-7 border-l border-white/15 pl-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">交通</p>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">{day.transport}</p>
                      {day.transportPrice ? <p className="mt-2 text-sm font-medium tabular-nums text-amber-100">{day.transportPrice}</p> : null}
                    </section>
                  ) : null}

                  {day.staySpot || day.stay ? (
                    <section aria-label={`Day ${day.dayNumber} 当日住宿`} className="mt-7 border border-sky-200/15 bg-sky-300/[0.055] p-4 md:p-5">
                      <div className="flex items-center gap-2 text-sky-100/82">
                        <BedDouble className="h-4 w-4" />
                        <p className="text-xs font-semibold uppercase tracking-[0.22em]">{isContinuedStay ? '继续入住' : '当日住宿'}</p>
                      </div>
                      {day.staySpot ? (
                        <Link href={buildLocationPath(day.staySpot.name, day.staySpot.id)} className={`group mt-4 grid gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${isContinuedStay ? 'grid-cols-[72px_minmax(0,1fr)] items-center' : 'md:grid-cols-[180px_minmax(0,1fr)]'}`}>
                          <div className={`relative overflow-hidden bg-black/20 ${isContinuedStay ? 'h-16' : 'aspect-[4/3] md:aspect-[3/2]'}`}>
                            <FallbackImage
                              src={getSpotCover(day.staySpot)}
                              alt={`${day.staySpot.name_cn || day.staySpot.name} ${day.staySpot.regions?.name_cn || day.staySpot.regions?.name || ''} 住宿照片`.trim()}
                              fill
                              sizes={isContinuedStay ? '72px' : '(max-width: 768px) 100vw, 180px'}
                              className="object-cover transition duration-500 group-hover:scale-[1.025]"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white">{day.staySpot.name_cn || day.staySpot.name}</p>
                            <p className="mt-1 text-xs text-white/52">{day.staySpot.regions?.name_cn || day.staySpot.regions?.name || '住宿地点'}</p>
                            {day.stayNote ? <p className="mt-2 text-sm leading-6 text-white/65">{day.stayNote}</p> : null}
                            <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-sky-100">查看酒店详情 <ExternalLink className="h-3 w-3" /></span>
                          </div>
                        </Link>
                      ) : (
                        <div className="mt-3 text-sm leading-7 text-white/78">
                          <p>{day.stay}</p>
                          {day.stayNote ? <p className="mt-2 text-white/58">{day.stayNote}</p> : null}
                        </div>
                      )}
                      {day.staySpot ? (
                        <AffiliateCard
                          locationId={day.staySpot.id}
                          regionId={day.staySpot.region_id || undefined}
                          category="accommodation"
                          limit={1}
                          guideSlug={guide.slug}
                          dayNumber={day.dayNumber}
                          ctaPosition="day_accommodation"
                          actionLabel="查看这家酒店当前房价"
                          className="mt-4 border-0 bg-transparent shadow-none"
                          minimal
                          hideHeader
                        />
                      ) : null}
                    </section>
                  ) : null}

                  {videoId ? (
                    <section aria-label={`Day ${day.dayNumber} 当日影片`} className="mt-7">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/48">当日影片</p>
                      <GuideVideoCard videoId={videoId} title={day.title} guideSlug={guide.slug} dayNumber={day.dayNumber} />
                    </section>
                  ) : null}

                  {day.gallery.length ? <GuideGallery images={day.gallery} guideSlug={guide.slug} dayNumber={day.dayNumber} /> : null}

                  {day.reminder ? (
                    <aside className="mt-6 border-l-2 border-amber-300/40 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/68">
                      {day.reminder}
                    </aside>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>

        <AuthorTrustBlock />

        {relatedGuides.length ? (
          <section aria-labelledby="related-guides-heading">
            <div className="border-b border-white/10 pb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/68">Related Guides / 相关游记路线</p>
              <h2 id="related-guides-heading" className="mt-2 font-display text-4xl leading-none text-white md:text-5xl">探索更多路线</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {relatedGuides.map((relatedGuide) => (
                <Link key={relatedGuide.slug} href={`/guide/${relatedGuide.slug}`} className="group overflow-hidden border border-white/10 bg-white/[0.035] transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  <div className="relative aspect-[16/9] bg-black/25">
                    <FallbackImage src={relatedGuide.coverImage || '/placeholder-image.jpg'} alt={`${relatedGuide.title} 攻略封面`} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-500 group-hover:scale-[1.025]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs text-amber-100/72"><CalendarDays className="h-3.5 w-3.5" />{relatedGuide.duration || '行程参考'}</div>
                    <h3 className="mt-3 text-lg font-semibold leading-6 text-white">{relatedGuide.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/55">{relatedGuide.tagline || relatedGuide.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {routeRegions.some((stop) => stop.href) ? (
          <section aria-labelledby="related-regions-heading" className="border-y border-white/10 py-7">
            <h2 id="related-regions-heading" className="text-xl font-semibold text-white">相关地区与景点</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {routeRegions.filter((stop) => stop.href).map((stop) => (
                <Link key={`${stop.name}-region`} href={String(stop.href)} className="inline-flex min-h-10 items-center gap-2 border border-white/10 bg-white/[0.035] px-4 text-sm text-white/72 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  <MapPinned className="h-3.5 w-3.5" /> {stop.primaryLabel || stop.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {relatedPackages.length ? (
          <section aria-labelledby="related-packages-heading" className="space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/72">Related travel packages / 相关旅游配套</p>
              <h2 id="related-packages-heading" className="mt-2 font-display text-4xl leading-none text-white">查看相关旅游配套</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {relatedPackages.map((item) => <TravelPackageCard key={item.id} item={item} compact showWhatsApp={false} detailLabel="查看相关配套" />)}
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 border-t border-white/10 pt-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/42">Continue Exploring</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">继续探索 JnQ Journey</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/guide" className="inline-flex min-h-11 items-center gap-2 border border-white/12 px-4 text-sm text-white transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                查看更多攻略 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/region" className="inline-flex min-h-11 items-center gap-2 border border-white/12 px-4 text-sm text-white transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                按地区找景点 <MapPinned className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <SupportSidebarCard className="bg-white/[0.025] shadow-none" />
        </section>
      </div>

      <SiteFooter />
    </main>
  )
}
