import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'
import FallbackImage from '@/components/FallbackImage'
import { Badge } from '@/components/ui/badge'
import { MapPin, Clock, Navigation, ExternalLink, CalendarDays } from 'lucide-react'
import KlookWidgetEmbed from '@/components/KlookWidgetEmbed'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import { buildCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import { fetchLocationBySlug, fetchRelatedLocations } from '@/lib/server/public-location-data'
import { getActiveKlookWidgetsForTargets } from '@/lib/server/klook-widgets-store'
import { readGuides } from '@/lib/server/guides-store'
import { absoluteUrl } from '@/lib/site'
import { buildRegionPath } from '@/lib/region-routing'
import { buildLocationPath } from '@/lib/location-routing'
import { getDisplayTitle } from '@/lib/content-display'
import { formatOpeningHoursDisplay } from '@/lib/opening-hours'
import { getVisibleLocationTags } from '@/lib/tag-utils'

import { buildPageTitle, buildMetaDescription, buildCanonicalUrl, buildOpenGraphData, buildTwitterCardData } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: {
    slug: string
  }
}

function normalizeGuideMatch(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const location = await fetchLocationBySlug(params.slug)

  if (!location) {
    return {
      title: buildPageTitle('Spot not found'),
    }
  }

  const regionName = location.regions?.name_cn || location.regions?.name || ''
  const readableName = location.name_cn ? `${location.name_cn} / ${location.name}` : location.name
  const categoryLabel =
    location.category === 'food' ? 'food spot' : location.category === 'accommodation' ? 'stay' : 'travel spot'
  
  const seoTitle = regionName ? `${readableName} in ${regionName} - ${categoryLabel} guide` : `${readableName} ${categoryLabel} guide`
  
  const fallbackDesc = `Plan your visit to ${readableName}${regionName ? ` in ${regionName}` : ''} with photos, address, map location, opening hours, travel notes, and booking references from JnQ Journey.`
  const description = buildMetaDescription(location.description || location.review, fallbackDesc)

  const canonicalPath = await buildCanonicalLocationPath(location.name, location.id)
  const canonicalUrl = buildCanonicalUrl(canonicalPath)
  const coverImage = location.image_url || location.images?.[0] || null

  return {
    title: seoTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: buildOpenGraphData(seoTitle, description, canonicalPath, coverImage, 'article'),
    twitter: buildTwitterCardData(seoTitle, description, coverImage),
  }
}

