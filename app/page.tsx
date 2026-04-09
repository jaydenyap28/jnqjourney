'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { MapRef } from 'react-map-gl/mapbox'
import Fuse from 'fuse.js'

import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'
import MapView from '@/components/MapView'
import TopFloatingIsland from '@/components/TopFloatingIsland'
import BottomFloatingDock from '@/components/BottomFloatingDock'
import SiteFooter from '@/components/SiteFooter'
import type { TravelGuide } from '@/lib/guides'
import FallbackImage from '@/components/FallbackImage'
import { getVisibleLocationTags } from '@/lib/tag-utils'

interface Region {
  id?: number
  name: string
  name_cn?: string
  country?: string
  description?: string
  image_url?: string
  code?: string
}

interface Location {
  id: number
  name: string
  name_cn?: string
  latitude: number
  longitude: number
  review?: string
  description?: string
  address?: string
  category?: string
  visit_date?: string
  video_url?: string
  image_url?: string
  images?: string[]
  tags?: string[]
  opening_hours?: string
  regions?: Region
}

interface RegionHighlight {
  id: number
  name: string
  name_cn?: string
  country?: string
  count: number
  coverImage?: string
  sampleText?: string
  pinned?: boolean
}

function compareLocationsByVisitDate(left: Location, right: Location) {
  const leftVisit = left.visit_date ? Date.parse(left.visit_date) : NaN
  const rightVisit = right.visit_date ? Date.parse(right.visit_date) : NaN
  const leftHasVisit = Number.isFinite(leftVisit)
  const rightHasVisit = Number.isFinite(rightVisit)

  if (leftHasVisit && rightHasVisit && leftVisit !== rightVisit) {
    return rightVisit - leftVisit
  }

  if (leftHasVisit !== rightHasVisit) {
    return rightHasVisit ? 1 : -1
  }

  return right.id - left.id
}

function getCategoryLabel(category?: string) {
  switch (category) {
    case 'food':
      return 'Food'
    case 'accommodation':
      return 'Stay'
    default:
      return 'Spot'
  }
}

function getDisplayTitle(name: string, nameCn?: string) {
  if (nameCn && nameCn.trim() && nameCn.trim() !== name.trim()) {
    return { primary: name, secondary: nameCn }
  }

  return { primary: name, secondary: '' }
}

