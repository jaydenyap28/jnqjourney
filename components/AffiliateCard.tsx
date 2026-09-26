'use client'


import {PublicCopy} from '@/components/PublicLocale'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Hotel, MapPin, Star, Ticket, Train, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getDeviceType, trackEvent } from '@/lib/analytics'

interface AffiliateCardProps {
  linkIds?: number[]
  locationId?: number
  regionId?: number
  noteSlug?: string
  category?: string | null
  provider?: string
  limit?: number
  title?: string
  description?: string
  showDisclosure?: boolean
  className?: string
  compact?: boolean
  hideHeader?: boolean
  singleColumn?: boolean
  minimal?: boolean
  guideSlug?: string
  dayNumber?: number
  ctaPosition?: string
  actionLabel?: string
}

interface AffiliateLink {
  id: number
  provider: string
  link_type: string
  url: string
  title?: string | null
  description?: string | null
  commission_rate?: number | null
  clicks?: number | null
  location_id?: number | null
  region_id?: number | null
  locations?: {
    name?: string | null
    name_cn?: string | null
    image_url?: string | null
    images?: string[] | null
  } | null
  regions?: {
    name?: string | null
    name_cn?: string | null
    country?: string | null
    image_url?: string | null
  } | null
}

interface AffiliatePreview {
  title?: string
  image?: string
  finalUrl?: string
  hostname?: string
}

function getTrackingSessionId() {
  if (typeof window === 'undefined') return ''
  const key = 'jnq_session_id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const value = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(key, value)
  return value
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  agoda: <Hotel className="h-4 w-4" />,
  booking: <Hotel className="h-4 w-4" />,
  klook: <Ticket className="h-4 w-4" />,
  kkday: <MapPin className="h-4 w-4" />,
  trip: <Star className="h-4 w-4" />,
  others: <TrendingUp className="h-4 w-4" />,
}

const PROVIDER_NAMES: Record<string, string> = {
  agoda: 'Agoda',
  booking: 'Booking.com',
  klook: 'Klook',
  kkday: 'KKday',
  trip: 'Trip.com',
  others: '\u7cbe\u9009\u63a8\u8350',
}

const LINK_TYPE_NAMES: Record<string, string> = {
  hotel: 'Hotel',
  ticket: 'Tickets',
  tour: 'Tours',
  transport: 'Transport',
  food: 'Food',
  insurance: 'Insurance',
  sim: 'SIM / eSIM',
  others: 'Recommendation',
}

const LINK_TYPE_ACTIONS: Record<string, string> = {
  hotel: '查看酒店房型',
  ticket: '查看当前价格',
  tour: '查看活动选择',
  transport: '查看交通安排',
  food: '查看当前优惠',
  insurance: '查看保险方案',
  sim: '查看 eSIM 方案',
  others: '查看预订详情',
}

const PROVIDER_ACCENTS: Record<string, string> = {
  agoda: 'from-emerald-500/35 via-emerald-400/10 to-transparent',
  booking: 'from-blue-500/35 via-blue-400/10 to-transparent',
  klook: 'from-orange-500/35 via-orange-400/10 to-transparent',
  kkday: 'from-cyan-500/35 via-cyan-400/10 to-transparent',
  trip: 'from-sky-500/35 via-sky-400/10 to-transparent',
  others: 'from-amber-500/35 via-amber-400/10 to-transparent',
}

function getTypePriority(category?: string | null) {
  if (category === 'food') {
    return {
      food: 0,
      hotel: 1,
      transport: 2,
      sim: 3,
      insurance: 4,
      tour: 5,
      ticket: 6,
      others: 7,
    }
  }

  if (category === 'accommodation') {
    return {
      hotel: 0,
      transport: 1,
      sim: 2,
      insurance: 3,
      food: 4,
      tour: 5,
      ticket: 6,
      others: 7,
    }
  }

  return {
    ticket: 0,
    tour: 1,
    transport: 2,
    hotel: 3,
    sim: 4,
    insurance: 5,
    food: 6,
    others: 7,
  }
}

function getLinkScope(link: AffiliateLink, locationId?: number, regionId?: number, noteSlug?: string) {
  if (locationId && link.location_id === locationId) return 'location'
  if (regionId && link.region_id === regionId) return 'region'
  return 'other'
}

function getScopePriority(scope: 'location' | 'region' | 'note' | 'other') {
  if (scope === 'location') return 0
  if (scope === 'region') return 1
  if (scope === 'note') return 2
  return 3
}

function looksLikeWeakPreviewImage(url?: string | null) {
  const value = String(url || '').toLowerCase()
  if (!value) return true
  return ['favicon', 'icon', 'logo', 'sprite', 'placeholder'].some((keyword) => value.includes(keyword))
}

