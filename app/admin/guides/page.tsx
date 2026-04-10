'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import { DEFAULT_GUIDE_COVER_ACCENT, EMPTY_GUIDE, type TravelGuide } from '@/lib/guides'
import FallbackImage from '@/components/FallbackImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const GUIDE_BUDGET_CURRENCIES = ['RM', 'CNY', 'JPY', 'THB', 'IDR', 'USD']

interface RegionOption {
  id: number
  name: string
  name_cn?: string | null
  country?: string | null
}

interface LocationOption {
  id: number
  name: string
  name_cn?: string | null
  category?: string | null
  visit_date?: string | null
  image_url?: string | null
  images?: string[] | null
  address?: string | null
  region_id?: number | null
  latitude?: number | null
  longitude?: number | null
  regions?: RegionOption | null
}

interface AffiliateLinkOption {
  id: number
  title?: string | null
  provider: string
  link_type: string
  location_id?: number | null
  region_id?: number | null
  is_active?: boolean | null
  locations?: {
    name?: string | null
    name_cn?: string | null
  } | null
  regions?: {
    name?: string | null
    name_cn?: string | null
    country?: string | null
  } | null
}

function slugify(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildDurationToken(value: string) {
  const daysNights = String(value || '').match(/(\d+)\s*days?.*?(\d+)\s*nights?/i)
  if (daysNights) return `${daysNights[1]}d${daysNights[2]}n`

  const numbers = String(value || '').match(/\d+/g)
  if (numbers?.length === 2) return `${numbers[0]}d${numbers[1]}n`
  if (numbers?.length === 1) return `${numbers[0]}d`
  return ''
}

function regionDisplayName(region?: RegionOption | null) {
  if (!region) return 'Unassigned region'
  return region.name_cn || region.name
}

function locationDisplayName(location?: LocationOption | null) {
  if (!location) return ''
  return location.name_cn || location.name
}

function locationAltName(location?: LocationOption | null) {
  if (!location) return ''
  const primary = String(locationDisplayName(location) || '').trim()
  const english = String(location.name || '').trim()
  const chinese = String(location.name_cn || '').trim()
  const alt = primary === chinese ? english : chinese
  return alt && alt !== primary ? alt : ''
}

function matchesLocationIdentity(location: LocationOption | null | undefined, value: string) {
  const target = compactSearchText(normalizeSearchText(value))
  if (!location || !target) return false

  return [
    location.name,
    location.name_cn,
    locationDisplayName(location),
    locationAltName(location),
  ]
    .map((item) => compactSearchText(normalizeSearchText(String(item || ''))))
    .filter(Boolean)
    .includes(target)
}

function locationRegionLabel(location?: LocationOption | null) {
  if (!location?.regions) return 'Unassigned region'
  const parts = [location.regions.country, regionDisplayName(location.regions)].filter(Boolean)
  return parts.join(' / ')
}

function getLocationCover(location?: Pick<LocationOption, 'image_url' | 'images'> | null) {
  return location?.image_url || location?.images?.[0] || '/placeholder-image.jpg'
}

function arrayToLines(value?: string[]) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function linesToArray(value: string) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function moveArrayItem<T>(items: T[], index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= items.length) return items
  const next = [...items]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

function moveArrayItemToEdge<T>(items: T[], index: number, edge: 'start' | 'end') {
  if (index < 0 || index >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  if (edge === 'start') {
    next.unshift(item)
  } else {
    next.push(item)
  }
  return next
}

function parseGuideDayNumber(dayLabel?: string | null) {
  const match = String(dayLabel || '').match(/day\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

function parseDayRange(dayLabel?: string | null) {
  const match = String(dayLabel || '').match(/day\s*(\d+)(?:\s*[-~to]+\s*(\d+))?/i)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2] || match[1])
  return { start, end: end >= start ? end : start }
}

function formatVisitDate(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeSearchText(value?: string | null) {
  return String(value || '').toLowerCase().trim()
}

function compactSearchText(value?: string | null) {
  return normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

function stripBudgetCurrency(value: string) {
  return String(value || '')
    .replace(/^(rm|cny|jpy|thb|idr|usd|rmb|myr|¥|￥|\$)\s*/i, '')
    .trim()
}

function matchesSearchQuery(parts: Array<string | null | undefined>, query: string) {
  const rawQuery = normalizeSearchText(query)
  if (!rawQuery) return true

  const rawHaystack = normalizeSearchText(parts.filter(Boolean).join(' '))
  if (rawHaystack.includes(rawQuery)) return true

  const compactQuery = compactSearchText(rawQuery)
  if (!compactQuery) return true

  const compactHaystack = compactSearchText(rawHaystack)
  return compactHaystack.includes(compactQuery)
}

function buildGuideSlug(guide: Pick<TravelGuide, 'slug' | 'shortTitle' | 'title' | 'duration' | 'route'>, regions: RegionOption[]) {
  const explicit = slugify(guide.slug)
  if (explicit) return explicit

  const direct = slugify(guide.shortTitle || guide.title)
  if (direct && /[a-z]/.test(direct) && direct.length >= 6) return direct

  const matchedRegions = (guide.route || [])
    .map((stop) => {
      const normalized = String(stop.name || '').trim().toLowerCase()
      return regions.find(
        (region) =>
          String(region.name || '').trim().toLowerCase() === normalized ||
          String(region.name_cn || '').trim().toLowerCase() === normalized
      )
    })
    .filter((region): region is RegionOption => Boolean(region))

  const countryToken = slugify(matchedRegions[0]?.country || '')
  const routeTokens = Array.from(new Set(matchedRegions.map((region) => slugify(region.name)).filter(Boolean))).slice(0, 4)
  const durationToken = buildDurationToken(guide.duration)

  return [countryToken, ...routeTokens, durationToken || 'trip'].filter(Boolean).join('-')
}

function buildGuideDaysFromVisitDates(locations: LocationOption[], routeNames: string[]) {
  const matchedRouteNames = new Set(routeNames.map((item) => item.trim().toLowerCase()).filter(Boolean))

  const grouped = Array.from(
    locations.reduce((map, location) => {
      const dateKey = String(location.visit_date || '').trim()
      if (!dateKey) return map
      const regionName = String(location.regions?.name || '').trim().toLowerCase()
      const regionCn = String(location.regions?.name_cn || '').trim().toLowerCase()
      if (matchedRouteNames.size && !matchedRouteNames.has(regionName) && !matchedRouteNames.has(regionCn)) {
        return map
      }
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)?.push(location)
      return map
    }, new Map<string, LocationOption[]>())
  ).sort(([a], [b]) => a.localeCompare(b))

  return grouped.map(([date, spots], index) => {
    const ordered = [...spots].sort((left, right) => {
      const leftRank = left.category === 'accommodation' ? 2 : left.category === 'food' ? 1 : 0
      const rightRank = right.category === 'accommodation' ? 2 : right.category === 'food' ? 1 : 0
      if (leftRank !== rightRank) return leftRank - rightRank
      return String(locationDisplayName(left)).localeCompare(String(locationDisplayName(right)), 'zh-Hans-CN')
    })

    const staySpot = ordered.find((spot) => spot.category === 'accommodation')
    const firstRegion = regionDisplayName(ordered[0]?.regions)

    return {
      dayLabel: `Day ${index + 1}`,
      title: firstRegion || formatVisitDate(date) || `Day ${index + 1}`,
      summary: '',
      highlights: [],
      linkedSpots: ordered.filter((spot) => spot.category !== 'accommodation').map((spot) => locationDisplayName(spot)),
      videoUrl: '',
      transport: '',
      transportPrice: '',
      stay: staySpot ? locationDisplayName(staySpot) : '',
      stayRangeStart: staySpot ? index + 1 : undefined,
      stayRangeEnd: staySpot ? index + 1 : undefined,
    }
  })
}

function categoryLabel(category?: string | null) {
  switch (String(category || '').toLowerCase()) {
    case 'food':
      return 'Food'
    case 'accommodation':
      return 'Stay'
    default:
      return 'Spot'
  }
}

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState<TravelGuide[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLinkOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'error'>('neutral')
  const [selectedSlug, setSelectedSlug] = useState('')
  const [originalSlug, setOriginalSlug] = useState('')
  const [form, setForm] = useState<TravelGuide>(EMPTY_GUIDE)
  const [spotSearch, setSpotSearch] = useState('')
  const [affiliateSearch, setAffiliateSearch] = useState('')
  const [daySpotSearches, setDaySpotSearches] = useState<Record<number, string>>({})
  const [staySearches, setStaySearches] = useState<Record<number, string>>({})
  const [activeDayEditor, setActiveDayEditor] = useState<number | null>(0)

  const regions = useMemo(() => {
    return Array.from(
      new Map(
        locations
          .map((location) => location.regions)
          .filter((region): region is RegionOption => Boolean(region))
          .map((region) => [region.id, region])
      ).values()
    )
  }, [locations])

  const routeRegionIds = useMemo(() => {
    const names = new Set(
      (form.route || [])
        .map((stop) => String(stop.name || '').trim().toLowerCase())
        .filter(Boolean)
    )
    if (!names.size) return new Set<number>()

    const ids = new Set<number>()
    regions.forEach((region) => {
      const name = String(region.name || '').trim().toLowerCase()
      const nameCn = String(region.name_cn || '').trim().toLowerCase()
      if (names.has(name) || names.has(nameCn)) ids.add(region.id)
    })
    return ids
  }, [form.route, regions])

  const scopedLocationsForGuide = useMemo(() => {
    if (!routeRegionIds.size) return locations
    return locations.filter((location) => {
      if (!location.region_id) return false
      return routeRegionIds.has(location.region_id)
    })
  }, [locations, routeRegionIds])

  const isPreferredRouteLocation = useCallback(
    (location: LocationOption) => Boolean(location.region_id && routeRegionIds.has(location.region_id)),
    [routeRegionIds]
  )

  const selectedSpotNames = useMemo(() => form.featuredSpotNames || [], [form.featuredSpotNames])

  const selectedSpotOptions = useMemo(() => {
    const wanted = new Set(selectedSpotNames.map((item) => item.trim().toLowerCase()))
    return locations.filter((location) => {
      const name = String(location.name || '').trim().toLowerCase()
      const nameCn = String(location.name_cn || '').trim().toLowerCase()
      return wanted.has(name) || wanted.has(nameCn)
    })
  }, [locations, selectedSpotNames])

  const selectedAffiliateLinkIds = useMemo(() => form.sidebarAffiliateLinkIds || form.featuredAffiliateLinkIds || [], [form.featuredAffiliateLinkIds, form.sidebarAffiliateLinkIds])

  const selectedAffiliateLinks = useMemo(
    () => affiliateLinks.filter((link) => selectedAffiliateLinkIds.includes(link.id)),
    [affiliateLinks, selectedAffiliateLinkIds]
  )

  const filteredLocations = useMemo(() => {
    const query = spotSearch.trim()
    const pool = locations
    const matched = !query
      ? pool
      : pool.filter((location) => {
          return matchesSearchQuery(
            [
              location.name,
              location.name_cn,
              locationDisplayName(location),
              locationAltName(location),
              location.address,
              location.regions?.name,
              location.regions?.name_cn,
            ],
            query
          )
        })
    return matched.sort((left, right) => {
      const leftPreferred = isPreferredRouteLocation(left) ? 1 : 0
      const rightPreferred = isPreferredRouteLocation(right) ? 1 : 0
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred
      return String(locationDisplayName(left)).localeCompare(String(locationDisplayName(right)), 'zh-Hans-CN')
    })
  }, [locations, spotSearch, isPreferredRouteLocation])

  const accommodationLocations = useMemo(
    () => locations.filter((location) => String(location.category || '').toLowerCase() === 'accommodation'),
    [locations]
  )

  const filteredAffiliateLinks = useMemo(() => {
    const query = affiliateSearch.trim().toLowerCase()
    const pool = affiliateLinks.filter((link) => link.is_active !== false)
    if (!query) return pool

    return pool.filter((link) => {
      const haystack = [
        link.title,
        link.provider,
        link.link_type,
        link.locations?.name,
        link.locations?.name_cn,
        link.regions?.name,
        link.regions?.name_cn,
        link.regions?.country,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [affiliateLinks, affiliateSearch])

  const loadData = useCallback(async (preferredSlug?: string) => {
    setLoading(true)
    setMessage(null)

    try {
      const fetchAllLocations = async () => {
        const pageSize = 500
        const rows: any[] = []
        let from = 0

        while (true) {
          const { data, error } = await supabase
            .from('locations')
            .select(
              `
                id,
                name,
                name_cn,
                category,
                visit_date,
                image_url,
                images,
                address,
                region_id,
                latitude,
                longitude,
                regions:region_id (
                  id,
                  name,
                  name_cn,
                  country
                )
              `
            )
            .order('visit_date', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)

          if (error) throw error

          const batch = Array.isArray(data) ? data : []
          rows.push(...batch)

          if (batch.length < pageSize) break
          from += pageSize
        }

        return rows
      }

      const [guidesResponse, locationsData, affiliateLinksResponse] = await Promise.all([
        adminFetch('/api/admin/guides', { cache: 'no-store' }),
        fetchAllLocations(),
        supabase
          .from('affiliate_links')
          .select('id, title, provider, link_type, location_id, region_id, is_active, locations(name, name_cn), regions(name, name_cn, country)')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
      ])

      if (!guidesResponse.ok) {
        throw new Error('Failed to load guides.')
      }

      const guidesJson = await guidesResponse.json()
      const nextGuides: TravelGuide[] = Array.isArray(guidesJson?.guides) ? guidesJson.guides : []
      const nextLocations = Array.isArray(locationsData)
        ? (locationsData as any[]).map((location) => ({
            ...location,
            regions: Array.isArray(location.regions) ? location.regions[0] || null : location.regions || null,
          }))
        : []
      const nextAffiliateLinks = Array.isArray(affiliateLinksResponse.data)
        ? (affiliateLinksResponse.data as any[]).map((link) => ({
            ...link,
            locations: Array.isArray(link.locations) ? link.locations[0] || null : link.locations || null,
            regions: Array.isArray(link.regions) ? link.regions[0] || null : link.regions || null,
          }))
        : []

      setGuides(nextGuides)
      setLocations(nextLocations)
      setAffiliateLinks(nextAffiliateLinks)

      if (preferredSlug) {
        const matched = nextGuides.find((guide) => guide.slug === preferredSlug)
        if (matched) {
          setForm(matched)
          setSelectedSlug(matched.slug)
          setOriginalSlug(matched.slug)
          setActiveDayEditor(0)
          return
        }
      }

      if (nextGuides.length) {
        const current = nextGuides.find((guide) => guide.slug === selectedSlug) || nextGuides[0]
        setForm(current)
        setSelectedSlug(current.slug)
        setOriginalSlug(current.slug)
        setActiveDayEditor(0)
      } else {
        setForm(EMPTY_GUIDE)
        setSelectedSlug('')
        setOriginalSlug('')
        setActiveDayEditor(0)
      }
    } catch (error: any) {
      console.error(error)
      setMessage(error?.message || 'Failed to load guide data.')
    } finally {
      setLoading(false)
    }
  }, [selectedSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  function updateField<K extends keyof TravelGuide>(field: K, value: TravelGuide[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function createNewGuide() {
    setForm({
      ...EMPTY_GUIDE,
      coverAccent: DEFAULT_GUIDE_COVER_ACCENT,
      travelStyle: 'Free & Easy',
    })
    setSelectedSlug('')
    setOriginalSlug('')
    setMessage(null)
    setSpotSearch('')
    setDaySpotSearches({})
    setStaySearches({})
    setActiveDayEditor(0)
  }

  function selectGuide(guide: TravelGuide) {
    setForm(guide)
    setSelectedSlug(guide.slug)
    setOriginalSlug(guide.slug)
    setMessage(null)
    setSpotSearch('')
    setDaySpotSearches({})
    setStaySearches({})
    setActiveDayEditor(0)
  }

  function toggleFeaturedSpot(location: LocationOption) {
    const name = locationDisplayName(location)
    const current = form.featuredSpotNames || []
    const exists = current.includes(name)
    updateField('featuredSpotNames', exists ? current.filter((item) => item !== name) : [...current, name])
  }

  function toggleGuideAffiliateLink(linkId: number) {
    const current = form.sidebarAffiliateLinkIds || []
    const exists = current.includes(linkId)
    updateField(
      'sidebarAffiliateLinkIds',
      exists ? current.filter((id) => id !== linkId) : [...current, linkId]
    )
  }

  function updateRouteStop(index: number, field: keyof TravelGuide['route'][number], value: string | number | undefined) {
    const next = [...form.route]
    next[index] = {
      ...next[index],
      [field]: value,
    }
    updateField('route', next)
  }

  function addRouteStop() {
    updateField('route', [
      ...form.route,
      {
        stopLabel: '',
        name: '',
        summary: '',
        mapSpotName: '',
        latitude: undefined,
        longitude: undefined,
      },
    ])
  }

  function moveRouteStop(index: number, direction: 'up' | 'down') {
    updateField('route', moveArrayItem(form.route, index, direction))
  }

  function removeRouteStop(index: number) {
    updateField(
      'route',
      form.route.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  function updateDay(index: number, patch: Partial<TravelGuide['days'][number]>) {
    const next = [...form.days]
    next[index] = {
      ...next[index],
      ...patch,
    }
    updateField('days', next)
  }

  function addDay() {
    updateField('days', [
      ...form.days,
      {
        dayLabel: `Day ${form.days.length + 1}`,
        title: '',
        summary: '',
        highlights: [],
        linkedSpots: [],
        videoUrl: '',
        transport: '',
        transportPrice: '',
        stay: '',
      },
    ])
  }

function moveDay(index: number, direction: 'up' | 'down') {
  updateField('days', moveArrayItem(form.days, index, direction))
}

function removeDay(index: number) {
  updateField(
    'days',
    form.days.filter((_, itemIndex) => itemIndex !== index)
  )
}

  function updateBudgetItem(index: number, patch: Partial<TravelGuide['budgetItems'][number]>) {
    const next = [...form.budgetItems]
    next[index] = {
      ...next[index],
      ...patch,
    }
    updateField('budgetItems', next)
  }

  function addBudgetItem() {
    updateField('budgetItems', [
      ...form.budgetItems,
      {
        label: '',
        amount: '',
        currency: 'RM',
        note: '',
      },
    ])
  }

  function moveBudgetItem(index: number, direction: 'up' | 'down') {
    updateField('budgetItems', moveArrayItem(form.budgetItems, index, direction))
  }

  function removeBudgetItem(index: number) {
    updateField(
      'budgetItems',
      form.budgetItems.filter((_, itemIndex) => itemIndex !== index)
    )
  }

function toggleDayLinkedSpot(dayIndex: number, spotName: string) {
  const current = form.days[dayIndex]?.linkedSpots || []
  const exists = current.includes(spotName)
  updateDay(dayIndex, {
      linkedSpots: exists ? current.filter((item) => item !== spotName) : [spotName, ...current],
  })
}

function moveDayLinkedSpot(dayIndex: number, spotIndex: number, direction: 'up' | 'down') {
  const current = form.days[dayIndex]?.linkedSpots || []
  updateDay(dayIndex, {
    linkedSpots: moveArrayItem(current, spotIndex, direction),
  })
}

function moveDayLinkedSpotToEdge(dayIndex: number, spotIndex: number, edge: 'start' | 'end') {
  const current = form.days[dayIndex]?.linkedSpots || []
  updateDay(dayIndex, {
    linkedSpots: moveArrayItemToEdge(current, spotIndex, edge),
  })
}

  function setDayStay(dayIndex: number, stayName: string) {
    const dayNumber = parseGuideDayNumber(form.days[dayIndex]?.dayLabel) || dayIndex + 1
    updateDay(dayIndex, {
      stay: stayName,
      stayRangeStart: stayName ? dayNumber : undefined,
      stayRangeEnd: stayName ? dayNumber : undefined,
    })
  }

  function toggleContinuousStay(dayIndex: number, enabled: boolean) {
    const dayNumber = parseGuideDayNumber(form.days[dayIndex]?.dayLabel) || dayIndex + 1
    if (!enabled) {
      updateDay(dayIndex, {
        stayRangeStart: dayNumber,
        stayRangeEnd: dayNumber,
      })
      return
    }

    updateDay(dayIndex, {
      stayRangeStart: form.days[dayIndex]?.stayRangeStart || dayNumber,
      stayRangeEnd: form.days[dayIndex]?.stayRangeEnd || dayNumber,
    })
  }

  function rebuildDaysFromVisitDates() {
    const nextDays = buildGuideDaysFromVisitDates(locations, form.route.map((stop) => stop.name))
    if (!nextDays.length) {
      setMessage('No dated spots matched the current route yet.')
      setMessageTone('error')
      return
    }
    updateField('days', nextDays)
    setMessage('Rebuilt day plans from visit dates.')
    setMessageTone('success')
  }

  async function saveGuide() {
    const autoSlug = buildGuideSlug(form, regions)
    const payload: TravelGuide & { previousSlug?: string } = {
      ...form,
      slug: autoSlug,
      aliases: (form.aliases || []).filter(Boolean),
      route: form.route
        .map((stop) => ({
          stopLabel: String(stop.stopLabel || '').trim(),
          name: String(stop.name || '').trim(),
          summary: String(stop.summary || '').trim(),
          mapSpotName: String(stop.mapSpotName || '').trim() || undefined,
          latitude: typeof stop.latitude === 'number' && Number.isFinite(stop.latitude) ? stop.latitude : undefined,
          longitude: typeof stop.longitude === 'number' && Number.isFinite(stop.longitude) ? stop.longitude : undefined,
        }))
        .filter((stop) => stop.name),
      days: form.days.map((day, index) => {
        const dayNumber = parseGuideDayNumber(day.dayLabel) || index + 1
        return {
          ...day,
          dayLabel: String(day.dayLabel || `Day ${index + 1}`).trim(),
          title: String(day.title || '').trim(),
          summary: String(day.summary || '').trim(),
          highlights: Array.isArray(day.highlights) ? day.highlights.filter(Boolean) : [],
          linkedSpots: Array.isArray(day.linkedSpots) ? day.linkedSpots.filter(Boolean) : [],
          videoUrl: String(day.videoUrl || '').trim() || undefined,
          transport: String(day.transport || '').trim() || undefined,
          transportPrice: String(day.transportPrice || '').trim() || undefined,
          stay: String(day.stay || '').trim() || undefined,
          stayRangeStart: day.stay ? Number(day.stayRangeStart || dayNumber) : undefined,
          stayRangeEnd: day.stay ? Number(day.stayRangeEnd || day.stayRangeStart || dayNumber) : undefined,
        }
      }),
      previousSlug: originalSlug || undefined,
    }

    if (!payload.title.trim()) {
      setMessage('Guide title is required.')
      setMessageTone('error')
      return
    }

    if (!payload.slug) {
      setMessage('Could not build a slug for this guide.')
      setMessageTone('error')
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const response = await adminFetch('/api/admin/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save guide.')

      if (result?.guide) {
        setForm(result.guide)
        setOriginalSlug(result.guide.slug || '')
        setSelectedSlug(result.guide.slug || '')
        setGuides((prev) => {
          const next = [...prev]
          const existingIndex = next.findIndex((item) => item.slug === result.guide.slug || item.slug === originalSlug)
          if (existingIndex >= 0) next[existingIndex] = result.guide
          else next.unshift(result.guide)
          return next
        })
      }

      await loadData(result.guide.slug)
      setMessage(`Saved successfully at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`)
      setMessageTone('success')
    } catch (error: any) {
      console.error(error)
      setMessage(error?.message || 'Failed to save guide.')
      setMessageTone('error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteGuide() {
    if (!form.slug) return
    const confirmed = window.confirm(`Delete guide "${form.title || form.slug}"?`)
    if (!confirmed) return

    setDeleting(true)
    setMessage(null)

    try {
      const response = await adminFetch(`/api/admin/guides?slug=${encodeURIComponent(form.slug)}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to delete guide.')

      await loadData()
      setMessage('Guide deleted.')
      setMessageTone('success')
    } catch (error: any) {
      console.error(error)
      setMessage(error?.message || 'Failed to delete guide.')
      setMessageTone('error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_22%),linear-gradient(180deg,#020617_0%,#0f172a_46%,#111827_100%)] p-4 text-slate-100 [&_input]:border-white/10 [&_input]:bg-slate-900/72 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500 [&_textarea]:border-white/10 [&_textarea]:bg-slate-900/72 [&_textarea]:text-slate-100 [&_textarea]:placeholder:text-slate-500 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-slate-950/72 p-6 shadow-[0_24px_80px_-50px_rgba(2,6,23,0.9)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="space-y-2">
              <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10">Guide Ops</Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">Travel Guides</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Manage long-form travel guides, route stages, daily plans, stays, and the spot links used on each guide page.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={createNewGuide}>
              <Plus className="mr-2 h-4 w-4" />
              New guide
            </Button>
            <Button onClick={saveGuide} disabled={saving} className="bg-amber-300 text-slate-950 hover:bg-amber-200">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save guide
            </Button>
          </div>
        </div>

        {message ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm backdrop-blur-xl ${
              messageTone === 'success'
                ? 'border border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                : messageTone === 'error'
                  ? 'border border-rose-300/20 bg-rose-500/10 text-rose-100'
                  : 'border border-white/10 bg-slate-950/72 text-slate-200'
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="border-white/10 bg-slate-950/78 shadow-[0_18px_48px_rgba(2,6,23,0.48)] backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <BookOpen className="h-5 w-5 text-amber-600" />
                Guide list
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : guides.length ? (
                guides.map((guide) => (
                  <button
                    key={guide.slug}
                    type="button"
                    onClick={() => selectGuide(guide)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedSlug === guide.slug
                        ? 'border-amber-300/40 bg-amber-300/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{guide.shortTitle || guide.title}</div>
                    <div className="mt-1 text-xs text-slate-400">/{guide.slug}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                      <span>{guide.duration || 'No duration'}</span>
                      <span>{guide.budget || 'No budget'}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                  No guides yet.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200 bg-white/95 shadow-sm">
              <CardContent className="p-0">
                <div className={`relative overflow-hidden px-6 py-6 ${form.coverAccent || DEFAULT_GUIDE_COVER_ACCENT}`}>
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(2,6,23,0.78),rgba(2,6,23,0.4))]" />
                  <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_300px]">
                    <div className="space-y-4">
                      <p className="text-[11px] uppercase tracking-[0.32em] text-amber-100/80">Live Guide Preview</p>
                      <div>
                        <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                          {form.title || 'Untitled guide'}
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/72">
                          {form.summary || 'Add title, route, day plans, and linked spots here. Public pages read directly from this saved guide data.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs text-white/85">
                          {form.duration || 'No duration'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs text-white/85">
                          {form.budget || 'No budget'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs text-white/85">
                          {form.travelStyle || 'No style'}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-[0.26em] text-white/48">Route Stops</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{form.route.length}</p>
                      </div>
                      <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-[0.26em] text-white/48">Linked Spots</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{selectedSpotOptions.length}</p>
                      </div>
                      <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-[0.26em] text-white/48">Day Plans</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{form.days.length}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 border-t border-white/10 bg-slate-950/96 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-white/90">Current route stops</p>
                    {form.route.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {form.route.map((stop, index) => (
                          <div key={`${stop.name}-${index}`} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                            <p className="text-[11px] uppercase tracking-[0.26em] text-white/40">{stop.stopLabel || `Stop ${index + 1}`}</p>
                            <h3 className="mt-2 text-lg font-semibold text-white">{stop.name || `Route ${index + 1}`}</h3>
                            {stop.summary ? <p className="mt-2 text-sm leading-6 text-white/62">{stop.summary}</p> : null}
                            {stop.mapSpotName ? <p className="mt-2 text-xs text-white/45">Map point: {stop.mapSpotName}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-sm text-white/55">
                        Add route stops to shape the guide map and overview.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <p className="text-sm font-medium text-white/90">Linked spot gallery</p>
                    {selectedSpotOptions.length ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedSpotOptions.slice(0, 6).map((location) => (
                          <div key={location.id} className="overflow-hidden rounded-[22px] border border-white/10 bg-white/5">
                            <div className="relative aspect-[16/10] overflow-hidden">
                              <FallbackImage src={getLocationCover(location)} alt={locationDisplayName(location)} fill sizes="320px" className="object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                              <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/90">
                                {categoryLabel(location.category)}
                              </div>
                            </div>
                            <div className="space-y-1 p-3">
                              <div className="font-medium text-white">{locationDisplayName(location)}</div>
                              <div className="text-xs text-white/55">{locationRegionLabel(location)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-sm text-white/55">
                        Select linked spots below. Those spots can be reused across route cards and day plans.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Guide basics</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Short Title</Label>
                  <Input value={form.shortTitle} onChange={(e) => updateField('shortTitle', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => updateField('slug', e.target.value)} placeholder={buildGuideSlug(form, regions) || 'auto-generated'} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Tagline</Label>
                  <Input value={form.tagline} onChange={(e) => updateField('tagline', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Summary</Label>
                  <Textarea rows={4} value={form.summary} onChange={(e) => updateField('summary', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Input value={form.duration} onChange={(e) => updateField('duration', e.target.value)} placeholder="11 Days / 10 Nights" />
                </div>
                <div className="space-y-2">
                  <Label>Budget</Label>
                  <Input value={form.budget} onChange={(e) => updateField('budget', e.target.value)} placeholder="RM 4.3k" />
                </div>
                <div className="space-y-2">
                  <Label>Travel Style</Label>
                  <Input value={form.travelStyle} onChange={(e) => updateField('travelStyle', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cover Image</Label>
                  <Input value={form.coverImage || ''} onChange={(e) => updateField('coverImage', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>YouTube</Label>
                  <Input value={form.videoUrl || ''} onChange={(e) => updateField('videoUrl', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Facebook</Label>
                  <Input value={form.facebookUrl || ''} onChange={(e) => updateField('facebookUrl', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Right Sidebar Affiliate Links</CardTitle>
                <CardDescription>
                  这里选中的链接会显示在游记右侧，适合放酒店、门票、一日游或交通预订。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedAffiliateLinks.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedAffiliateLinks.map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => toggleGuideAffiliateLink(link.id)}
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">
                              {link.title || `${link.provider} / ${link.link_type}`}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {link.locations?.name_cn || link.locations?.name || link.regions?.name_cn || link.regions?.name || 'Guide sidebar'}
                            </div>
                          </div>
                          <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-amber-700">
                            Selected
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No sidebar affiliate links selected yet.
                  </div>
                )}

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={affiliateSearch}
                    onChange={(e) => setAffiliateSearch(e.target.value)}
                    placeholder="Search affiliate links, stays, spots, or regions"
                    className="pl-9"
                  />
                </div>

                <div className="grid max-h-80 gap-3 overflow-y-auto rounded-2xl border border-slate-200 p-3 md:grid-cols-2">
                  {filteredAffiliateLinks.map((link) => {
                    const checked = selectedAffiliateLinkIds.includes(link.id)
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => toggleGuideAffiliateLink(link.id)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          checked ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">{link.title || `${link.provider} / ${link.link_type}`}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                              {link.provider} / {link.link_type}
                            </div>
                          </div>
                          {checked ? (
                            <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-medium text-sky-700">
                              Added
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          {link.locations?.name_cn || link.locations?.name || link.regions?.name_cn || link.regions?.name || 'General'}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  你在这里勾选哪些链接，游记右手边就只展示这些，不会再混入默认自动推荐。
                </div>

                <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <Label htmlFor="guideKlookWidgetCode">Klook Dynamic Widget HTML</Label>
                  <Textarea
                    id="guideKlookWidgetCode"
                    rows={8}
                    value={form.klookWidgetCode || ''}
                    onChange={(e) => updateField('klookWidgetCode', e.target.value)}
                    placeholder={`<ins class="klk-aff-widget" data-adid="..." data-prod="dynamic_widget"><a href="//www.klook.com/">Klook.com</a></ins>\n<script type="text/javascript">\n(function(){ ... })()\n</script>`}
                  />
                  <p className="text-xs text-slate-600">
                    这里可以直接贴整段 Klook widget code。保存后会显示在这篇游记右侧栏联盟链接上方。
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Budget Breakdown</CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={addBudgetItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add item
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {form.budget ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    当前总预算会显示在前台预算拆解最上方。<span className="ml-2 font-semibold">{form.budget}</span>
                  </div>
                ) : null}
                {form.budgetItems.length ? (
                  form.budgetItems.map((item, index) => (
                    <div key={`budget-item-${index}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">Item {index + 1}</div>
                        <div className="flex gap-2">
                          <Button type="button" size="icon" variant="outline" onClick={() => moveBudgetItem(index, 'up')}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="icon" variant="outline" onClick={() => moveBudgetItem(index, 'down')}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="icon" variant="outline" onClick={() => removeBudgetItem(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Label</Label>
                          <Input value={item.label} onChange={(e) => updateBudgetItem(index, { label: e.target.value })} placeholder="机票 / 住宿 / 门票 / 吃喝" />
                        </div>
                        <div className="space-y-2">
                          <Label>Amount</Label>
                          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                            <select
                              value={item.currency || 'RM'}
                              onChange={(e) => updateBudgetItem(index, { currency: e.target.value })}
                              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                            >
                              {GUIDE_BUDGET_CURRENCIES.map((currency) => (
                                <option key={currency} value={currency}>
                                  {currency}
                                </option>
                              ))}
                            </select>
                            <Input
                              value={item.amount}
                              onChange={(e) => updateBudgetItem(index, { amount: stripBudgetCurrency(e.target.value) })}
                              placeholder="1200 / 350 / TBC"
                            />
                          </div>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Note</Label>
                          <Input value={item.note || ''} onChange={(e) => updateBudgetItem(index, { note: e.target.value })} placeholder="补充说明，例如双人房均分后的人均费用" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No budget items yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Day by Day</CardTitle>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={rebuildDaysFromVisitDates}>
                    Rebuild from visit dates
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addDay}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add day
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!locations.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    No spots loaded from current Supabase project yet. Please confirm `.env.local` points to the project where your locations are stored.
                  </div>
                ) : null}
                {form.days.length ? (
                  form.days.map((day, index) => {
                    const linkedSpots = day.linkedSpots || []
                    const isEditorOpen = activeDayEditor === index
                    const dayQuery = String(daySpotSearches[index] || '').trim()
                    const linkedSpotNameSet = new Set(linkedSpots.map((item) => item.trim().toLowerCase()))
                    const visibleCandidates = !isEditorOpen
                      ? []
                      : locations
                          .filter((location) => {
                            return matchesSearchQuery(
                              [
                                location.name,
                                location.name_cn,
                                locationDisplayName(location),
                                locationAltName(location),
                                location.address,
                                location.regions?.name,
                                location.regions?.name_cn,
                              ],
                              dayQuery
                            )
                          })
                          .sort((left, right) => {
                            const leftSelected = linkedSpotNameSet.has(locationDisplayName(left).trim().toLowerCase()) ? 1 : 0
                            const rightSelected = linkedSpotNameSet.has(locationDisplayName(right).trim().toLowerCase()) ? 1 : 0
                            if (leftSelected !== rightSelected) return rightSelected - leftSelected
                            const leftPreferred = isPreferredRouteLocation(left) ? 1 : 0
                            const rightPreferred = isPreferredRouteLocation(right) ? 1 : 0
                            if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred
                            return String(locationDisplayName(left)).localeCompare(String(locationDisplayName(right)), 'zh-Hans-CN')
                          })
                          .slice(0, dayQuery ? 140 : 70)

                    const stayQuery = String(staySearches[index] || '').trim()
                    const visibleStays = !isEditorOpen
                      ? []
                      : accommodationLocations
                          .filter((location) =>
                            matchesSearchQuery(
                              [
                                location.name,
                                location.name_cn,
                                locationDisplayName(location),
                                locationAltName(location),
                                location.address,
                                location.regions?.name,
                                location.regions?.name_cn,
                              ],
                              stayQuery
                            )
                          )
                          .sort((left, right) => {
                            const leftPreferred = isPreferredRouteLocation(left) ? 1 : 0
                            const rightPreferred = isPreferredRouteLocation(right) ? 1 : 0
                            if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred
                            return String(locationDisplayName(left)).localeCompare(String(locationDisplayName(right)), 'zh-Hans-CN')
                          })
                          .slice(0, stayQuery ? 100 : 50)

                    const currentStayLocation =
                      accommodationLocations.find((location) => matchesLocationIdentity(location, String(day.stay || ''))) || null
                    const dayNumber = parseGuideDayNumber(day.dayLabel) || index + 1
                    const dayRange = parseDayRange(day.dayLabel)
                    const defaultStart = dayRange?.start || dayNumber
                    const defaultEnd = dayRange?.end || defaultStart
                    const stayEnd = Number(day.stayRangeEnd || day.stayRangeStart || defaultStart)
                    const isContinuous = Boolean(day.stay) && stayEnd > defaultStart
                    const maxStaySpan = Math.max(1, form.days.length - dayNumber + 1)
                    const currentStaySpan = Math.max(1, stayEnd - dayNumber + 1)

                    return (
                      <div key={`day-${index}`} className="rounded-2xl border border-slate-200 p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{day.dayLabel || `Day ${index + 1}`}</div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={isEditorOpen ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setActiveDayEditor(isEditorOpen ? null : index)}
                            >
                              {isEditorOpen ? '收起景点选择' : '展开景点选择'}
                            </Button>
                            <Button type="button" size="icon" variant="outline" onClick={() => moveDay(index, 'up')}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="outline" onClick={() => moveDay(index, 'down')}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="outline" onClick={() => removeDay(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Day Label</Label>
                            <Input value={day.dayLabel} onChange={(e) => updateDay(index, { dayLabel: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Title</Label>
                            <Input value={day.title} onChange={(e) => updateDay(index, { title: e.target.value })} />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>Summary</Label>
                            <Textarea rows={3} value={day.summary} onChange={(e) => updateDay(index, { summary: e.target.value })} />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>Highlights</Label>
                            <Textarea rows={3} value={arrayToLines(day.highlights)} onChange={(e) => updateDay(index, { highlights: linesToArray(e.target.value) })} placeholder="One highlight per line" />
                          </div>

                          <div className="space-y-3 md:col-span-2">
                            <Label>Linked Spots</Label>
                            {isEditorOpen ? (
                              <>
                                <div className="relative">
                                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  <Input
                                    value={daySpotSearches[index] || ''}
                                    onChange={(e) => setDaySpotSearches((prev) => ({ ...prev, [index]: e.target.value }))}
                                    placeholder="搜中文、英文、地区或地址都可以"
                                    className="pl-9"
                                  />
                                </div>

                                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                                  {visibleCandidates.length ? (
                                    visibleCandidates.map((location) => {
                                      const spotName = locationDisplayName(location)
                                      const checked = linkedSpots.includes(spotName)
                                      const altName = locationAltName(location)
                                      return (
                                        <button
                                          key={`${location.id}-${index}`}
                                          type="button"
                                          onClick={() => toggleDayLinkedSpot(index, spotName)}
                                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                                            checked
                                              ? 'border-sky-300/40 bg-sky-300/10 text-sky-50'
                                              : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                                          }`}
                                        >
                                          <div>
                                            <div className="font-medium">{spotName}</div>
                                            {altName ? <div className="text-xs text-slate-400">{altName}</div> : null}
                                            <div className="text-xs text-slate-400">{locationRegionLabel(location)}</div>
                                          </div>
                                          <div className="text-xs text-slate-500">{location.visit_date ? formatVisitDate(location.visit_date) : ''}</div>
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-slate-400">
                                      没搜到结果，试试英文名、中文名、地区名或地址关键字。
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-slate-400">
                                点「展开景点选择」后才载入候选列表，这样整页会顺很多。
                              </div>
                            )}

                            {linkedSpots.length ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Selected for this day</div>
                                <div className="flex flex-wrap gap-2">
                                  {linkedSpots.map((spotName, spotIndex) => (
                                    <div key={`${spotName}-${spotIndex}`} className="flex items-center gap-1 rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-sm text-sky-50">
                                      <span>{spotName}</span>
                                      <button type="button" onClick={() => moveDayLinkedSpotToEdge(index, spotIndex, 'start')} className="rounded-full px-1.5 py-1 text-[11px] font-medium hover:bg-sky-100" title="Move to top">
                                        Top
                                      </button>
                                      <button type="button" onClick={() => moveDayLinkedSpot(index, spotIndex, 'up')} className="rounded-full p-1 hover:bg-sky-100" title="Move up">
                                        <ArrowUp className="h-3 w-3" />
                                      </button>
                                      <button type="button" onClick={() => moveDayLinkedSpot(index, spotIndex, 'down')} className="rounded-full p-1 hover:bg-sky-100" title="Move down">
                                        <ArrowDown className="h-3 w-3" />
                                      </button>
                                      <button type="button" onClick={() => moveDayLinkedSpotToEdge(index, spotIndex, 'end')} className="rounded-full px-1.5 py-1 text-[11px] font-medium hover:bg-sky-100" title="Move to bottom">
                                        Bottom
                                      </button>
                                      <button type="button" onClick={() => toggleDayLinkedSpot(index, spotName)} className="rounded-full p-1 hover:bg-sky-100" title="Remove">
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">还没选择当天景点。</span>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Transport</Label>
                            <Input value={day.transport || ''} onChange={(e) => updateDay(index, { transport: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Transport Price</Label>
                            <Input value={day.transportPrice || ''} onChange={(e) => updateDay(index, { transportPrice: e.target.value })} placeholder="RM 120 / THB 450 / etc." />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>YouTube Video</Label>
                            <Input value={day.videoUrl || ''} onChange={(e) => updateDay(index, { videoUrl: e.target.value })} placeholder="Paste the day-specific YouTube link" />
                          </div>

                          <div className="space-y-3 md:col-span-2">
                            <Label>Stay</Label>
                            <div className="space-y-2">
                              <Input
                                value={day.stay || ''}
                                onChange={(e) => setDayStay(index, e.target.value)}
                                placeholder="可直接手动输入住宿名，或下面搜索后点选"
                              />
                              <div className="text-xs text-slate-500">
                                如果前台已经显示这间住宿，但这里暂时没成功配对到数据库，你可以先直接改名字，再慢慢重新绑定。
                              </div>
                            </div>
                            {currentStayLocation ? (
                              <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
                                <div className="relative h-28 bg-slate-100">
                                  <FallbackImage src={getLocationCover(currentStayLocation)} alt={locationDisplayName(currentStayLocation)} fill sizes="320px" className="object-cover" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                                  <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/85">Stay</div>
                                  <button type="button" onClick={() => setDayStay(index, '')} className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs text-white transition hover:bg-black/50">
                                    Clear
                                  </button>
                                </div>
                                <div className="space-y-1 px-3 py-3">
                                  <div className="font-medium text-slate-900">{locationDisplayName(currentStayLocation)}</div>
                                  <div className="text-xs text-slate-500">{locationRegionLabel(currentStayLocation)}</div>
                                </div>
                              </div>
                            ) : day.stay ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                当前已保存住宿：{day.stay}。这条记录暂时还没配对到数据库住宿卡，但你可以直接修改名称，或在下面重新搜索绑定。
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">No stay selected for this day.</div>
                            )}

                            {isEditorOpen ? (
                              <>
                                <div className="relative">
                                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  <Input value={staySearches[index] || ''} onChange={(e) => setStaySearches((prev) => ({ ...prev, [index]: e.target.value }))} placeholder="Search stays (route regions first)" className="pl-9" />
                                </div>

                                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                                  {visibleStays.length ? (
                                    visibleStays.map((location) => {
                                      const spotName = locationDisplayName(location)
                                      const checked = day.stay === spotName
                                      return (
                                        <button
                                          key={`stay-${location.id}-${index}`}
                                          type="button"
                                          onClick={() => setDayStay(index, checked ? '' : spotName)}
                                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                                            checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                                          }`}
                                        >
                                          <div>
                                            <div className="font-medium text-slate-900">{spotName}</div>
                                            {locationAltName(location) ? <div className="text-xs text-slate-500">{locationAltName(location)}</div> : null}
                                            <div className="text-xs text-slate-500">{locationRegionLabel(location)}</div>
                                          </div>
                                          {checked ? <span className="text-xs text-emerald-700">Selected</span> : null}
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                                      No stay found. Try a shorter keyword.
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : null}

                            {day.stay ? (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleContinuousStay(index, false)}
                                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                      !isContinuous
                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                    }`}
                                  >
                                    1 day
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const initialSpan = Math.max(2, currentStaySpan)
                                      updateDay(index, {
                                        stayRangeStart: dayNumber,
                                        stayRangeEnd: Math.min(dayNumber + initialSpan - 1, dayNumber + maxStaySpan - 1),
                                      })
                                    }}
                                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                      isContinuous
                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                    }`}
                                  >
                                    Multi-day stay
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  <Label>Stay visible for</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {Array.from({ length: maxStaySpan }, (_, offset) => {
                                      const span = offset + 1
                                      const active = currentStaySpan === span
                                      return (
                                        <button
                                          key={`stay-span-${index}-${span}`}
                                          type="button"
                                          disabled={!isContinuous && span > 1}
                                          onClick={() =>
                                            updateDay(index, {
                                              stayRangeStart: dayNumber,
                                              stayRangeEnd: dayNumber + span - 1,
                                            })
                                          }
                                          className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                            active
                                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                          } ${!isContinuous && span > 1 ? 'cursor-not-allowed opacity-45' : ''}`}
                                        >
                                          {span === 1 ? '1 day' : `${span} days`}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  <p className="text-xs text-slate-500">
                                    {isContinuous
                                      ? `Currently shown from Day ${dayNumber} to Day ${stayEnd}`
                                      : 'When disabled, stay appears only on this day'}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">No day plans yet.</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Related Spots</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedSpotOptions.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {selectedSpotOptions.map((location) => {
                      const spotName = locationDisplayName(location)
                      return (
                        <div key={location.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                          <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                            <FallbackImage src={getLocationCover(location)} alt={spotName} fill sizes="(max-width: 768px) 100vw, 320px" className="object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                            <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/90">
                              {categoryLabel(location.category)}
                            </div>
                            <button type="button" onClick={() => toggleFeaturedSpot(location)} className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs text-white transition hover:bg-black/50">
                              Remove
                            </button>
                          </div>
                          <div className="space-y-2 p-4">
                            <div>
                              <h3 className="font-semibold text-slate-900">{spotName}</h3>
                              <p className="mt-1 text-xs text-slate-500">{locationRegionLabel(location)}</p>
                            </div>
                            <p className="line-clamp-2 text-xs leading-5 text-slate-500">{location.address || 'No address stored yet.'}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">No related spots selected yet.</div>
                )}

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={spotSearch} onChange={(e) => setSpotSearch(e.target.value)} placeholder="Search spots to link into this guide" className="pl-9" />
                </div>
                <div className="grid max-h-80 gap-3 overflow-y-auto rounded-2xl border border-slate-200 p-3 md:grid-cols-2">
                  {filteredLocations.map((location) => {
                    const checked = selectedSpotNames.includes(locationDisplayName(location))
                    return (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => toggleFeaturedSpot(location)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${checked ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <div className="font-medium text-slate-900">{locationDisplayName(location)}</div>
                        <div className="mt-1 text-xs text-slate-500">{locationRegionLabel(location)}</div>
                      </button>
                    )
                  })}
                </div>
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  Linked spots feed guide cards, day plans, route helpers, and guide-to-spot navigation on the public site.
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap justify-end gap-2 pb-10">
              {form.slug ? (
                <Button type="button" variant="destructive" onClick={deleteGuide} disabled={deleting}>
                  {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Delete guide
                </Button>
              ) : null}
              <Button type="button" onClick={saveGuide} disabled={saving} className="bg-slate-900 text-white hover:bg-slate-800">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save guide
              </Button>
              {form.slug ? (
                <Link href={`/guide/${form.slug}`} target="_blank">
                  <Button type="button" variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open guide
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



