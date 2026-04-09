'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FallbackImage from '@/components/FallbackImage'
import AffiliateCard from '@/components/AffiliateCard'
import { hasPriceInfo, parsePriceInfo } from '@/lib/price-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Facebook,
  Instagram,
  MapPin,
  Navigation,
  X,
  Youtube,
} from 'lucide-react'
import { buildLocationPath } from '@/lib/location-routing'
import { buildRegionPath } from '@/lib/region-routing'
import { getVisibleLocationTags } from '@/lib/tag-utils'

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

interface RelatedLocation {
  id: number
  name: string
  name_cn?: string | null
  category?: string | null
  latitude: number
  longitude: number
  image_url?: string | null
  images?: string[] | null
  description?: string | null
  review?: string | null
  tags?: string[] | null
  distanceKm?: number
}

interface Location {
  id: number
  name: string
  name_cn?: string | null
  category?: string | null
  latitude: number
  longitude: number
  video_url?: string | null
  facebook_video_url?: string | null
  image_url?: string | null
  images?: string[] | null
  review?: string | null
  description?: string | null
  visit_date?: string | null
  opening_hours?: string | null
  price_info?: unknown
  address?: string | null
  tags?: string[] | null
  regions?: {
    id?: number
    name?: string | null
    name_cn?: string | null
    country?: string | null
  } | null
}

interface SpotContentProps {
  location: Location
  mode?: 'drawer' | 'page'
  onClose?: () => void
  relatedLocations?: RelatedLocation[]
}

function getYouTubeID(url: string) {
  if (!url) return null

  try {
    const parsedUrl = new URL(url)
    const host = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase()

    if (host === 'youtu.be') {
      const shortId = parsedUrl.pathname.split('/').filter(Boolean)[0]
      return shortId && shortId.length === 11 ? shortId : null
    }

    if (host.includes('youtube.com')) {
      const watchId = parsedUrl.searchParams.get('v')
      if (watchId && watchId.length === 11) return watchId

      const segments = parsedUrl.pathname.split('/').filter(Boolean)
      const directId = segments[1]

      if (['embed', 'shorts', 'live', 'v'].includes(segments[0]) && directId && directId.length === 11) {
        return directId
      }
    }
  } catch {
    // Fall back to regex parsing below.
  }

  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|live\/|watch\?v=|&v=)([^#&?]*).*/
  const match = url.match(regExp)
  return match && match[2].length === 11 ? match[2] : null
}

function normalizeFacebookUrl(url?: string | null) {
  if (!url) return ''

  return String(url)
    .replace('m.facebook.com', 'www.facebook.com')
    .replace('web.facebook.com', 'www.facebook.com')
    .trim()
}

function isEmbeddableFacebookVideoUrl(url?: string | null) {
  const cleanUrl = normalizeFacebookUrl(url)
  if (!cleanUrl) return false

  if (/facebook\.com\/share\/v\//i.test(cleanUrl)) return false

  return /facebook\.com\/.+\/(posts|videos|reel|watch|permalink)\//i.test(cleanUrl) || /story\.php|permalink\.php|video\.php|fb\.watch\//i.test(cleanUrl)
}

function isProbablyFacebookVideoUrl(url?: string | null) {
  if (!url) return false
  return /facebook\.com|fb\.watch\//i.test(url)
}

function looksLikeStructuredOpeningHours(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        ('open' in parsed || 'close' in parsed || 'closedDays' in parsed || 'is24Hours' in parsed)
    )
  } catch {
    return false
  }
}

function normalizeComparableText(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function looksLikeOpeningHoursText(value: string, openingHours?: string | null) {
  const trimmed = value.trim()
  if (!trimmed) return false

  if (looksLikeStructuredOpeningHours(trimmed)) return true

  const normalizedValue = normalizeComparableText(trimmed)
  const normalizedHours = normalizeComparableText(openingHours)

  if (normalizedHours && normalizedValue === normalizedHours) return true

  let signalCount = 0

  if (/(opening hours|business hours|daily hours|open 24 hours|closed on)/i.test(trimmed)) {
    signalCount += 1
  }

  if (/\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(trimmed) && /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(trimmed)) {
    signalCount += 1
  }

  if (/\b\d{1,2}:\d{2}\s*[-~to]{1,3}\s*\d{1,2}:\d{2}\b/i.test(trimmed)) {
    signalCount += 1
  }

  if (/^\s*(sun|mon|tue|wed|thu|fri|sat)\s*[:?-]/im.test(trimmed)) {
    signalCount += 1
  }

  return signalCount >= 2 && trimmed.length <= 500
}

function getSpotDescription(location: Pick<Location, 'description' | 'review' | 'opening_hours'>) {
  const candidates = [location.description, location.review]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    if (!looksLikeOpeningHoursText(candidate, location.opening_hours)) {
      return candidate
    }
  }

  return ''
}

function stripLeadingCurrency(value: string, currency?: string) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''

  return normalized
    .replace(/^(rm|cny|jpy|thb|idr|usd|rmb|¥|￥|\$)\s*/i, '')
    .replace(currency ? new RegExp(`^${currency}\\s*`, 'i') : /$^/, '')
    .trim()
}