export default function AffiliateCard({
  linkIds,
  locationId,
  regionId,
  noteSlug,
  category,
  provider,
  limit = 6,
  title = '预订推荐',
  description,
  showDisclosure = true,
  className = '',
  compact = false,
  hideHeader = false,
  singleColumn = false,
  minimal = false,
  guideSlug,
  dayNumber,
  ctaPosition,
  actionLabel,
}: AffiliateCardProps) {
  const [links, setLinks] = useState<AffiliateLink[]>([])
  const [loading, setLoading] = useState(true)
  const [previews, setPreviews] = useState<Record<number, AffiliatePreview>>({})

  const fetchLinks = useCallback(async () => {
    setLoading(true)

    if (!linkIds?.length && !noteSlug && !locationId && !regionId) {
      setLinks([])
      setLoading(false)
      return
    }

    const params = new URLSearchParams()
    params.set('limit', String(Math.max(limit * 3, 12)))
    if (linkIds?.length) params.set('ids', linkIds.join(','))
    if (locationId) params.set('locationId', String(locationId))
    if (regionId) params.set('regionId', String(regionId))
    if (noteSlug) params.set('noteSlug', noteSlug)
    if (provider && provider !== 'all') {
      params.set('provider', provider)
    }

    const response = await fetch(`/api/affiliate-links?${params.toString()}`, {
    }).catch(() => null)
    if (!response?.ok) {
      setLinks([])
      setLoading(false)
      return
    }

    const result = await response.json().catch(() => null)
    const data = Array.isArray(result?.links) ? result.links : []
    const typePriority = getTypePriority(category)
    const normalizedLinks = data as AffiliateLink[]

    const deduped = linkIds?.length
      ? normalizedLinks
      : Array.from(new Map(normalizedLinks.map((link) => [link.url, link])).values())

    if (linkIds?.length) {
      const order = new Map(linkIds.map((id, index) => [id, index]))
      deduped.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    } else {
      deduped.sort((a, b) => {
        const scopeA = getScopePriority(getLinkScope(a, locationId, regionId, noteSlug))
        const scopeB = getScopePriority(getLinkScope(b, locationId, regionId, noteSlug))
        if (scopeA !== scopeB) return scopeA - scopeB

        const typeA = typePriority[a.link_type as keyof typeof typePriority] ?? 99
        const typeB = typePriority[b.link_type as keyof typeof typePriority] ?? 99
        if (typeA !== typeB) return typeA - typeB

        return Number(b.clicks || 0) - Number(a.clicks || 0)
      })
    }

    setLinks(deduped.slice(0, limit))
    setLoading(false)
  }, [category, limit, linkIds, locationId, provider, regionId, noteSlug])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  useEffect(() => {
    let cancelled = false

    async function loadPreviews() {
      if (!links.length) {
        setPreviews({})
        return
      }

      const entries = await Promise.all(
        links.map(async (link) => {
          try {
            const response = await fetch(`/api/affiliate-preview?url=${encodeURIComponent(link.url)}`, {
              cache: 'force-cache',
            })

            if (!response.ok) return [link.id, {}] as const

            const result = (await response.json()) as AffiliatePreview
            return [link.id, result] as const
          } catch {
            return [link.id, {}] as const
          }
        })
      )

      if (!cancelled) {
        setPreviews(Object.fromEntries(entries))
      }
    }

    loadPreviews()

    return () => {
      cancelled = true
    }
  }, [links])

  const handleClick = async (link: AffiliateLink) => {
    const eventName =
      category === 'accommodation' && link.link_type === 'hotel'
        ? 'hotel_affiliate_click'
        : link.provider === 'klook'
          ? 'klook_click'
          : link.provider === 'trip'
            ? 'trip_click'
            : 'affiliate_click'
    trackEvent(eventName, {
      page_path: window.location.pathname,
      page_type: guideSlug ? 'guide' : noteSlug ? 'note' : locationId ? 'spot' : regionId ? 'region' : 'unknown',
      page_title: document.title,
      guide_slug: guideSlug,
      day_number: dayNumber,
      region_id: regionId,
      spot_id: locationId,
      affiliate_platform: link.provider,
      affiliate_product: link.title,
      cta_position: ctaPosition || (compact ? 'sidebar' : 'inline'),
      device_type: getDeviceType(),
    })

    try {
      await fetch('/api/affiliate-click', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          affiliateLinkId: link.id,
          sessionId: getTrackingSessionId(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          referrer: typeof document !== 'undefined' ? document.referrer : '',
        }),
      })
    } catch {
      // Ignore tracking issues so bookings are not blocked.
    }

    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  const gridClassName = useMemo(() => {
    if (singleColumn) return 'grid-cols-1'
    if (links.length === 1) return 'grid-cols-1'
    if (links.length === 2) return 'grid-cols-1 xl:grid-cols-2'
    return 'grid-cols-1 md:grid-cols-2'
  }, [links.length, singleColumn])

  if (loading) {
    return (
      <Card className={`border-white/10 bg-white/5 text-white ${className}`}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="h-56 animate-pulse rounded-[24px] bg-white/5" />
          <div className="h-56 animate-pulse rounded-[24px] bg-white/5" />
        </CardContent>
      </Card>
    )
  }

  if (!links.length) {
    return null
  }

  return (
    <Card className={`border-white/10 bg-white/5 text-white ${className}`}>
      {!hideHeader ? (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-amber-200" />
            {title}
          </CardTitle>
          {description ? <CardDescription className="text-white/60">{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className={`grid gap-4 ${gridClassName}`}>
        {links.map((link) => {
          const providerName = PROVIDER_NAMES[link.provider] || link.provider
          const linkTypeName = LINK_TYPE_NAMES[link.link_type] || link.link_type
          const resolvedActionLabel = actionLabel || LINK_TYPE_ACTIONS[link.link_type] || '查看预订详情'
          const icon = PROVIDER_ICONS[link.provider] || PROVIDER_ICONS.others
          const preview = previews[link.id]
          const previewTitle = preview?.title || link.title || `通过 ${providerName} 查看${linkTypeName}`
          const previewImage =
            !looksLikeWeakPreviewImage(preview?.image)
              ? String(preview?.image || '')
              : link.locations?.image_url || link.locations?.images?.[0] || link.regions?.image_url || String(preview?.image || '')
          const hostname = preview?.hostname || providerName
          const accentClassName = PROVIDER_ACCENTS[link.provider] || PROVIDER_ACCENTS.others

          if (minimal) {
            return (
              <div key={link.id} className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border border-white/10 bg-white/10 px-2 py-0 text-[10px] text-white">{providerName}</Badge>
                    <span className="text-xs text-white/48"><PublicCopy text={"第三方价格与房况会随时变动"}/></span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm text-white/72">{previewTitle}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleClick(link)}
                  className="min-h-10 shrink-0 rounded-full bg-white px-4 text-xs text-black hover:bg-amber-50"
                >
                  {resolvedActionLabel}
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            )
          }

          if (compact) {
            return (
              <div key={link.id} className="group border-t border-white/10 py-4 first:border-t-0 first:pt-0 last:pb-0">
                <div className="flex gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.04]">
                    {previewImage ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
                        style={{ backgroundImage: `url(${previewImage})` }}
                      />
                    ) : (
                      <div className={`absolute inset-0 bg-gradient-to-br ${accentClassName}`} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <div className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/45 text-amber-100 backdrop-blur">
                      {link.link_type === 'transport' ? <Train className="h-3.5 w-3.5" /> : icon}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/42">
                      <span className="text-amber-100/80">{providerName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{linkTypeName}</span>
                    </div>
                    <h4 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-5 text-white/92">{previewTitle}</h4>
                    {link.description ? <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-white/48">{link.description}</p> : null}
                    <button
                      type="button"
                      onClick={() => handleClick(link)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-100/85 transition hover:text-amber-50"
                    >
                      {resolvedActionLabel}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={link.id} className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-black/40">
              <div
                className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
                style={previewImage ? { backgroundImage: `url(${previewImage})` } : undefined}
              />
              <div className={`absolute inset-0 bg-gradient-to-br ${accentClassName}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/45" />

              <div className="relative flex min-h-[250px] flex-col justify-between p-5">
                <div>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-amber-200 backdrop-blur-md">
                        {link.link_type === 'transport' ? <Train className="h-4 w-4" /> : icon}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border border-white/10 bg-white/10 text-white">{providerName}</Badge>
                        <Badge className="border border-white/10 bg-black/30 text-white/80">{linkTypeName}</Badge>
                      </div>
                    </div>
                  </div>

                  <h4 className="line-clamp-2 text-lg font-semibold leading-snug text-white">{previewTitle}</h4>

                  {link.description ? <p className="mt-3 max-w-xl line-clamp-3 text-sm leading-6 text-white/72">{link.description}</p> : null}
                </div>

                <div className="mt-6 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">Source</p>
                    <p className="mt-1 line-clamp-1 text-sm text-white/75">{hostname}</p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleClick(link)}
                    className="shrink-0 rounded-full bg-white text-black hover:bg-amber-50"
                  >
                    {resolvedActionLabel}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
      {showDisclosure ? (
        <CardFooter className="border-t border-white/10 pt-4 text-xs leading-6 text-white/45"><PublicCopy text={"\n          部分链接为联盟链接。通过链接预订不会增加你的费用，我们可能获得少量佣金，用于支持网站内容制作。\n        "}/></CardFooter>
      ) : null}
    </Card>
  )
}