function parseRegionCodeTokens(code?: string) {
  return new Set(
    String(code || '')
      .split(/[,\s;|]+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
  )
}

function getGuideCoverImage(guide: TravelGuide) {
  return guide.coverImage || ''
}

function formatGuideDuration(duration: string) {
  const text = String(duration || '').trim()
  const match = text.match(/(\d+)\s*days?.*?(\d+)\s*nights?/i)
  if (match) return `${match[1]}\u5929${match[2]}\u591c`
  return text
}

function formatGuideTravelStyle(style: string) {
  const normalized = String(style || '').trim().toLowerCase()
  if (normalized === 'road trip') return '\u81ea\u9a7e'
  if (normalized === 'free & easy') return '\u81ea\u7531\u884c'
  return style
}

function getGuideRouteSummary(guide: TravelGuide, limit = 3) {
  return guide.route
    .map((stop) => stop.name)
    .filter(Boolean)
    .slice(0, limit)
}

function getGuideDisplayPair(guide: TravelGuide) {
  const shortTitle = String(guide.shortTitle || '').trim()
  const title = String(guide.title || '').trim()

  if (!title) return { primary: shortTitle, secondary: '' }
  if (!shortTitle) return { primary: title, secondary: '' }
  if (shortTitle === title) return { primary: shortTitle, secondary: '' }

  return { primary: shortTitle, secondary: title }
}

function GuideShowcase() {
  const [guides, setGuides] = useState<TravelGuide[]>([])
  const [activeGuidePage, setActiveGuidePage] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchGuide = async () => {
      try {
        const response = await fetch('/api/guides', { cache: 'no-store' })
        if (!response.ok) return
        const result = await response.json()
        const nextGuides = Array.isArray(result?.guides) ? result.guides.slice(0, 6) : []
        if (!cancelled) {
          setGuides(nextGuides)
          setActiveGuidePage(0)
        }
      } catch {
        if (!cancelled) {
          setGuides([])
        }
      }
    }

    fetchGuide()
    return () => {
      cancelled = true
    }
  }, [])

  if (!guides.length) return null

  const guidePages = guides.length <= 3 ? [guides] : [guides.slice(0, 3), guides.slice(3, 6)].filter((page) => page.length)
  const visibleGuides = guidePages[Math.min(activeGuidePage, Math.max(guidePages.length - 1, 0))] || []

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid gap-3 md:gap-5 lg:grid-cols-3">
        {visibleGuides.map((guide, index) => {
          const title = getGuideDisplayPair(guide)
          const route = getGuideRouteSummary(guide, 3)
          const coverImage = getGuideCoverImage(guide)

          return (
            <Link
              key={guide.slug}
              href={`/guide/${guide.slug}`}
              className={`group relative block overflow-hidden rounded-[24px] border bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] transition duration-500 hover:-translate-y-1 hover:border-white/20 hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.96))] md:rounded-[30px] ${
                index === 0
                  ? 'border-amber-200/20 shadow-[0_24px_50px_rgba(0,0,0,0.24)]'
                  : 'border-white/10'
              }`}
            >
              <div className="grid min-h-[340px] grid-rows-[minmax(196px,0.95fr)_auto] md:min-h-[420px] md:grid-rows-[minmax(250px,1.08fr)_auto]">
                <div className="relative overflow-hidden">
                  {coverImage ? (
                    <FallbackImage
                      src={coverImage}
                      alt={title.primary || title.secondary}
                      fill
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className={`absolute inset-0 ${guide.coverAccent}`} />
                  )}
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.14)_40%,rgba(0,0,0,0.86)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
                    <p className="section-kicker text-[10px] text-amber-100/82">{'\u6e38\u8bb0\u653b\u7565'}</p>
                    <h3 className="font-editorial-title mt-2 text-[2rem] leading-[0.94] text-white md:mt-3 md:text-5xl">
                      {title.primary}
                    </h3>
                    {title.secondary ? (
                      <p className="font-cjk-display mt-1.5 text-sm text-white/88 md:mt-2 md:text-lg">{title.secondary}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex h-full flex-col justify-between gap-4 p-4 md:gap-5 md:p-6">
                  <div className="flex flex-wrap gap-1.5 md:gap-2">
                    <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-2.5 py-1 text-[11px] font-medium text-amber-50 md:px-3 md:text-xs">
                      {formatGuideDuration(guide.duration)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-white/82 md:px-3 md:text-xs">
                      {formatGuideTravelStyle(guide.travelStyle)}
                    </span>
                    {guide.budget ? (
                      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-white/62 md:px-3 md:text-xs">
                        {guide.budget}
                      </span>
                    ) : null}
                  </div>

                  <p className="line-clamp-3 text-[13px] leading-6 text-white/72 md:text-sm md:leading-7">{guide.tagline || guide.summary}</p>

                  {route.length ? (
                    <div className="rounded-[18px] border border-white/10 bg-black/30 p-3 md:rounded-[22px] md:p-4">
                      <p className="section-kicker text-[10px] text-amber-200/75">{'\u8fd9\u8d9f\u8def\u7ebf'}</p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5 md:mt-3 md:gap-2">
                        {route.map((stop) => (
                          <span
                            key={`${guide.slug}-${stop}`}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/85 md:px-3 md:text-xs"
                          >
                            {stop}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="inline-flex items-center gap-2 text-[13px] font-medium text-white/88 md:text-sm">
                    {'\u6253\u5f00\u6e38\u8bb0'}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {guidePages.length > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {guidePages.map((page, index) => (
            <button
              key={`guide-page-${index}`}
              type="button"
              aria-label={`Go to guide page ${index + 1}`}
              onClick={() => setActiveGuidePage(index)}
              className={`h-2.5 rounded-full transition-all ${
                index === activeGuidePage ? 'w-8 bg-amber-200' : 'w-2.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LocationCard({ location, onOpen }: { location: Location; onOpen: (location: Location) => void }) {
  const coverImage = location.image_url || location.images?.[0] || '/placeholder-image.jpg'
  const title = getDisplayTitle(location.name, location.name_cn)

  return (
    <article className="group overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] transition hover:-translate-y-1 hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.96))] md:rounded-[28px]">
      <button className="block w-full text-left" onClick={() => onOpen(location)}>
        <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
          <FallbackImage
            src={coverImage}
            alt={title.primary}
            fill
            className="object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            {location.category ? (
              <Badge className="border border-white/10 bg-black/50 text-white">
                {getCategoryLabel(location.category)}
              </Badge>
            ) : null}
            {location.regions?.name ? (
              <Badge className="border border-white/10 bg-white/10 text-white">
                {location.regions.name}
              </Badge>
            ) : null}
          </div>
        </div>
      </button>

      <div className="space-y-3 p-4 md:space-y-4 md:p-5">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold text-white md:text-xl">{title.primary}</h3>
          {title.secondary ? (
            <p className="mt-1 line-clamp-1 text-xs text-gray-400 md:text-sm">{title.secondary}</p>
          ) : null}
        </div>

        <p className="line-clamp-2 text-[13px] leading-5 text-gray-300 md:line-clamp-3 md:text-sm md:leading-6">
          {location.description || location.review || '\u6253\u5f00\u8fd9\u4e2a\u666f\u70b9\u9875\uff0c\u67e5\u770b\u7167\u7247\u3001\u5730\u56fe\u3001\u5f71\u7247\u548c\u65c5\u884c\u7b14\u8bb0\u3002'}
        </p>

        <div className="flex justify-end">
          <Link
            href={buildLocationPath(location.name, location.id)}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-50"
          >
            {'\u67e5\u770b\u666f\u70b9'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  )
}

function RegionCard({ region }: { region: RegionHighlight }) {
  const href = buildRegionPath(region.name, region.id)
  const title = getDisplayTitle(region.name, region.name_cn)

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.92))] transition hover:-translate-y-1 hover:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.96))]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
        {region.coverImage ? (
          <FallbackImage
            src={region.coverImage}
            alt={title.primary}
            fill
            className="object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.25),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="line-clamp-1 text-xl font-semibold text-white">{title.primary}</h3>
              {title.secondary ? (
                <p className="mt-1 line-clamp-1 text-sm text-gray-400">{title.secondary}</p>
              ) : null}
            </div>
          <Badge className="border border-amber-400/20 bg-amber-400/10 text-amber-100">
            {region.count} {'\u4e2a\u5730\u70b9'}
          </Badge>
        </div>

        <p className="line-clamp-3 text-sm leading-6 text-gray-300">
          {region.sampleText || `${region.name_cn || region.name} \u4e00\u5e26\u7684\u666f\u70b9\u3001\u7f8e\u98df\u3001\u4f4f\u5bbf\u548c\u8def\u7ebf\u7075\u611f\u3002`}
        </p>
      </div>
    </Link>
  )
}

export default function Home() {
  const router = useRouter()
  const mapRef = useRef<MapRef>(null)

  const [locations, setLocations] = useState<Location[]>([])
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [flyToLocation, setFlyToLocation] = useState<{
    latitude: number
    longitude: number
    zoom?: number
  } | null>(null)

  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*, regions (id, name, name_cn, country, description, image_url, code)')
        .order('id', { ascending: false })

      if (error) {
        console.error('Error fetching locations:', error)
        return
      }

      setLocations(data || [])
      setFilteredLocations(data || [])
    }

    fetchLocations()
  }, [])

  const fuse = useMemo(
    () =>
      new Fuse(locations, {
        includeScore: true,
        threshold: 0.3,
        keys: [
          { name: 'name', weight: 1.0 },
          { name: 'name_cn', weight: 1.0 },
          { name: 'tags', weight: 0.8 },
          { name: 'regions.country', weight: 0.6 },
          { name: 'regions.name', weight: 0.6 },
          { name: 'regions.name_cn', weight: 0.6 },
          { name: 'description', weight: 0.5 },
        ],
      }),
    [locations]
  )

  const handleSearch = (term: string) => {
    setSearchTerm(term)

    if (!term.trim()) {
      setFilteredLocations(locations)
      return
    }

    const results = fuse.search(term)
    setFilteredLocations(results.map((result) => result.item))
  }

  const handleLanguageChange = () => {
    // Reserved for future multi-language support.
  }

  const handleLocationOpen = (location: Location) => {
    setFlyToLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      zoom: 15,
    })
    router.push(buildLocationPath(location.name, location.id))
  }

  const handleHoverLocation = (location: Location | null) => {
    if (!location) return

    setFlyToLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      zoom: 14,
    })
  }

  const visibleLocations = useMemo(
    () => [...filteredLocations].sort(compareLocationsByVisitDate),
    [filteredLocations]
  )

  const latestLocations = useMemo(() => visibleLocations.slice(0, 8), [visibleLocations])

  const malaysiaRegions = useMemo(
    () => {
      const regionMap = new Map<number, RegionHighlight>()

      for (const location of visibleLocations) {
        const region = location.regions
        if (!region?.id || !region.name || region.country !== 'Malaysia') continue

        const pinned = parseRegionCodeTokens(region.code).has('home-malaysia')
        const existing = regionMap.get(region.id)

        if (existing) {
          existing.count += 1
          existing.pinned = existing.pinned || pinned
          if (region.image_url) {
            existing.coverImage = region.image_url
          }
          if (!existing.sampleText && region.description) {
            existing.sampleText = region.description
          }
          continue
        }

        regionMap.set(region.id, {
          id: region.id,
          name: region.name,
          name_cn: region.name_cn,
          country: region.country,
          count: 1,
          coverImage: region.image_url || undefined,
          sampleText: region.description || undefined,
          pinned,
        })
      }

      return [...regionMap.values()]
        .sort((left, right) => {
          const leftPinned = Number(Boolean(left.pinned))
          const rightPinned = Number(Boolean(right.pinned))
          if (rightPinned !== leftPinned) return rightPinned - leftPinned
          if (right.count !== left.count) return right.count - left.count
          return left.name.localeCompare(right.name)
        })
    },
    [visibleLocations]
  )

  const globalRegions = useMemo(
    () => {
      const regionMap = new Map<number, RegionHighlight>()

      for (const location of visibleLocations) {
        const region = location.regions
        if (!region?.id || !region.name || region.country === 'Malaysia') continue

        const pinned = parseRegionCodeTokens(region.code).has('home-global')
        const existing = regionMap.get(region.id)

        if (existing) {
          existing.count += 1
          existing.pinned = existing.pinned || pinned
          if (region.image_url) {
            existing.coverImage = region.image_url
          }
          if (!existing.sampleText && region.description) {
            existing.sampleText = region.description
          }
          continue
        }

        regionMap.set(region.id, {
          id: region.id,
          name: region.name,
          name_cn: region.name_cn,
          country: region.country,
          count: 1,
          coverImage: region.image_url || undefined,
          sampleText: region.description || undefined,
          pinned,
        })
      }

      return [...regionMap.values()]
        .sort((left, right) => {
          const leftPinned = Number(Boolean(left.pinned))
          const rightPinned = Number(Boolean(right.pinned))
          if (rightPinned !== leftPinned) return rightPinned - leftPinned
          if (right.count !== left.count) return right.count - left.count
          return left.name.localeCompare(right.name)
        })
    },
    [visibleLocations]
  )

  const topTags = useMemo(() => {
    const tagCounts = new Map<string, number>()

    for (const location of visibleLocations) {
      for (const tag of getVisibleLocationTags(location.tags)) {
        if (!tag) continue
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }

    return [...tagCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8)
  }, [visibleLocations])

  return (
    <main className="bg-[radial-gradient(circle_at_14%_16%,rgba(245,158,11,0.18),transparent_18%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.14),transparent_18%),linear-gradient(180deg,#020617_0%,#09111f_36%,#0b1324_100%)] min-h-screen text-white">
      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <MapView
            ref={mapRef}
            locations={visibleLocations}
            onSelectLocation={handleLocationOpen}
            flyToLocation={flyToLocation}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.06)_34%,rgba(0,0,0,0.42)_100%)]" />
          <div className="bg-grid-fade pointer-events-none absolute inset-0 opacity-15" />
        </div>

        <TopFloatingIsland onSearch={handleSearch} onLanguageChange={handleLanguageChange} />
        <BottomFloatingDock
          locations={visibleLocations}
          onHoverLocation={handleHoverLocation}
          onSelectLocation={handleLocationOpen}
        />
      </section>

      <section className="relative z-10 px-3 pb-16 pt-5 md:px-8 md:pb-20 md:pt-8">
        <div className="mx-auto max-w-7xl space-y-10 md:space-y-14">
          <section id="guides" className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,28,0.88),rgba(12,18,32,0.96))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.36)] backdrop-blur-xl md:rounded-[32px] md:p-7 space-y-5 md:space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-cjk-display text-[2rem] leading-tight text-white md:text-4xl">{'\u5b8c\u6574\u6e38\u8bb0\u653b\u7565'}</h2>
              </div>
              <Link
                href="/guide"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 md:px-4 md:text-sm"
              >
                {'\u67e5\u770b\u5168\u90e8\u6e38\u8bb0'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <GuideShowcase />
          </section>

          <section id="malaysia" className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,28,0.88),rgba(12,18,32,0.96))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl md:rounded-[32px] md:p-7 space-y-5 md:space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-cjk-display text-[2rem] leading-tight text-white md:text-4xl">{'\u8d70\u904d\u9a6c\u6765\u897f\u4e9a'}</h2>
              </div>
              <Link
                href="/region/malaysia"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition hover:bg-white/10 md:px-4 md:text-sm"
              >
                {'\u67e5\u770b\u9a6c\u6765\u897f\u4e9a\u6240\u6709\u5730\u533a'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {malaysiaRegions.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
                {malaysiaRegions.map((region) => (
                  <RegionCard key={region.id} region={region} />
                ))}
              </div>
            ) : null}
          </section>

          <section id="global" className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,28,0.88),rgba(12,18,32,0.96))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl md:rounded-[32px] md:p-7 space-y-5 md:space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-cjk-display text-[2rem] leading-tight text-white md:text-4xl">{'\u6d77\u5916\u57ce\u5e02\u4e0e\u5730\u533a'}</h2>
              </div>
            </div>
            {globalRegions.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
                {globalRegions.map((region) => (
                  <RegionCard key={region.id} region={region} />
                ))}
              </div>
            ) : null}
          </section>

          {topTags.length > 0 ? (
            <section className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,28,0.88),rgba(12,18,32,0.96))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.32)] backdrop-blur-xl md:rounded-[32px] md:p-7 space-y-5">
              <div>
                <p className="section-kicker text-xs text-amber-300/80">{'\u5feb\u901f\u7b5b\u9009'}</p>
                <h2 className="font-cjk-display mt-2 text-[2rem] leading-tight text-white md:text-4xl">{'\u70ed\u95e8\u6807\u7b7e'}</h2>
              </div>
              <div className="flex flex-wrap gap-2.5 md:gap-3">
                {topTags.map(([tag, count], index) => {
                  const accents = [
                    'bg-amber-400/14 text-amber-50 border-amber-300/15',
                    'bg-sky-400/12 text-sky-50 border-sky-300/15',
                    'bg-emerald-400/12 text-emerald-50 border-emerald-300/15',
                    'bg-rose-400/12 text-rose-50 border-rose-300/15',
                  ]

                  return (
                    <button
                      key={tag}
                      onClick={() => handleSearch(tag)}
                      className={`rounded-full border px-4 py-2.5 text-[13px] transition hover:-translate-y-0.5 md:px-5 md:py-3 md:text-sm ${accents[index % accents.length]}`}
                    >
                      {tag}
                      <span className="ml-2 text-white/45">{count}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section id="latest" className="space-y-5 md:space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="section-kicker text-xs text-amber-300/80">{'\u6700\u65b0\u6253\u5361'}</p>
                <h2 className="font-cjk-display mt-2 text-[2rem] leading-tight text-white md:text-4xl">{'\u6700\u8fd1\u66f4\u65b0'}</h2>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
              {latestLocations.map((location) => (
                <LocationCard key={location.id} location={location} onOpen={handleLocationOpen} />
              ))}
            </div>
          </section>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