function formatBudgetLabel(value: string, currency?: string) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(rm|cny|jpy|thb|idr|usd|rmb|¥|￥|\$)/i.test(raw)) return raw
  return currency ? `${currency} ${raw}` : raw
}

function buildDualBudgetLabel(primaryValue: string, primaryCurrency?: string, secondaryValue?: string, secondaryCurrency?: string) {
  const primary = formatBudgetLabel(primaryValue, primaryCurrency)
  const secondary = formatBudgetLabel(String(secondaryValue || ''), secondaryCurrency)

  return {
    primary,
    secondary: secondary && secondary !== primary ? secondary : '',
  }
}

function extractFirstNumericAmount(value: string) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : null
}

function formatCompactAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

function XHSIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M839.6 429.2c-15.6-8.8-31.2-17.2-46.8-25.2-3.6-2-6.8-4-10.4-6-1.2-0.8-2.8-1.6-4-2.4 16.4-55.6 15.2-114.4 3.2-172-2.8-12.8-12.8-22.8-25.6-25.2-13.2-2.8-26.8 4.4-32.8 16.4-10.8 21.6-18.4 44-24.8 66.8-14.8-15.2-30.8-29.2-48-41.6-4.4-3.2-9.2-6-14-8.8-11.6-6.4-26-4.8-35.6 4.4-9.6 9.2-12 23.6-6 35.6 1.2 2.4 2.8 4.8 4.4 7.2 10 14.8 20.8 29.2 32.8 42.8-16 25.6-32.8 50.8-51.6 74.8-2.4-2.8-4.8-5.6-7.2-8.4-17.6-20.8-36.4-40.4-56.4-58.8-12.4-11.2-30.8-12.4-44.8-2.8-14 9.6-19.6 27.2-13.6 42.8 10 24 23.6 46.8 39.2 68 8.8 12 18.4 23.2 28.4 34-19.6 17.6-38.4 36-56 55.2-16.4 18-31.6 37.2-44.8 58-13.2 20.4-23.2 42.8-28.8 66.4-2.4 9.6-3.2 19.2-2.8 29.2 0.8 19.2 8.4 37.6 21.2 52 16.4 18.8 40.8 29.2 66 28.4 56.4-2 106.8-34 148.8-71.6 4.8 14.8 10 29.6 15.6 44 23.2 60 55.6 116.8 96.8 166.4 2.8 3.2 5.6 6.4 8.4 9.2 11.6 11.2 29.2 12.8 42.8 4 13.6-8.8 19.6-26 14.8-41.2-1.2-3.6-2.4-7.2-3.6-10.8-23.6-66-40.4-135.2-48.8-206.4 32.8 21.2 67.2 38.8 103.6 52.8 27.6 10.4 56 18.4 84.8 24 16.4 3.2 33.2-6.4 38.8-22 5.6-15.6-1.6-32.8-16-40-62.8-32-119.6-76-166.4-128.4 17.6-35.2 32.8-72 45.6-109.6 15.6 8 31.6 16.4 46.8 25.2 14.4 8.4 32.4 5.2 42.8-7.6 10.8-12.8 10-31.6-1.6-43.2z m-464 425.2c-15.2-18.4-27.6-39.2-36.4-61.6-4.8-12-8.4-24.4-10.4-37.2 18.4-18.8 38-36.8 58.4-53.6 16.4 28.4 30.4 58.4 41.2 89.6-18 22.4-35.6 43.6-52.8 62.8z" />
    </svg>
  )
}