export default async function SpotPage({ params }: PageProps) {
  const location = await fetchLocationBySlug(params.slug)

  if (!location) {
    notFound()
  }

  const canonicalPath = await buildCanonicalLocationPath(location.name, location.id)
  if (params.slug !== canonicalPath.replace('/spot/', '')) {
    redirect(canonicalPath)
  }

  const relatedLocations = await fetchRelatedLocations(location, 6)
  const klookWidgets = await getActiveKlookWidgetsForTargets({
    locationId: location.id,
    regionId: location.region_id,
  })
  const allGuides = await readGuides()
  const locationNames = new Set([
    normalizeGuideMatch(location.name),
    normalizeGuideMatch(location.name_cn),
  ].filter(Boolean))
  const relatedGuides = allGuides
    .filter((guide) => {
      const guideNames = new Set(
        [
          ...guide.route.map((item) => item.mapSpotName || item.name),
          ...(guide.featuredSpotNames || []),
          ...guide.days.flatMap((day) => day.linkedSpots || []),
        ]
          .map(normalizeGuideMatch)
          .filter(Boolean)
      )
      for (const name of locationNames) {
        if (guideNames.has(name)) return true
      }
      return false
    })
    .slice(0, 3)
    .map((guide) => ({
      slug: guide.slug,
      title: guide.title,
      shortTitle: guide.shortTitle,
      duration: guide.duration,
    }))

  const baseType = location.category === 'food' ? 'Restaurant' : location.category === 'accommodation' ? 'Hotel' : 'TouristAttraction'
  const structuredData: any = {
    '@context': 'https://schema.org',
    '@type': baseType,
    name: location.name_cn || location.name,
    alternateName: location.name_cn ? location.name : undefined,
    description: location.description || location.review || undefined,
    image: location.image_url || location.images?.[0] || undefined,
    url: absoluteUrl(canonicalPath),
  }
  if (location.address) structuredData.address = location.address
  if (location.latitude && location.longitude) {
    structuredData.geo = {
      '@type': 'GeoCoordinates',
      latitude: location.latitude,
      longitude: location.longitude,
    }
  }
  const metadataOpeningHours = formatOpeningHoursDisplay(location.opening_hours)
  if (metadataOpeningHours.visible) {
    structuredData.openingHoursSpecification = {
      '@type': 'OpeningHoursSpecification',
      description: metadataOpeningHours.plainText
    }
  }
  
  const sameAsLinks = [location.facebook_video_url, location.video_url].filter(Boolean)
  if (sameAsLinks.length > 0) {
    structuredData.sameAs = sameAsLinks
  }

  const regionPath = location.regions?.id && location.regions?.name ? buildRegionPath(location.regions.name, location.regions.id) : null
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
      ...(regionPath ? [{
        '@type': 'ListItem',
        position: 2,
        name: location.regions?.name_cn || location.regions?.name || 'Region',
        item: absoluteUrl(regionPath),
      }] : []),
      {
        '@type': 'ListItem',
        position: regionPath ? 3 : 2,
        name: location.name_cn || location.name,
        item: absoluteUrl(canonicalPath),
      },
    ],
  }

  const primaryName = location.name_cn || location.name
  const regionName = location.regions?.name_cn || location.regions?.name || ''
  
  let h1Title = ''
  if (regionName) {
    if (location.category === 'food') h1Title = `${primaryName}｜${regionName}美食打卡`
    else if (location.category === 'accommodation') h1Title = `${primaryName}｜${regionName}住宿参考`
    else h1Title = `${primaryName}｜${regionName}旅游攻略`
  } else {
    h1Title = `${primaryName}｜旅行参考`
  }

  const categoryLabel = location.category === 'food' ? '美食' : location.category === 'accommodation' ? '住宿' : '景点'
  const coverImage = location.image_url || location.images?.[0] || '/placeholder-image.jpg'
  const imgAlt = location.category === 'food' ? `${primaryName} ${regionName} 美食或环境照片` : `${primaryName} ${regionName} 旅游照片`
  
  const visibleTags = getVisibleLocationTags(location.tags)
  const openingHoursDisplay = formatOpeningHoursDisplay(location.opening_hours)
  const description = location.description || location.review || '这里整理 JnQ Journey 已收录的地点资料，包括位置、照片、相关地区和旅行参考资讯，方便你规划自由行、周末游或亲子行程。更多实际体验会陆续更新。'

  const mapQuery = encodeURIComponent([location.name, location.name_cn, location.address].filter(Boolean).join(' '))

  const goodForMap: Record<string, string> = {
    'family': '亲子',
    'couple': '情侣',
    'photo': '拍照',
    'food': '美食',
    'nature': '自然景观',
    'shopping': '购物',
    '亲子': '亲子',
    '情侣': '情侣',
    '拍照': '拍照',
    '美食': '美食',
    '自然景观': '自然景观',
    '购物': '购物'
  }
  const goodForList = Array.from(new Set(visibleTags.map(tag => {
    const t = tag.toLowerCase()
    for (const [key, val] of Object.entries(goodForMap)) {
      if (t.includes(key) || t.includes(val)) return val
    }
    return null
  }).filter(Boolean))) as string[]

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.15),transparent_22%),linear-gradient(180deg,#111827_0%,#020617_48%,#000000_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12 space-y-12">
        {/* 1. Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
          <Link href="/" className="hover:text-white transition">Home</Link>
          {regionPath && (
            <>
              <span>›</span>
              <Link href={regionPath} className="hover:text-white transition">{regionName}</Link>
            </>
          )}
          <span>›</span>
          <span className="text-gray-500">{primaryName}</span>
        </nav>

        {/* 2. Hero */}
        <header className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-white/10 text-white hover:bg-white/20 border-white/20">{categoryLabel}</Badge>
              {regionName && <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">{regionName}</Badge>}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight text-white">{h1Title}</h1>
            {location.name_cn && location.name && location.name_cn !== location.name && (
              <p className="text-lg text-gray-300">{location.name}</p>
            )}
          </div>
          
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <FallbackImage src={coverImage} alt={imgAlt.trim()} fill sizes="100vw" className="object-cover" priority />
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,760px)_340px] lg:items-start">
          <div className="space-y-12">
        {/* 3. Overview */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-white">简介</h2>
          <div className="text-gray-300 leading-relaxed space-y-4 text-sm md:text-base">
            {description.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}
          </div>
        </section>

        {/* 4. Highlights */}
        {visibleTags.length > 1 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">看点</h2>
            <div className="flex flex-wrap gap-2">
              {visibleTags.map(tag => (
                <span key={tag} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-200">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 5. Practical Info */}
        <section className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6">
          <h2 className="text-2xl font-bold text-white">实用资料</h2>
          <div className="grid gap-5 md:grid-cols-2 text-sm text-gray-300 mt-4">
            {location.address && (
              <div className="flex gap-3">
                <MapPin className="w-5 h-5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-semibold text-white">地址</p>
                  <p className="mt-1 leading-relaxed">{location.address}</p>
                </div>
              </div>
            )}
            {openingHoursDisplay.visible && (
              <div className="flex gap-3">
                <Clock className="w-5 h-5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-semibold text-white">营业时间</p>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{openingHoursDisplay.plainText}</p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Navigation className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-white">导航</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 border border-amber-400/30 rounded-full px-3 py-1 bg-amber-400/10 transition">Google Maps <ExternalLink className="w-3 h-3" /></a>
                  <a href={`https://www.waze.com/ul?ll=${location.latitude},${location.longitude}&z=17`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 border border-blue-400/30 rounded-full px-3 py-1 bg-blue-400/10 transition">Waze <ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Good For */}
        {goodForList.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">适合谁</h2>
            <ul className="list-disc pl-5 text-gray-300 space-y-2 text-sm md:text-base">
              {goodForList.map(tag => <li key={tag}>{tag}</li>)}
            </ul>
          </section>
        )}

        {/* 7. Nearby Spots */}
        {relatedLocations.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-end justify-between">
              <h2 className="text-2xl font-bold text-white">附近顺路景点</h2>
              {regionPath && <Link href={regionPath} className="text-sm text-amber-400 hover:text-amber-300 transition">查看{regionName}所有景点 ›</Link>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {relatedLocations.slice(0, 6).map(spot => {
                const title = getDisplayTitle(spot.name, spot.name_cn)
                return (
                  <Link key={spot.id} href={buildLocationPath(spot.name, spot.id)} className="group block overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] transition hover:-translate-y-1 hover:bg-white/10">
                    <div className="relative aspect-[4/3] bg-white/5">
                      <FallbackImage src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'} alt={`${title.primary} ${regionName} ${spot.category === 'food' ? '美食或环境照片' : '旅游照片'}`.trim()} fill sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw" className="object-cover transition duration-500 group-hover:scale-105" />
                    </div>
                    <div className="p-3 md:p-4">
                      <h3 className="line-clamp-1 font-medium text-white text-sm md:text-base">{title.primary}</h3>
                      {spot.distanceKm !== undefined && <p className="text-xs text-gray-400 mt-1.5">约 {spot.distanceKm.toFixed(1)} km</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* 8. Related Guides */}
        {relatedGuides.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-white">相关游记路线</h2>
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2">
              {relatedGuides.map(guide => (
                <Link key={guide.slug} href={`/guide/${guide.slug}`} className="block rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] p-4 md:p-5 transition hover:-translate-y-1 hover:bg-white/10">
                  <div className="flex items-center gap-2 mb-2.5 text-xs text-amber-400">
                    <CalendarDays className="w-4 h-4" />
                    <span>{guide.duration || '行程参考'}</span>
                  </div>
                  <h3 className="font-semibold text-white line-clamp-2 leading-snug">{guide.title}</h3>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 9. FAQ */}
        <section className="space-y-6 border-t border-white/10 pt-8 pb-8">
          <h2 className="text-2xl font-bold text-white">常见问题 FAQ</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-white">Q：{primaryName}在哪里？</h3>
              <p className="mt-2 text-gray-300 text-sm leading-relaxed">
                A：根据网站资料，{primaryName} 位于 {location.address || regionName || '对应地区'}。建议出发前使用 Google Maps 或 Waze 确认实时路线。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Q：{primaryName}适合亲子吗？</h3>
              <p className="mt-2 text-gray-300 text-sm leading-relaxed">
                A：{goodForList.some(t => t.includes('亲子') || t.includes('family')) ? '根据页面标签，这里适合亲子同行，您可以参考图片和看点介绍。' : '是否适合亲子需要根据现场环境和同行成员情况判断。建议参考上方简介和看点。'}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Q：{primaryName}建议停留多久？</h3>
              <p className="mt-2 text-gray-300 text-sm leading-relaxed">
                A：如果只是简单打卡可安排较短时间，如果需要拍照、用餐或慢慢逛，建议预留更充裕时间。
              </p>
            </div>
            {relatedLocations.length >= 3 && (
              <div>
                <h3 className="font-semibold text-white">Q：{primaryName}附近还有什么可以顺路去？</h3>
                <p className="mt-2 text-gray-300 text-sm leading-relaxed">
                  A：附近或同地区可以顺路参考{' '}
                  {relatedLocations.slice(0, 3).map((spot, i) => (
                    <span key={spot.id}>
                      {i > 0 && '、'}
                      <Link href={buildLocationPath(spot.name, spot.id)} className="text-amber-400 hover:text-amber-300 transition hover:underline">{spot.name_cn || spot.name}</Link>
                    </span>
                  ))}
                  。
                </p>
              </div>
            )}
          </div>
        </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            {klookWidgets.length > 0 ? (
              <div className="space-y-4">
                {klookWidgets.map((widget) => (
                  <KlookWidgetEmbed
                    key={widget.id}
                    code={widget.htmlCode}
                    title={widget.title}
                    description={widget.description}
                    variant="card"
                  />
                ))}
              </div>
            ) : null}

            <SupportSidebarCard className="bg-white/5" />

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Navigation</p>
              <div className="mt-4 space-y-3">
                <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white transition hover:bg-white/10">
                  Google Maps
                  <ExternalLink className="h-4 w-4 text-white/45" />
                </a>
                <a href={`https://www.waze.com/ul?ll=${location.latitude},${location.longitude}&z=17`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white transition hover:bg-white/10">
                  Waze
                  <ExternalLink className="h-4 w-4 text-white/45" />
                </a>
              </div>
            </section>
          </aside>
        </div>

      </div>
      <SiteFooter />
    </main>
  )
}