function SocialLink({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white transition-transform hover:scale-105 ${color}`}
    >
      {icon}
      <span>{label}</span>
    </a>
  )
}

function RelatedLocationCard({ location }: { location: RelatedLocation }) {
  const coverImage = location.image_url || location.images?.[0] || '/placeholder-image.jpg'

  return (
    <Link
      href={buildLocationPath(location.name, location.id)}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
        <FallbackImage
          src={coverImage}
          alt={location.name}
          fill
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        {location.category ? (
          <div className="absolute left-3 top-3">
            <Badge className="border border-white/10 bg-black/50 text-white">
              {location.category === 'food' ? '美食' : location.category === 'accommodation' ? '住宿' : '景点'}
            </Badge>
          </div>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <h4 className="line-clamp-1 text-base font-semibold text-white">{location.name}</h4>
          {location.name_cn ? <p className="line-clamp-1 text-sm text-gray-400">{location.name_cn}</p> : null}
        </div>
        {location.distanceKm !== undefined ? (
          <p className="text-xs text-amber-200">约 {location.distanceKm.toFixed(1)} km</p>
        ) : null}
        <p className="line-clamp-2 text-sm text-gray-300">{location.description || location.review || '查看这个景点的图片、地图和更多资讯。'}</p>
      </div>
    </Link>
  )
}

export default function SpotContent({ location, mode = 'drawer', onClose, relatedLocations = [] }: SpotContentProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [youtubeEmbedFailed, setYoutubeEmbedFailed] = useState(false)
  const [facebookEmbedFailed, setFacebookEmbedFailed] = useState(false)
  const [resolvedFacebookUrl, setResolvedFacebookUrl] = useState('')
  const [resolvingFacebookUrl, setResolvingFacebookUrl] = useState(false)
  const [failedImages, setFailedImages] = useState<string[]>([])
  const [copiedField, setCopiedField] = useState<'address' | 'coords' | ''>('')
  const visibleTags = getVisibleLocationTags(location.tags)
  const isDrawer = mode === 'drawer'
  const locationPath = buildLocationPath(location.name, location.id)
  const regionPath = location.regions?.id && location.regions?.name ? buildRegionPath(location.regions.name, location.regions.id) : null

  const allImages = useMemo(() => {
    if (Array.isArray(location.images) && location.images.length > 0) {
      return Array.from(new Set(location.image_url ? [location.image_url, ...location.images] : location.images))
    }
    return location.image_url ? [location.image_url] : []
  }, [location.image_url, location.images])

  const validImages = useMemo(
    () => allImages.filter((imageUrl) => !failedImages.includes(imageUrl)),
    [allImages, failedImages]
  )

  const videoId = location.video_url ? getYouTubeID(location.video_url) : null
  const hasYoutubeLink = Boolean(String(location.video_url || '').trim())
  const hasFacebookLink = Boolean(String(location.facebook_video_url || '').trim())
  const facebookVideoUrl = resolvedFacebookUrl || location.facebook_video_url || ''
  const shouldShowYoutube = Boolean(videoId && !youtubeEmbedFailed)
  const shouldAttemptFacebookPreview = Boolean(
    hasFacebookLink &&
      isProbablyFacebookVideoUrl(facebookVideoUrl) &&
      !facebookEmbedFailed
  )
  const spotDescription = useMemo(() => getSpotDescription(location), [location])
  const priceInfo = useMemo(() => parsePriceInfo(location.price_info), [location.price_info])
  const hasPriceSnapshot = useMemo(() => hasPriceInfo(priceInfo), [priceInfo])
  const mediaFallbackImage = location.image_url || validImages[0] || '/placeholder-image.jpg'
  const formattedMealBudget = useMemo(() => {
    if (!priceInfo.mealBudget) return null

    const totalBudget = buildDualBudgetLabel(
      priceInfo.mealBudget,
      priceInfo.currency,
      priceInfo.mealBudgetSecondary,
      priceInfo.secondaryCurrency
    )
    const totalLabel = totalBudget.primary
    const baseAmount = extractFirstNumericAmount(stripLeadingCurrency(priceInfo.mealBudget, priceInfo.currency))
    const secondaryAmount = extractFirstNumericAmount(stripLeadingCurrency(priceInfo.mealBudgetSecondary, priceInfo.secondaryCurrency))

    if (!baseAmount || (priceInfo.mealPartySize || 1) <= 1) {
      return {
        primary: totalBudget.primary,
        secondary: totalBudget.secondary,
        perPersonPrimary: '',
        perPersonSecondary: '',
      }
    }

    const perPerson = baseAmount / priceInfo.mealPartySize
    const perPersonLabel = formatBudgetLabel(formatCompactAmount(perPerson), priceInfo.currency)
    const secondaryPerPersonLabel =
      secondaryAmount && (priceInfo.mealPartySize || 1) > 1
        ? formatBudgetLabel(formatCompactAmount(secondaryAmount / priceInfo.mealPartySize), priceInfo.secondaryCurrency)
        : ''

    return {
      primary: `${priceInfo.mealPartySize}人约 ${totalLabel}`,
      secondary: totalBudget.secondary ? `${priceInfo.mealPartySize}人约 ${totalBudget.secondary}` : '',
      perPersonPrimary: `人均 ${perPersonLabel}`,
      perPersonSecondary: secondaryPerPersonLabel ? `Per pax ${secondaryPerPersonLabel}` : '',
    }
  }, [
    priceInfo.currency,
    priceInfo.mealBudget,
    priceInfo.mealBudgetSecondary,
    priceInfo.mealPartySize,
    priceInfo.secondaryCurrency,
  ])
  const hasTieredAdmission =
    Boolean(priceInfo.admissionLocalAdult || priceInfo.admissionLocalChild || priceInfo.admissionForeignAdult || priceInfo.admissionForeignChild)
  const isFoodSpot = location.category === 'food'
  const isAttractionSpot = location.category === 'attraction'
  const showAdmissionPricing = isAttractionSpot && (hasTieredAdmission || priceInfo.admissionAdult || priceInfo.admissionChild || priceInfo.isFree)
  const showParkingPricing = isAttractionSpot && Boolean(priceInfo.parkingBudget)
  const showMealPricing = isFoodSpot && Boolean(formattedMealBudget)
  const showCustomPricing = isAttractionSpot && Array.isArray(priceInfo.customItems) && priceInfo.customItems.length > 0
  const showPriceInfoImages = Array.isArray(priceInfo.infoImages) && priceInfo.infoImages.length > 0
  const shouldShowPriceSnapshot =
    hasPriceSnapshot &&
    location.category !== 'accommodation' &&
    (showAdmissionPricing ||
      showMealPricing ||
      showParkingPricing ||
      showCustomPricing ||
      showPriceInfoImages ||
      Boolean(priceInfo.notes || priceInfo.priceSource || priceInfo.lastCheckedAt))

  const socialLinks = [
    { href: 'https://www.youtube.com/@jnqjourney', icon: <Youtube className="h-3 w-3" />, label: 'YouTube', color: 'bg-red-600' },
    { href: 'https://www.facebook.com/jnqjourney', icon: <Facebook className="h-3 w-3" />, label: 'Facebook', color: 'bg-blue-600' },
    { href: 'https://www.instagram.com/jnqjourney', icon: <Instagram className="h-3 w-3" />, label: 'Instagram', color: 'bg-pink-600' },
    { href: 'https://www.tiktok.com/@jnqjourney', icon: <TikTokIcon className="h-3 w-3" />, label: 'TikTok', color: 'border border-white/20 bg-black' },
    { href: 'https://www.xiaohongshu.com/user/profile/60ab1c5d000000000101def8', icon: <XHSIcon className="h-3 w-3" />, label: 'Xiaohongshu', color: 'bg-red-500' },
  ]

  useEffect(() => {
    if (currentImageIndex >= validImages.length && validImages.length > 0) {
      setCurrentImageIndex(0)
    }
  }, [currentImageIndex, validImages.length])

  useEffect(() => {
    if (!copiedField) return

    const timer = window.setTimeout(() => setCopiedField(''), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedField])

  useEffect(() => {
    setYoutubeEmbedFailed(false)
  }, [location.id, location.video_url])

  useEffect(() => {
    setFacebookEmbedFailed(false)
    setResolvedFacebookUrl('')
  }, [location.id, location.facebook_video_url])

  useEffect(() => {
    let cancelled = false

    const resolveFacebookUrl = async () => {
      const sourceUrl = String(location.facebook_video_url || '').trim()

      if (!sourceUrl || !isProbablyFacebookVideoUrl(sourceUrl) || isEmbeddableFacebookVideoUrl(sourceUrl)) {
        return
      }

      try {
        setResolvingFacebookUrl(true)
        const response = await fetch(`/api/facebook-video-resolve?url=${encodeURIComponent(sourceUrl)}`, {
          cache: 'no-store',
        })

        if (!response.ok) return

        const result = await response.json()
        if (!cancelled && result?.resolvedUrl) {
          setResolvedFacebookUrl(String(result.resolvedUrl))
        }
      } catch {
        // Keep the original URL as fallback.
      } finally {
        if (!cancelled) {
          setResolvingFacebookUrl(false)
        }
      }
    }

    resolveFacebookUrl()

    return () => {
      cancelled = true
    }
  }, [location.id, location.facebook_video_url])

  const nextImage = () => {
    if (validImages.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % validImages.length)
    }
  }

  const prevImage = () => {
    if (validImages.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + validImages.length) % validImages.length)
    }
  }

  const isChinaLocation = String(location.regions?.country || '').trim().toLowerCase() === 'china'
  const mapQuery = encodeURIComponent([location.name, location.name_cn, location.address].filter(Boolean).join(' '))
  const affiliateTitle =
    location.category === 'accommodation'
      ? '住宿预订'
      : location.category === 'food'
        ? 'Nearby Booking / 周边预订'
        : '预订推荐'
  const affiliateDescription = hasPriceSnapshot
    ? ''
    : '票价、住宿和体验价会按日期浮动，建议直接打开预订页看最新价。'

  const handleNavigateGoogle = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${mapQuery || `${location.latitude},${location.longitude}`}`, '_blank')
  }

  const handleNavigateWaze = () => {
    window.open(`https://www.waze.com/ul?ll=${location.latitude},${location.longitude}&z=17`, '_blank')
  }

  const handleOpenBaiduMap = () => {
    const title = encodeURIComponent(location.name_cn || location.name)
    const content = encodeURIComponent(location.address || location.name_cn || location.name)
    window.open(
      `https://api.map.baidu.com/marker?location=${location.latitude},${location.longitude}&title=${title}&content=${content}&output=html&src=jnqjourney`,
      '_blank'
    )
  }

  const handleCopy = async (value: string, field: 'address' | 'coords') => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
    } catch {
      setCopiedField('')
    }
  }

  const pageShellClassName = isDrawer
    ? 'mx-auto w-full max-w-2xl overflow-y-auto pb-4 scrollbar-hide'
    : 'mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10'

  return (
    <div className={pageShellClassName}>
      {!isDrawer ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">JnQ Journey Spot</p>
            <h1 className="mt-2 text-3xl font-bold text-white md:text-5xl">{location.name}</h1>
            {location.name_cn ? <p className="mt-2 text-lg text-gray-400 md:text-2xl">{location.name_cn}</p> : null}
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <MapPin className="h-4 w-4" />
            Back to map
          </Link>
        </div>
      ) : null}

      {(hasYoutubeLink || hasFacebookLink) ? (
        <section className={`mb-4 grid gap-4 ${hasYoutubeLink && hasFacebookLink ? 'md:grid-cols-2' : 'grid-cols-1 max-w-3xl'}`}>
          {hasYoutubeLink ? (
            <div className="overflow-hidden rounded-3xl border border-red-500/20 bg-black/85 shadow-[0_24px_70px_-40px_rgba(239,68,68,0.5)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-red-200/70">YouTube</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">Video Preview</h3>
                </div>
                <a
                  href={location.video_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                >
                  Watch on YouTube
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="aspect-video bg-black">
                {shouldShowYoutube ? (
                  <ReactPlayer
                    src={location.video_url || ''}
                    width="100%"
                    height="100%"
                    controls
                    playsInline
                    onError={() => setYoutubeEmbedFailed(true)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-6">
                    <a
                      href={location.video_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 rounded-full border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-100 transition hover:bg-red-500/15"
                    >
                      <Youtube className="h-4 w-4" />
                      Open YouTube video
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {hasFacebookLink ? (
            <div className="overflow-hidden rounded-3xl border border-blue-500/20 bg-black/85 shadow-[0_24px_70px_-40px_rgba(59,130,246,0.5)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/70">Facebook</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">Preview</h3>
                </div>
                <a
                  href={facebookVideoUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                >
                  {resolvingFacebookUrl ? 'Resolving...' : 'Watch on Facebook'}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="aspect-video bg-black">
                {shouldAttemptFacebookPreview ? (
                  <ReactPlayer
                    src={facebookVideoUrl}
                    width="100%"
                    height="100%"
                    controls
                    playsInline
                    onError={() => setFacebookEmbedFailed(true)}
                  />
                ) : (
                  <div className="relative h-full overflow-hidden">
                    <FallbackImage
                      src={mediaFallbackImage}
                      alt={`${location.name} Facebook preview`}
                      fill
                      className="object-cover opacity-70"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/15" />
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                      <a
                        href={facebookVideoUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 rounded-full border border-blue-500/30 bg-blue-500/10 px-5 py-3 text-sm text-blue-100 transition hover:bg-blue-500/15"
                      >
                        <Facebook className="h-4 w-4" />
                        Open Facebook video
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {validImages.length > 0 ? (
        <div className="group relative h-[42vh] min-h-[250px] w-full max-h-[560px] overflow-hidden rounded-t-2xl bg-neutral-900 md:h-[50vh] md:min-h-[320px]">
          <div className="absolute inset-0 z-0">
            <FallbackImage src={validImages[currentImageIndex]} alt="background blur" fill className="scale-110 object-cover blur-2xl opacity-30" priority />
          </div>
          <div className="relative z-10 h-full w-full p-0.5 transition-transform duration-500 ease-out md:p-4">
            <FallbackImage
              src={validImages[currentImageIndex]}
              alt={location.name}
              fill
              className="object-contain drop-shadow-2xl"
              priority
              onError={() =>
                setFailedImages((prev) =>
                  validImages[currentImageIndex] && !prev.includes(validImages[currentImageIndex])
                    ? [...prev, validImages[currentImageIndex]]
                    : prev
                )
              }
            />
          </div>

          {isDrawer && onClose ? (
            <Button variant="ghost" size="icon" onClick={onClose} className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 md:right-4 md:top-4">
              <X className="h-5 w-5" />
            </Button>
          ) : null}

          {validImages.length > 1 ? (
            <>
              <button onClick={(event) => { event.stopPropagation(); prevImage() }} className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white opacity-100 backdrop-blur-sm transition-all hover:bg-black/50 md:p-2 md:opacity-0 md:group-hover:opacity-100">
                <ChevronLeft className="h-5 w-5 md:h-8 md:w-8" />
              </button>
              <button onClick={(event) => { event.stopPropagation(); nextImage() }} className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white opacity-100 backdrop-blur-sm transition-all hover:bg-black/50 md:p-2 md:opacity-0 md:group-hover:opacity-100">
                <ChevronRight className="h-5 w-5 md:h-8 md:w-8" />
              </button>
              <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/30 px-2.5 py-1 backdrop-blur-sm md:bottom-4 md:gap-2 md:px-3">
                {validImages.map((_, index) => (
                  <div key={index} className={`h-1.5 rounded-full transition-all duration-300 ${index === currentImageIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : !(hasYoutubeLink || hasFacebookLink) ? (
        <div className="relative flex aspect-video w-full items-center justify-center rounded-t-2xl bg-muted text-muted-foreground">
          <span className="text-sm">No images or videos available yet.</span>
          {isDrawer && onClose ? (
            <Button variant="ghost" size="icon" onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full bg-black/50 text-white hover:bg-black/70">
              <X className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5 bg-black/80 px-4 py-5 text-white md:space-y-6 md:px-6 md:py-6">
        <div className="flex flex-col gap-3.5 md:gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col">
              {isDrawer ? <h2 className="text-[1.9rem] font-extrabold tracking-tight md:text-4xl">{location.name}</h2> : null}
              {location.name_cn ? <span className="mt-1 text-lg font-semibold text-gray-400 md:text-2xl">{location.name_cn}</span> : null}
              {(location.regions?.name || location.regions?.country) ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-gray-400 md:mt-3 md:text-sm">
                  <span>{[location.regions?.country, location.regions?.name].filter(Boolean).join(' / ')}</span>
                  {regionPath ? (
                    <Link href={regionPath} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/90 transition hover:bg-white/10 md:px-3 md:text-xs">
                      View region
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {location.category ? (
                <Badge className={`border px-2.5 py-1 text-[11px] uppercase tracking-wider shadow-sm md:px-3 md:text-sm ${
                  location.category === 'food'
                    ? 'border-orange-500/30 bg-orange-500/20 text-orange-200'
                    : location.category === 'accommodation'
                      ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200'
                      : 'border-blue-500/30 bg-blue-500/20 text-blue-200'
                }`}>
                  {location.category === 'food' ? 'Food' : location.category === 'accommodation' ? 'Stay' : 'Spot'}
                </Badge>
              ) : null}
              {visibleTags[0] ? <Badge className="border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white shadow-sm md:px-3 md:text-sm">{visibleTags[0]}</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 py-1">
            {socialLinks.map((link) => (
              <SocialLink key={link.label} {...link} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-gray-400">
            <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1">
              <MapPin className="h-4 w-4 text-amber-400" />
              <span>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
            </div>
            {location.visit_date ? (
              <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1">
                <span className="font-bold text-amber-400">DATE</span>
                <span>{new Date(location.visit_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}</span>
              </div>
            ) : null}
          </div>
        </div>

        {location.address ? (
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="rounded-lg bg-sky-400/15 p-2">
              <MapPin className="h-5 w-5 text-sky-300" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-sky-100">Address / 地址</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-white hover:bg-white/10"
                  onClick={() => handleCopy(location.address || '', 'address')}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {copiedField === 'address' ? '地址已复制' : '复制地址'}
                </Button>
              </div>
              <p className="text-sm leading-6 text-gray-200">{location.address}</p>
            </div>
          </div>
        ) : null}

        {location.opening_hours ? (
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <div className="rounded-lg bg-amber-400/20 p-2">
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-200">Opening Hours</h4>
              {(() => {
                try {
                  const data = JSON.parse(location.opening_hours || '')
                  if (data && typeof data === 'object' && ('open' in data || 'close' in data || 'is24Hours' in data || 'isUnknown' in data)) {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                    const formatTime = (time: string) => {
                      if (!time) return ''
                      const [hourRaw, minute] = time.split(':')
                      const hour = Number(hourRaw)
                      const ampm = hour >= 12 ? 'PM' : 'AM'
                      const hour12 = hour % 12 || 12
                      return `${hour12}:${minute} ${ampm}`
                    }

                    if (data.isUnknown) {
                      return (
                        <div className="space-y-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-semibold text-white">No information</span>
                            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-300">
                              待确认
                            </span>
                          </div>
                          {data.remarks ? <p className="text-xs leading-6 text-gray-300">{String(data.remarks).trim()}</p> : null}
                        </div>
                      )
                    }

                    const recurringHours =
                      typeof data.remarks === 'string' && data.remarks.startsWith('营业时段：')
                        ? data.remarks.replace(/^营业时段：/, '').trim()
                        : ''
                    const primaryHours = data.is24Hours
                      ? '24 Hours'
                      : recurringHours || `${formatTime(data.open)} - ${formatTime(data.close)}`
                    return (
                      <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-semibold text-white">{primaryHours}</span>
                          {Array.isArray(data.closedDays) && data.closedDays.length > 0 ? (
                            <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                              休息日：{data.closedDays.map((day: number) => days[day]).join(', ')}
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                              每天开放
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  }
                } catch {
                  // Fall back to plain text below.
                }

                return <p className="whitespace-pre-line text-gray-200">{location.opening_hours}</p>
              })()}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {shouldShowPriceSnapshot ? (
              <div className="overflow-hidden rounded-[32px] border border-amber-300/18 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.15),transparent_30%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.24)] md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-amber-200/80">Price Guide / 花费参考</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white md:text-[1.95rem]">
                      {isFoodSpot ? 'Food Budget / 吃喝预算' : 'Entry & Spend / 门票与花费'}
                    </h3>
                  </div>
                  {priceInfo.isFree ? (
                    <Badge className="border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-emerald-100">
                      Free Entry / 免费入场
                    </Badge>
                  ) : null}
                </div>

                <div className={`mt-5 grid gap-4 ${isFoodSpot ? 'md:grid-cols-1 xl:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
                  {showAdmissionPricing ? (
                    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Admission / 门票</p>
                      <div className="mt-4 space-y-3 text-sm">
                        {priceInfo.admissionLocalAdult ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Local Adult / 本地成人</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.admissionLocalAdult, priceInfo.currency, priceInfo.admissionLocalAdultSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.admissionLocalAdult, priceInfo.currency, priceInfo.admissionLocalAdultSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.admissionLocalAdult, priceInfo.currency, priceInfo.admissionLocalAdultSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {priceInfo.admissionLocalChild ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Local Child / 本地小孩</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.admissionLocalChild, priceInfo.currency, priceInfo.admissionLocalChildSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.admissionLocalChild, priceInfo.currency, priceInfo.admissionLocalChildSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.admissionLocalChild, priceInfo.currency, priceInfo.admissionLocalChildSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {priceInfo.admissionForeignAdult ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Foreign Adult / 外国成人</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.admissionForeignAdult, priceInfo.currency, priceInfo.admissionForeignAdultSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.admissionForeignAdult, priceInfo.currency, priceInfo.admissionForeignAdultSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.admissionForeignAdult, priceInfo.currency, priceInfo.admissionForeignAdultSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {priceInfo.admissionForeignChild ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Foreign Child / 外国小孩</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.admissionForeignChild, priceInfo.currency, priceInfo.admissionForeignChildSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.admissionForeignChild, priceInfo.currency, priceInfo.admissionForeignChildSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.admissionForeignChild, priceInfo.currency, priceInfo.admissionForeignChildSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {priceInfo.admissionAdult ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Adult / 成人</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.admissionAdult, priceInfo.currency, priceInfo.admissionAdultSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.admissionAdult, priceInfo.currency, priceInfo.admissionAdultSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.admissionAdult, priceInfo.currency, priceInfo.admissionAdultSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {priceInfo.admissionChild ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Child / 儿童</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.admissionChild, priceInfo.currency, priceInfo.admissionChildSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.admissionChild, priceInfo.currency, priceInfo.admissionChildSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.admissionChild, priceInfo.currency, priceInfo.admissionChildSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {priceInfo.isFree && !hasTieredAdmission && !priceInfo.admissionAdult && !priceInfo.admissionChild ? (
                          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                            This spot is free to enter. / 这个景点可免费进入。
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {showMealPricing ? (
                    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Meals / 吃喝参考</p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-gray-400">Estimated Total / 总价参考</span>
                          <span className="text-right font-medium text-white">{formattedMealBudget?.primary}</span>
                        </div>
                        {formattedMealBudget?.secondary ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Estimated Total / 第二币种</span>
                            <span className="text-right font-medium text-amber-100">{formattedMealBudget.secondary}</span>
                          </div>
                        ) : null}
                        {formattedMealBudget?.perPersonPrimary ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Per Person / 人均</span>
                            <span className="text-right font-medium text-white">{formattedMealBudget.perPersonPrimary}</span>
                          </div>
                        ) : null}
                        {formattedMealBudget?.perPersonSecondary ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Per Person / 第二币种人均</span>
                            <span className="text-right font-medium text-amber-100">{formattedMealBudget.perPersonSecondary}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {showParkingPricing ? (
                    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Parking / 停车费</p>
                      <div className="mt-4 space-y-3 text-sm">
                        {showParkingPricing ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-gray-400">Parking / 停车费</span>
                            <span className="text-right font-medium text-white">
                              {buildDualBudgetLabel(priceInfo.parkingBudget, priceInfo.currency, priceInfo.parkingBudgetSecondary, priceInfo.secondaryCurrency).primary}
                              {buildDualBudgetLabel(priceInfo.parkingBudget, priceInfo.currency, priceInfo.parkingBudgetSecondary, priceInfo.secondaryCurrency).secondary ? (
                                <span className="mt-1 block text-xs font-normal text-amber-100">
                                  {buildDualBudgetLabel(priceInfo.parkingBudget, priceInfo.currency, priceInfo.parkingBudgetSecondary, priceInfo.secondaryCurrency).secondary}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {showCustomPricing ? (
                    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 md:col-span-2 xl:col-span-2">
                      <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Extra Cost Notes / 补充费用资讯</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {priceInfo.customItems.map((item, index) => (
                          <div key={`${item.label}-${item.value}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium text-white">{item.label || item.labelEn || '附加项目'}</div>
                                {item.labelEn && item.labelEn !== item.label ? (
                                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/45">{item.labelEn}</div>
                                ) : null}
                              </div>
                              {item.value || item.valueSecondary ? (
                                <div className="text-right font-semibold text-amber-100">
                                  {item.value ? <div>{item.value}</div> : null}
                                  {item.valueSecondary ? <div className="mt-1 text-xs font-normal text-white/70">{item.valueSecondary}</div> : null}
                                </div>
                              ) : null}
                            </div>
                            {item.note ? <p className="mt-3 text-sm leading-6 text-gray-300">{item.note}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {showPriceInfoImages ? (
                  <div className="mt-5 rounded-[24px] border border-white/10 bg-black/15 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Price Board / 现场价目图</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {priceInfo.infoImages.map((url, index) => (
                        <a
                          key={`${url}-${index}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group overflow-hidden rounded-[22px] border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:bg-white/10"
                        >
                          <div className="relative aspect-[4/3] overflow-hidden">
                            <FallbackImage
                              src={url}
                              alt={`price info ${index + 1}`}
                              fill
                              sizes="(max-width: 768px) 100vw, 420px"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                          </div>
                          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/88">
                            <span>Open image / 查看原图</span>
                            <ExternalLink className="h-4 w-4" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(priceInfo.notes || priceInfo.priceSource || priceInfo.lastCheckedAt) ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-xs text-gray-300">
                    {priceInfo.notes ? <span className="text-gray-300">{priceInfo.notes}</span> : null}
                    {priceInfo.priceSource ? <span>Source / 来源: {priceInfo.priceSource}</span> : null}
                    {priceInfo.lastCheckedAt ? <span>Checked / 核对日期: {priceInfo.lastCheckedAt}</span> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
                <span className="h-6 w-1 rounded-full bg-amber-400"></span>
                景点资讯
              </h3>
              {spotDescription ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-inner backdrop-blur-md">
                  <div className="whitespace-pre-line text-lg leading-relaxed text-gray-200">{spotDescription}</div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
                  <p className="italic text-gray-400">这条景点目前还没有整理好的介绍内容。</p>
                </div>
              )}
            </div>

            {!isDrawer && relatedLocations.length > 0 ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">Continue Exploring</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">Nearby in the same area</h3>
                  </div>
                  {regionPath ? (
                    <Link href={regionPath} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10">
                      View more in this region
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {relatedLocations.map((item) => (
                    <RelatedLocationCard key={item.id} location={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="space-y-4">
            {!isDrawer ? (
              <AffiliateCard
                locationId={location.id}
                regionId={location.regions?.id}
                category={location.category}
                title={affiliateTitle}
                description={affiliateDescription}
                showDisclosure={false}
              />
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">{isDrawer ? 'Quick Actions' : 'Navigation Maps'}</p>
              <div className="mt-4 grid gap-3">
                {isChinaLocation ? (
                  <>
                    <Button className="h-12 gap-3 rounded-xl bg-[#2b66f6] text-white hover:bg-[#1f54d6]" onClick={handleOpenBaiduMap}>
                      <MapPin className="h-5 w-5 fill-current" />
                      Open Baidu Maps
                    </Button>
                    <Button className="h-12 gap-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={handleNavigateGoogle}>
                      <Navigation className="h-5 w-5 fill-current" />
                      Open Google Maps
                    </Button>
                  </>
                ) : (
                  <>
                    <Button className="h-12 gap-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={handleNavigateGoogle}>
                      <Navigation className="h-5 w-5 fill-current" />
                      Open Google Maps
                    </Button>
                    <Button className="h-12 gap-3 rounded-xl bg-cyan-500 text-white hover:bg-cyan-600" onClick={handleNavigateWaze}>
                      <Navigation className="h-5 w-5" />
                      Open Waze
                    </Button>
                  </>
                )}
                {location.address ? (
                  <Button
                    variant="outline"
                    className="h-12 gap-3 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => handleCopy(location.address || '', 'address')}
                  >
                    <Copy className="h-4 w-4" />
                    {copiedField === 'address' ? '地址已复制' : '复制地址'}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="h-12 gap-3 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => handleCopy(`${location.latitude}, ${location.longitude}`, 'coords')}
                >
                  <Copy className="h-4 w-4" />
                  {copiedField === 'coords' ? '坐标已复制' : '复制坐标'}
                </Button>
                  {isDrawer ? (
                  <Link href={locationPath} className="inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-white transition hover:bg-white/10">
                    <ExternalLink className="h-4 w-4" />
                    Open spot page
                  </Link>
                ) : (
                  <>
                    {regionPath ? (
                      <Link href={regionPath} className="inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-white transition hover:bg-white/10">
                        <ExternalLink className="h-4 w-4" />
                        查看这个区域
                      </Link>
                    ) : null}
                    <Link href="/" className="inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-white transition hover:bg-white/10">
                      <MapPin className="h-4 w-4" />
                      返回地图
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/12 via-white/5 to-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Ask Jayden & Qing</p>
              <h4 className="mt-3 text-lg font-semibold text-white">Questions about this spot?</h4>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                Leave a comment under our video or on our Facebook Page if you want route tips, travel advice, or spot updates.
              </p>
              <div className="mt-4 grid gap-3">
                <a
                  href={location.video_url || 'https://www.youtube.com/@jnqjourney'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-3 rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-500"
                >
                  <Youtube className="h-4 w-4" />
                  {location.video_url ? 'Comment on this video' : 'Open YouTube channel'}
                </a>
                <a
                  href={location.facebook_video_url || 'https://www.facebook.com/jnqjourney'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-3 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  <Facebook className="h-4 w-4" />
                  {location.facebook_video_url ? 'Open this Facebook post' : 'Open Facebook Page'}
                </a>
              </div>
            </div>

          </div>
        </div>

        {isDrawer && onClose ? (
          <div className="pt-2">
            <Button variant="ghost" onClick={onClose} className="h-12 w-full rounded-xl text-base text-gray-400 hover:bg-white/10 hover:text-white">
              关闭
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

