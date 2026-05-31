'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import { createDefaultPriceInfo, parsePriceInfo, serializePriceInfo, StructuredPriceInfo } from '@/lib/price-utils'
import {
  findRegionById,
  getChildRegions,
  getCountryPrimaryRegions,
  getRegionCountry,
  getRegionOptionLabel,
} from '@/lib/region-utils'
import { Button } from '@/components/ui/button'
import AdminAffiliateLinksPanel from '@/components/AdminAffiliateLinksPanel'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Search, Loader2, Save, Upload, ImagePlus, ExternalLink, MapPin, GripVertical, ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import FallbackImage from '@/components/FallbackImage'
import { parseImageFocus, withImageFocus } from '@/lib/image-focus'
import { assertR2ImageUrl } from '@/lib/image-url'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Checkbox } from "@/components/ui/checkbox"
import ImageMetadataBadge from '@/components/ImageMetadataBadge'
const COUNTRY_CURRENCY: Record<string, string> = {
  Malaysia: 'RM',
  China: 'CNY',
  Japan: 'JPY',
  Thailand: 'THB',
  Indonesia: 'IDR',
}

const MAX_DIRECT_GALLERY_UPLOAD_FILES = 60

const COUNTRY_SECONDARY_CURRENCY: Record<string, string> = {
  China: 'RM',
  Japan: 'RM',
  Thailand: 'RM',
  Indonesia: 'RM',
}

interface StructuredOpeningHours {
  isUnknown: boolean
  open: string
  close: string
  closedDays: number[] // 0=Sun, 1=Mon, ..., 6=Sat
  remarks: string
  is24Hours: boolean
  scheduleGroups?: Array<{
    days: number[]
    label: string
    hours: string
  }>
}

interface LocationFormData {
  name: string
  name_cn: string // Renamed from name_en
  custom_slug: string
  category: string 
  address: string
  latitude: string
  longitude: string
  region_id: string // Add region_id
  video_url: string
  facebook_video_url: string // Facebook Video URL
  image_url: string
  images: string[] // New field for multiple images
  review: string
  tags: string
  visit_date: string
  opening_hours: string // New field
  price_info: string
  status: string // New field for status (active, closed, etc.)
}

interface AdminLocationFormProps {
  initialData?: any // Relaxed type to handle DB response
  mode: 'add' | 'edit'
}

interface RegionOption {
  id: number
  name: string
  parent_id: number | null
  country?: string | null
}

interface EnrichmentSuggestionState {
  suggestedDescription: string
  openingHours: string
  suggestedTags: string[]
  displayName: string
}

export default function AdminLocationForm({ initialData, mode }: AdminLocationFormProps) {
  const router = useRouter()
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    name_cn: '',
    custom_slug: '',
    category: 'attraction', // Default to attraction
    address: '',
    latitude: '',
    longitude: '',
    region_id: 'null', // Default null
    video_url: '',
    facebook_video_url: '',
    image_url: '',
    images: [],
    review: '',
    tags: '',
    visit_date: new Date().toISOString().split('T')[0], // Default to today
    opening_hours: '',
    price_info: '',
    status: 'active', // Default status
  })
  const [structuredHours, setStructuredHours] = useState<StructuredOpeningHours>({
    isUnknown: true,
    open: '10:00',
    close: '22:00',
    closedDays: [],
    remarks: '',
    is24Hours: false,
    scheduleGroups: [],
  })
  const [structuredPriceInfo, setStructuredPriceInfo] = useState<StructuredPriceInfo>(createDefaultPriceInfo())
  const [loading, setLoading] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [galleryUploadStatus, setGalleryUploadStatus] = useState('')
  const [regions, setRegions] = useState<RegionOption[]>([]) // Store regions
  const [searching, setSearching] = useState(false)
  const [enrichingPlace, setEnrichingPlace] = useState(false)
  const [message, setMessage] = useState('')
  const [filterCountry, setFilterCountry] = useState('All')
  const [regionSearch, setRegionSearch] = useState('')
  const [primaryRegionId, setPrimaryRegionId] = useState('null')
  const [enrichmentSuggestion, setEnrichmentSuggestion] = useState<EnrichmentSuggestionState | null>(null)
  const [googleHoursDraft, setGoogleHoursDraft] = useState('')
  const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null)
  const [resolvingExternalImages, setResolvingExternalImages] = useState(false)
  const openingHoursMode = structuredHours.isUnknown ? 'unknown' : structuredHours.is24Hours ? 'always' : 'custom'
  const coverFocus = parseImageFocus(formData.image_url || '')
  const isAttractionCategory = formData.category === 'attraction'
  const isFoodCategory = formData.category === 'food'
  const shouldShowPriceReference = true
  const [priceImageInput, setPriceImageInput] = useState('')
  const [loadingCustomSlug, setLoadingCustomSlug] = useState(false)

  // Helper for array input
  const [imageInput, setImageInput] = useState('')

  const extractFilenameFromUrl = (urlString: string, fallbackPrefix: string) => {
    try {
      const pathname = new URL(urlString).pathname
      const lastSegment = pathname.split('/').filter(Boolean).pop() || ''
      const cleaned = lastSegment.split('?')[0].trim()
      return cleaned || `${fallbackPrefix}-${Date.now()}`
    } catch {
      return `${fallbackPrefix}-${Date.now()}`
    }
  }

  const handleDownloadImage = async (url: string, fallbackPrefix: string) => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (!token) {
        setMessage('Error: 请先重新登录后台，再下载图片。')
        return
      }

      const filename = extractFilenameFromUrl(url, fallbackPrefix)
      const response = await fetch(
        `/api/admin/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || '下载失败')
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setMessage(`已开始下载图片：${filename}`)
    } catch (error: any) {
      setMessage(`Error: ${error?.message || '下载图片失败'}`)
    }
  }

  const handleDownloadGallery = async () => {
    if (!formData.images.length) {
      setMessage('Error: 当前还没有可下载的图集图片。')
      return
    }

    try {
      setMessage('正在打包图集，请稍候...')

      const response = await adminFetch('/api/admin/download-gallery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: formData.images,
          baseName: `gallery-${formData.custom_slug || formData.name || 'spot'}`,
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || '图集下载失败')
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `gallery-${formData.custom_slug || formData.name || 'spot'}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setMessage(`已开始下载整组图集（${formData.images.length} 张）。`)
    } catch (error: any) {
      setMessage(`Error: ${error?.message || '图集下载失败'}`)
    }
  }

  const handleDeleteGallery = async () => {
    if (!formData.images.length) return
    if (!window.confirm('您确定要清空图集吗？\n如果这些图片原生存储在 Supabase 云空间内，它们将会被彻底删除！')) {
      return
    }

    const urlsToDelete = [...formData.images]
    setFormData(prev => ({
      ...prev,
      images: []
    }))

    const supabaseUrls = urlsToDelete.filter(url => url.includes('supabase.co'))
    if (supabaseUrls.length > 0) {
      setMessage(`正在从云端删除 ${supabaseUrls.length} 张库内图片...`)
      try {
        const res = await adminFetch('/api/admin/delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: supabaseUrls }),
        })
        const data = await res.json()
        if (!res.ok) {
          setMessage(`图集已清空，但部分云端图片物理销毁失败: ${data?.error}`)
        } else {
          setMessage(`图集已清空，成功释放了 ${data.count || 0} 张云端图片。`)
        }
      } catch (e: any) {
        setMessage(`图集已清空，但删除请求发生异常: ${e.message}`)
      }
    } else {
      setMessage('图集已清空。')
    }
  }

  const handleDeleteCover = async () => {
    const urlToDelete = formData.image_url
    if (!urlToDelete) return

    const alsoUsedInGallery = formData.images.includes(urlToDelete)
    const shouldDeleteStorage = urlToDelete.includes('supabase.co') && !alsoUsedInGallery
    const confirmMessage = shouldDeleteStorage
      ? 'Delete this cover image?\n\nThis will clear the cover field and delete the Supabase file.'
      : alsoUsedInGallery
        ? 'Clear this cover image?\n\nThis image is also used in the gallery, so only the cover field will be cleared.'
        : 'Clear this cover image?\n\nExternal image files cannot be deleted here, so only the cover field will be cleared.'

    if (!window.confirm(confirmMessage)) return

    if (mode === 'edit' && initialData?.id) {
      const { error } = await supabase
        .from('locations')
        .update({ image_url: '' })
        .eq('id', initialData.id)

      if (error) {
        setMessage(`Error: Failed to clear cover from database: ${error.message}`)
        return
      }
    }

    setFormData((prev) => ({ ...prev, image_url: '' }))

    if (!shouldDeleteStorage) {
      setMessage(
        alsoUsedInGallery
          ? 'Cover cleared from this spot. The same image remains in the gallery.'
          : 'Cover cleared from this spot.'
      )
      return
    }

    try {
      const res = await adminFetch('/api/admin/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToDelete }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessage(`Cover cleared from this spot, but the Supabase file could not be deleted: ${data?.error || 'Unknown error'}`)
        return
      }
      setMessage('Cover cleared from this spot and Supabase file deleted.')
    } catch (error: any) {
      setMessage(`Cover cleared from this spot, but the delete request failed: ${error?.message || 'Unknown error'}`)
    }
  }


  const normalizeSuggestedTag = (tag: string) => {
    const normalized = String(tag || '').trim().toLowerCase()

    const aliases: Record<string, string> = {
      food: '美食',
      spot: '景点',
      hotel: '住宿',
      accommodation: '住宿',
      transport: '交通',
      shopping: '购物',
      nature: '自然',
      cafe: '咖啡',
      'night-view': '夜景',
      'sea-view': '海景',
      onsen: '温泉',
      family: '亲子',
    }

    return aliases[normalized] || String(tag || '').trim()
  }

  const imageFingerprint = (urlString: string) => {
    try {
      const url = new URL(urlString)
      return `${url.hostname.toLowerCase()}${url.pathname}`
    } catch {
      return urlString.trim()
    }
  }

  const dedupeImageUrls = (urls: string[]) => {
    const seen = new Set<string>()

    return urls.filter((url) => {
      const fingerprint = imageFingerprint(url)
      if (!fingerprint || seen.has(fingerprint)) return false
      seen.add(fingerprint)
      return true
    })
  }

  const dedupeRawUrls = (urls: string[]) => Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)))
  const visibleGalleryImages = formData.images
    .map((url, index) => ({ url, index }))
    .filter((item) => !formData.image_url || imageFingerprint(item.url) !== imageFingerprint(formData.image_url))

  const addPriceCustomItem = () => {
    setStructuredPriceInfo((prev) => ({
      ...prev,
      customItems: [...prev.customItems, { label: '', labelEn: '', value: '', valueSecondary: '', note: '' }],
    }))
  }

  const updatePriceCustomItem = (
    index: number,
    field: 'label' | 'labelEn' | 'value' | 'valueSecondary' | 'note',
    value: string
  ) => {
    setStructuredPriceInfo((prev) => ({
      ...prev,
      customItems: prev.customItems.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }))
  }

  const removePriceCustomItem = (index: number) => {
    setStructuredPriceInfo((prev) => ({
      ...prev,
      customItems: prev.customItems.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const addPriceInfoImages = () => {
    const nextUrls = dedupeRawUrls(
      priceImageInput
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )

    if (!nextUrls.length) return

    setStructuredPriceInfo((prev) => ({
      ...prev,
      infoImages: dedupeRawUrls([...prev.infoImages, ...nextUrls]),
    }))
    setPriceImageInput('')
  }

  const removePriceInfoImage = (url: string) => {
    setStructuredPriceInfo((prev) => ({
      ...prev,
      infoImages: prev.infoImages.filter((item) => item !== url),
    }))
  }

  const formatLastUpdated = (value?: string | null) => {
    if (!value) return '尚未记录'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const mergeTags = (currentTags: string, suggestedTags: string[]) => {
    const merged = new Set(
      currentTags
        .split(/[,，、]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )

    suggestedTags.forEach((tag) => {
      const normalized = normalizeSuggestedTag(tag)
      if (normalized) merged.add(normalized)
    })

    return Array.from(merged).join(', ')
  }

  const applyOpeningHoursSuggestion = (rawHours: string) => {
    const normalized = String(rawHours || '').trim()

    if (!normalized) return

    if (/24\/7|24 hours|24小时/i.test(normalized)) {
      setStructuredHours((prev) => ({
        ...prev,
        isUnknown: false,
        open: '00:00',
        close: '23:59',
        closedDays: [],
        remarks: normalized,
        is24Hours: true,
        scheduleGroups: [],
      }))
      return
    }

    const simpleRange = normalized.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (simpleRange) {
      setStructuredHours((prev) => ({
        ...prev,
        isUnknown: false,
        open: simpleRange[1],
        close: simpleRange[2],
        remarks: normalized,
        is24Hours: false,
        scheduleGroups: [],
      }))
      return
    }

    setStructuredHours((prev) => ({
      ...prev,
      isUnknown: false,
      remarks: normalized,
      scheduleGroups: [],
    }))
  }

  const parseGoogleOpeningHoursDraft = (rawText: string) => {
    const normalized = String(rawText || '')
      .replace(/\r/g, '')
      .replace(/[□?????]/g, '')
      .trim()

    if (!normalized) return null

    if (/24\s*hours|24\/7|24小时|全天开放/i.test(normalized)) {
      return {
        isUnknown: false,
        open: '00:00',
        close: '23:59',
        closedDays: [],
        remarks: '24 小时营业',
        is24Hours: true,
        scheduleGroups: [],
      } satisfies StructuredOpeningHours
    }

    const weekdayMap: Array<{ patterns: RegExp[]; index: number; label: string }> = [
      { index: 0, label: 'Sunday', patterns: [/^sunday$/i, /^sun$/i, /^星期日$/, /^星期天$/, /^周日$/] },
      { index: 1, label: 'Monday', patterns: [/^monday$/i, /^mon$/i, /^星期一$/, /^周一$/] },
      { index: 2, label: 'Tuesday', patterns: [/^tuesday$/i, /^tue(?:s)?$/i, /^星期二$/, /^周二$/] },
      { index: 3, label: 'Wednesday', patterns: [/^wednesday$/i, /^wed$/i, /^星期三$/, /^周三$/] },
      { index: 4, label: 'Thursday', patterns: [/^thursday$/i, /^thu(?:rs)?$/i, /^星期四$/, /^周四$/] },
      { index: 5, label: 'Friday', patterns: [/^friday$/i, /^fri$/i, /^星期五$/, /^周五$/] },
      { index: 6, label: 'Saturday', patterns: [/^saturday$/i, /^sat$/i, /^星期六$/, /^周六$/] },
    ]

    const lines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const blocks: Array<{ dayIndex: number; dayLabel: string; lines: string[] }> = []
    let currentBlock: { dayIndex: number; dayLabel: string; lines: string[] } | null = null

    const matchWeekday = (line: string) =>
      weekdayMap.find((weekday) => weekday.patterns.some((pattern) => pattern.test(line)))

    lines.forEach((line) => {
      const matchedDay = matchWeekday(line)
      if (matchedDay) {
        currentBlock = { dayIndex: matchedDay.index, dayLabel: matchedDay.label, lines: [] }
        blocks.push(currentBlock)
        return
      }

      if (!currentBlock) return
      currentBlock.lines.push(line)
    })

    if (!blocks.length) return null

    const normalizeTimeToken = (token: string, fallbackMeridiem?: 'am' | 'pm') => {
      const match = token.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
      if (!match) return null

      let hours = Number(match[1])
      const minutes = Number(match[2] || '0')
      const meridiem = (match[3] || fallbackMeridiem || '').toLowerCase() as 'am' | 'pm' | ''

      if (meridiem === 'pm' && hours < 12) hours += 12
      if (meridiem === 'am' && hours === 12) hours = 0

      if (!meridiem && fallbackMeridiem === 'pm' && hours < 12) hours += 12

      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }

    const parseRanges = (line: string) => {
      const ranges = Array.from(
        line.matchAll(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi)
      )

      return ranges
        .map((match) => {
          const rawStart = String(match[1] || '').trim()
          const rawEnd = String(match[2] || '').trim()
          const endMeridiem = /pm/i.test(rawEnd) ? 'pm' : /am/i.test(rawEnd) ? 'am' : undefined
          const startMeridiem = /pm/i.test(rawStart) ? 'pm' : /am/i.test(rawStart) ? 'am' : endMeridiem
          const start = normalizeTimeToken(rawStart, startMeridiem)
          const end = normalizeTimeToken(rawEnd, endMeridiem || startMeridiem)
          if (!start || !end) return null
          return { start, end }
        })
        .filter((item): item is { start: string; end: string } => Boolean(item))
    }

    const schedules = blocks.map((block) => {
      const joined = block.lines.join(' ')
      const isClosed = /closed|休息|公休|休业|休館/i.test(joined)
      const allRanges = block.lines.flatMap((line) => parseRanges(line))
      return {
        ...block,
        isClosed,
        ranges: allRanges,
      }
    })

    const openSchedules = schedules.filter((schedule) => !schedule.isClosed && schedule.ranges.length)
    if (!openSchedules.length) {
      return {
        isUnknown: true,
        open: '10:00',
        close: '22:00',
        closedDays: schedules.map((schedule) => schedule.dayIndex).sort((a, b) => a - b),
        remarks: '未识别到营业时段',
        is24Hours: false,
        scheduleGroups: [],
      } satisfies StructuredOpeningHours
    }

    const closedDays = weekdayMap
      .map((weekday) => weekday.index)
      .filter((index) => {
        const schedule = schedules.find((item) => item.dayIndex === index)
        return !schedule || schedule.isClosed
      })

    const scheduleFingerprint = (ranges: Array<{ start: string; end: string }>) =>
      ranges.map((range) => `${range.start}-${range.end}`).join(' / ')

    const primarySchedule = openSchedules
      .map((schedule) => ({
        fingerprint: scheduleFingerprint(schedule.ranges),
        ranges: schedule.ranges,
        count: openSchedules.filter((item) => scheduleFingerprint(item.ranges) === scheduleFingerprint(schedule.ranges)).length,
      }))
      .sort((left, right) => right.count - left.count)[0]

    const firstRange = primarySchedule.ranges[0]
    const lastRange = primarySchedule.ranges[primarySchedule.ranges.length - 1]
    const sameEveryOpenDay = openSchedules.every(
      (schedule) => scheduleFingerprint(schedule.ranges) === primarySchedule.fingerprint
    )

    const groupedSchedules = Array.from(
      new Map(
        openSchedules.map((schedule) => [
          scheduleFingerprint(schedule.ranges),
          {
            days: openSchedules
              .filter((item) => scheduleFingerprint(item.ranges) === scheduleFingerprint(schedule.ranges))
              .map((item) => item.dayIndex)
              .sort((a, b) => a - b),
            hours: schedule.ranges.map((range) => `${range.start}-${range.end}`).join(' / '),
          },
        ])
      ).values()
    ).map((group) => {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const buildDayLabel = (days: number[]) => {
        if (!days.length) return ''
        if (days.length === 1) return dayNames[days[0]]
        const isConsecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1)
        return isConsecutive ? `${dayNames[days[0]]}-${dayNames[days[days.length - 1]]}` : days.map((day) => dayNames[day]).join(', ')
      }

      return {
        days: group.days,
        label: buildDayLabel(group.days),
        hours: group.hours,
      }
    })

    return {
      isUnknown: false,
      open: firstRange.start,
      close: lastRange.end,
      closedDays,
      remarks: sameEveryOpenDay ? '' : groupedSchedules.map((group) => `${group.label} ${group.hours}`).join('\n'),
      is24Hours: false,
      scheduleGroups: sameEveryOpenDay ? [] : groupedSchedules,
    } satisfies StructuredOpeningHours
  }

  const handleApplySuggestedDescription = (value: string) => {
    const nextValue = String(value || '').trim()
    if (!nextValue) return

    setFormData((prev) => ({
      ...prev,
      review: nextValue,
    }))
  }

  const googleMapsQuery = [formData.name, formData.name_cn, formData.address]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')

  const googleMapsSearchUrl = googleMapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleMapsQuery)}`
    : ''

  const googleMapsCoordsUrl =
    formData.latitude.trim() && formData.longitude.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${formData.latitude},${formData.longitude}`)}`
      : ''

  const handleApplyGoogleHoursDraft = () => {
    const nextValue = String(googleHoursDraft || '').trim()

    if (!nextValue) {
      setMessage('Error: 请先贴上从 Google Maps 看到的营业时间文本。')
      return
    }

    const parsed = parseGoogleOpeningHoursDraft(nextValue)

    if (parsed) {
      setStructuredHours(parsed)
      setGoogleHoursDraft('')
      setMessage('已根据 Google Maps 文本自动整理营业时间、休息日与备注。')
      return
    }

    applyOpeningHoursSuggestion(nextValue)
    setGoogleHoursDraft('')
    setMessage('已把贴上的 Google Maps 营业时间带入当前表单，你还可以继续微调。')
  }

  const handleOpeningHoursModeChange = (value: string) => {
    if (value === 'unknown') {
      setStructuredHours((prev) => ({
        ...prev,
        isUnknown: true,
        is24Hours: false,
        open: '10:00',
        close: '22:00',
        closedDays: [],
        remarks: '',
        scheduleGroups: [],
      }))
      return
    }

    if (value === 'always') {
      setStructuredHours((prev) => ({
        ...prev,
        isUnknown: false,
        is24Hours: true,
        open: '00:00',
        close: '23:59',
        closedDays: [],
        scheduleGroups: [],
      }))
      return
    }

    setStructuredHours((prev) => ({
      ...prev,
      isUnknown: false,
      is24Hours: false,
      open: prev.open || '10:00',
      close: prev.close || '22:00',
      scheduleGroups: [],
    }))
  }

  const updateCoverFocusValue = (axis: 'x' | 'y', value: number) => {
    if (!formData.image_url) return

    setFormData((prev) => ({
      ...prev,
      image_url: withImageFocus(prev.image_url, {
        x: axis === 'x' ? value : coverFocus.focus.x,
        y: axis === 'y' ? value : coverFocus.focus.y,
      }),
    }))
  }

  const applyCoverFocusPreset = (x: number, y: number) => {
    if (!formData.image_url) return

    setFormData((prev) => ({
      ...prev,
      image_url: withImageFocus(prev.image_url, { x, y }),
    }))
  }

  const optimizeImage = async (file: File) => {
    if (
      !file.type.startsWith('image/') ||
      file.type === 'image/gif' ||
      file.type === 'image/svg+xml' ||
      file.size < 220 * 1024
    ) {
      return file
    }

    const objectUrl = URL.createObjectURL(file)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('鏃犳硶璇诲彇鍥剧墖鏂囦欢'))
        img.src = objectUrl
      })

      const maxDimension = 1600
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')
      if (!context) return file

      context.drawImage(image, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp', 0.76)
      })

      if (!blob) return file

      const fileName = file.name.replace(/\.[^.]+$/, '') || 'image'
      return new File([blob], `${fileName}.webp`, { type: 'image/webp' })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const uploadFilesToStorage = async (files: File[], target: 'cover' | 'gallery') => {
    if (!files.length) return []

    const optimizedFiles = await Promise.all(files.map(optimizeImage))
    const payload = new FormData()
    const selectedRegion = findRegionById(regions, Number.parseInt(formData.region_id, 10))
    const parentRegion = findRegionById(regions, selectedRegion?.parent_id || null)
    const country = getRegionCountry(selectedRegion, regions)

    payload.append('category', 'locations')
    payload.append('field', target === 'cover' ? 'image_url' : 'images')
    payload.append('target', target)
    if (country) payload.append('country', country)
    if (selectedRegion?.name) payload.append('city', parentRegion?.name || selectedRegion.name)
    if (formData.custom_slug || formData.name) payload.append('locationSlug', formData.custom_slug || formData.name)

    optimizedFiles.forEach((file) => {
      payload.append('files', file)
    })

    const endpoint = '/api/upload/r2'
    console.log(`[${target}-upload] endpoint:`, endpoint)

    const response = await adminFetch(endpoint, {
      method: 'POST',
      body: payload,
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || '涓婁紶澶辫触锛岃绋嶅悗閲嶈瘯')
    }

    const uploadedItems = Array.isArray(result.items) ? result.items : Array.isArray(result.files) ? result.files : []
    console.log('[admin-location-upload] R2 upload response', {
      target,
      urls: uploadedItems.map((item: { url?: string }) => item.url).filter(Boolean),
      result,
    })
    if (target === 'gallery') {
      console.log('[gallery-upload] endpoint:', endpoint)
      console.log('[gallery-upload] response:', result)
    }

    const supabaseStorageUrl = uploadedItems.find((item: { url?: string }) =>
      String(item?.url || '').includes('/storage/v1/object/public/location-images/')
    )
    if (supabaseStorageUrl) {
      throw new Error(`上传接口返回了 Supabase Storage URL，不允许保存：${supabaseStorageUrl.url}`)
    }

    uploadedItems.forEach((item: { url?: string }) => {
      if (item.url) assertR2ImageUrl(item.url)
    })

    return uploadedItems
  }

  const assertNoSupabaseStorageUrls = (urls: string[], source: string) => {
    const supabaseStorageUrl = urls.find((url) => url.includes('/storage/v1/object/public/location-images/'))
    if (supabaseStorageUrl) {
      throw new Error(`${source} 返回了 Supabase Storage URL，不允许保存：${supabaseStorageUrl}`)
    }
  }

  const assertStoredImageUrlsAreR2 = (imageUrl: string, images: string[]) => {
    const cleanCover = parseImageFocus(imageUrl || '').src
    assertR2ImageUrl(cleanCover)
    images.forEach((url) => assertR2ImageUrl(parseImageFocus(url || '').src))
  }

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    setUploadingCover(true)
    setMessage('正在上传封面图到 Cloudflare R2...')

    try {
      const uploaded = await uploadFilesToStorage(files.slice(0, 1), 'cover')
      const firstFile = uploaded[0]

      if (!firstFile?.url) {
        throw new Error('封面图上传结果异常')
      }

      assertR2ImageUrl(firstFile.url)
      setFormData((prev) => ({ ...prev, image_url: withImageFocus(firstFile.url, { x: 50, y: 50 }) }))
      setMessage('封面图上传成功，链接已自动填入。')
    } catch (error: any) {
      setMessage(`Error: ${error.message}`)
    } finally {
      setUploadingCover(false)
      event.target.value = ''
    }
  }

  const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[gallery-upload] file input changed', {
      fileCount: event.target.files?.length || 0,
    })
    const files = Array.from(event.target.files || [])
    if (!files.length) {
      setGalleryUploadStatus('没有选择图片。')
      return
    }

    if (files.length > MAX_DIRECT_GALLERY_UPLOAD_FILES) {
      const errorMessage = `一次最多上传 ${MAX_DIRECT_GALLERY_UPLOAD_FILES} 张图片，请分批上传。`
      setGalleryUploadStatus(errorMessage)
      setMessage(`Error: ${errorMessage}`)
      event.target.value = ''
      return
    }

    setUploadingGallery(true)
    setMessage(`正在上传 ${files.length} 张图库图片到 Cloudflare R2...`)
    setGalleryUploadStatus(`已选择 ${files.length} 张图片，正在上传到 Cloudflare R2...`)

    try {
      const uploaded = await uploadFilesToStorage(files, 'gallery')
      const urls: string[] = uploaded
        .map((file: { url?: string }) => file.url)
        .filter((url: string | undefined): url is string => Boolean(url))

      if (!urls.length) {
        throw new Error('图库图片上传结果异常')
      }

      urls.forEach((uploadedUrl) => {
        console.log('[gallery-upload] url used:', uploadedUrl)
        assertR2ImageUrl(uploadedUrl)
      })

      setFormData((prev) => ({
        ...prev,
        images: dedupeImageUrls([...prev.images, ...urls]),
      }))
      setMessage(`成功上传 ${urls.length} 张图片，已加入图库。`)
      setGalleryUploadStatus(`成功上传 ${urls.length} 张图片，已加入图库。`)
    } catch (error: any) {
      console.error('[gallery-upload] failed', error)
      setMessage(`Error: ${error.message}`)
      setGalleryUploadStatus(`上传失败：${error.message}`)
    } finally {
      setUploadingGallery(false)
      event.target.value = ''
    }
  }

  const handleAutoEnrichPlace = async () => {
    const query = [formData.name, formData.name_cn, formData.address].filter(Boolean).join(' ').trim()

    if (!query) {
      setMessage('Error: 请先填写景点名称或地址，再自动补全景点资讯、营业时间和标签。')
      return
    }

    setEnrichingPlace(true)
    setMessage('正在自动查询景点资讯、营业时间和标签建议...')

    try {
      const response = await adminFetch('/api/admin/place-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          category: formData.category,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '自动补全失败')
      }

      setFormData((prev) => ({
        ...prev,
        latitude: prev.latitude || String(result.latitude || ''),
        longitude: prev.longitude || String(result.longitude || ''),
        tags: mergeTags(prev.tags, Array.isArray(result.suggestedTags) ? result.suggestedTags : []),
      }))

      const suggestedDescription = String(result.suggestedDescription || '').trim()
      const openingHours = String(result.openingHours || '').trim()
      const suggestedTags = Array.isArray(result.suggestedTags) ? result.suggestedTags : []

      setEnrichmentSuggestion({
        suggestedDescription,
        openingHours,
        suggestedTags,
        displayName: String(result.displayName || ''),
      })

      if (result.openingHours) {
        applyOpeningHoursSuggestion(String(result.openingHours))
      }

      if (!formData.review.trim() && suggestedDescription) {
        handleApplySuggestedDescription(suggestedDescription)
      }

      const addedTagCount = suggestedTags.length
      setMessage(
        openingHours || suggestedDescription
          ? `已自动补到景点资讯候选${openingHours ? '、营业时间' : ''}，并补充 ${addedTagCount} 个标签建议。`
          : `已补充 ${addedTagCount} 个标签建议。`
      )
    } catch (error: any) {
      setMessage(`Error: ${error.message}`)
    } finally {
      setEnrichingPlace(false)
    }
  }

  // Fetch regions on mount
  useEffect(() => {
    const fetchRegions = async () => {
      const { data, error } = await supabase.from('regions').select('*').order('name')
      
      if (error) {
        console.error('Error fetching regions:', error)
        // Check if table exists
        if (error.code === '42P01') { // undefined_table
           console.warn('Regions table does not exist.')
        }
      } else {
        setRegions(data || [])
      }
    }
    fetchRegions()
  }, [])

  useEffect(() => {
    if (initialData) {
      const resolvedRegion = regions.find((region) => region.id === initialData.region_id)
      const resolvedCountry = getRegionCountry(resolvedRegion, regions)
      const resolvedPrimaryRegionId =
        resolvedCountry && resolvedCountry !== 'China' && resolvedRegion?.parent_id
          ? resolvedRegion.parent_id
          : resolvedRegion?.id || null

      setFormData({
        name: initialData.name || '',
        name_cn: initialData.name_cn || '',
        custom_slug: '',
        category: initialData.category || 'attraction',
        address: initialData.address || '',
        latitude: initialData.latitude?.toString() || '',
        longitude: initialData.longitude?.toString() || '',
        region_id: initialData.region_id ? initialData.region_id.toString() : 'null',
        video_url: initialData.video_url || '',
        facebook_video_url: initialData.facebook_video_url || '',
        image_url: initialData.image_url || '',
        // Keep images and image_url separate. Do not fallback to image_url for images array.
        images: Array.isArray(initialData.images) ? initialData.images : [],
        review: initialData.description || initialData.review || '',
        // Ensure tags are string if coming from DB array
        tags: Array.isArray(initialData.tags) ? initialData.tags.join(', ') : initialData.tags || '',
        visit_date: initialData.visit_date ? initialData.visit_date.split('T')[0] : new Date().toISOString().split('T')[0],
        opening_hours: initialData.opening_hours || '',
        price_info: initialData.price_info ? serializePriceInfo(parsePriceInfo(initialData.price_info)) : '',
        status: initialData.status || 'active'
      })

      if (resolvedCountry) {
        setFilterCountry(resolvedCountry)
      }
      setPrimaryRegionId(resolvedPrimaryRegionId ? String(resolvedPrimaryRegionId) : 'null')

      setLastUpdatedAt(initialData.updated_at || null)

      // Parse opening_hours if it exists
      if (initialData.opening_hours) {
        try {
          const parsed = JSON.parse(initialData.opening_hours)
          if (typeof parsed === 'object' && parsed !== null) {
            setStructuredHours({
              isUnknown: Boolean(parsed.isUnknown),
              open: parsed.open || '10:00',
              close: parsed.close || '22:00',
              closedDays: Array.isArray(parsed.closedDays) ? parsed.closedDays : [],
              remarks: parsed.remarks || '',
              is24Hours: parsed.is24Hours || false,
              scheduleGroups: Array.isArray((parsed as any).scheduleGroups) ? (parsed as any).scheduleGroups : [],
            })
          }
        } catch (e) {
          // If plain text, put it in remarks and keep defaults
          setStructuredHours({
            isUnknown: false,
            open: '10:00',
            close: '22:00',
            closedDays: [],
            remarks: initialData.opening_hours,
            is24Hours: false,
            scheduleGroups: [],
          })
        }
      } else {
        setStructuredHours({
          isUnknown: true,
          open: '10:00',
          close: '22:00',
          closedDays: [],
          remarks: '',
          is24Hours: false,
          scheduleGroups: [],
        })
      }

      if (initialData.price_info) {
        setStructuredPriceInfo(parsePriceInfo(initialData.price_info))
      } else {
        setStructuredPriceInfo(createDefaultPriceInfo())
      }
    }
  }, [initialData, regions])

  useEffect(() => {
    const loadCustomSlug = async () => {
      if (!initialData?.id) return
      setLoadingCustomSlug(true)
      try {
        const response = await adminFetch(`/api/admin/location-slugs?id=${initialData.id}`)
        if (!response.ok) return
        const result = await response.json()
        setFormData((prev) => ({ ...prev, custom_slug: String(result?.slug || '') }))
      } catch (error) {
        console.error('Error loading custom slug:', error)
      } finally {
        setLoadingCustomSlug(false)
      }
    }

    void loadCustomSlug()
  }, [initialData?.id])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleAddImage = async () => {
    if (imageInput.trim()) {
      const incomingUrls = imageInput
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)

      try {
        setResolvingExternalImages(true)
        const resolvedUrls = await resolveExternalImageLinks(incomingUrls)

        setFormData(prev => ({
          ...prev,
          images: dedupeImageUrls([...prev.images, ...resolvedUrls])
        }))
        setImageInput('')
        setMessage(`已加入 ${resolvedUrls.length} 张外部图片到图集。`)
      } catch (error: any) {
        setMessage(`Error: ${error.message}`)
      } finally {
        setResolvingExternalImages(false)
      }
    }
  }

  const resolveExternalImageLinks = async (urls: string[]) => {
    if (!urls.length) return []

    const response = await adminFetch('/api/admin/resolve-image-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || '外部图片链接解析失败')
    }

    return Array.isArray(result.urls) ? result.urls : []
  }

  const handleRemoveImage = async (index: number) => {
    const urlToDelete = formData.images[index]
    if (!urlToDelete) return

    if (!window.confirm('您确定要移除这张图片吗？\n注：如果图库是原生保存在 Supabase 的文件，这将会把它从云端彻底销毁，不可恢复！')) {
      return
    }

    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))

    if (urlToDelete.includes('supabase.co')) {
      try {
        const res = await adminFetch('/api/admin/delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlToDelete }),
        })
        if (!res.ok) {
          const data = await res.json()
          console.warn('Supabase 图片物理销毁失败:', data?.error)
        }
      } catch (e) {
        console.error('API Error during deletion:', e)
      }
    }
  }

  const moveGalleryImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return

    setFormData((prev) => {
      if (toIndex >= prev.images.length) return prev

      const nextImages = [...prev.images]
      const [moved] = nextImages.splice(fromIndex, 1)
      nextImages.splice(toIndex, 0, moved)

      return {
        ...prev,
        images: nextImages,
      }
    })
  }

  const handleSearchAddress = async () => {
    if (!formData.address) return
    setSearching(true)
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address)}`)
      const data = await response.json()
      if (data && data.length > 0) {
        const { lat, lon } = data[0]
        setFormData(prev => ({
          ...prev,
          latitude: lat,
          longitude: lon
        }))
        setMessage('地址搜索成功，经纬度已自动填入。')
      } else {
        setMessage('未找到该地址，请尝试更详细的描述。')
      }
    } catch (error) {
      console.error('Error searching address:', error)
      setMessage('地址搜索失败，请重试。')
    } finally {
      setSearching(false)
    }
  }

  // Sync structuredHours to formData.opening_hours
  useEffect(() => {
    const jsonString = JSON.stringify(structuredHours)
    setFormData(prev => ({
      ...prev,
      opening_hours: jsonString
    }))
  }, [structuredHours])

  useEffect(() => {
    const jsonString = serializePriceInfo(structuredPriceInfo)
    setFormData((prev) => ({
      ...prev,
      price_info: jsonString,
    }))
  }, [structuredPriceInfo])

  useEffect(() => {
    const region = regions.find((item) => String(item.id) === formData.region_id)
    const country = getRegionCountry(region, regions)
    const suggestedCurrency = COUNTRY_CURRENCY[String(country || '').trim()]
    const suggestedSecondaryCurrency = COUNTRY_SECONDARY_CURRENCY[String(country || '').trim()]

    if (!suggestedCurrency) return

    setStructuredPriceInfo((prev) => {
      if (prev.currency && prev.currency !== suggestedCurrency) return prev
      if (
        prev.currency === suggestedCurrency &&
        (prev.secondaryCurrency === suggestedSecondaryCurrency || (!prev.secondaryCurrency && !suggestedSecondaryCurrency))
      ) {
        return prev
      }
      return {
        ...prev,
        currency: suggestedCurrency,
        secondaryCurrency:
          prev.secondaryCurrency && prev.secondaryCurrency !== suggestedSecondaryCurrency
            ? prev.secondaryCurrency
            : (suggestedSecondaryCurrency || prev.secondaryCurrency),
        mealPartySize: prev.mealPartySize || 2,
      }
    })
  }, [formData.region_id, formData.category, regions])

  useEffect(() => {
    if (formData.category === 'food') {
      setStructuredPriceInfo((prev) => ({
        ...prev,
        mealPartySize: prev.mealPartySize > 1 ? prev.mealPartySize : 2,
      }))
    }
  }, [formData.category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    console.log('[save-location] image_url:', formData.image_url)
    console.log('[save-location] images:', formData.images)
    try {
      assertStoredImageUrlsAreR2(formData.image_url, formData.images)
    } catch (error: any) {
      setLoading(false)
      setMessage(`Error: ${error.message}`)
      return
    }

    // Use 'description' field as a fallback for 'review' to avoid "Column not found" error
    // if the user hasn't run the migration script yet.
    // The 'description' column already exists in the table.
    const submissionData = {
      name: formData.name,
      name_cn: formData.name_cn,
      category: formData.category,
      address: formData.address, // Add address to submission
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      region_id: formData.region_id === 'null' ? null : parseInt(formData.region_id), // Add region_id
      video_url: formData.video_url,
      facebook_video_url: formData.facebook_video_url, // Add facebook_video_url
      // Fallback: strictly use what's in the form.
      // We no longer overwrite image_url with images[0] to keep them separate.
      image_url: formData.image_url,
      images: formData.images, // Will be ignored by Supabase if column doesn't exist (unless we handle error)
      // review: formData.review, // REMOVED: Causing error if column doesn't exist
      description: formData.review, // CHANGED: Map 'review' input to 'description' column
      tags: formData.tags ? formData.tags.split(/[,，、]/).map((tag) => tag.trim()).filter((tag) => tag) : [],
      visit_date: formData.visit_date || null,
      opening_hours: JSON.stringify(structuredHours),
      price_info: serializePriceInfo(structuredPriceInfo),
      status: formData.status || 'active',
    }

    // Helper to execute DB operation
    const executeSave = async (data: any) => {
      if (mode === 'edit' && initialData?.id) {
        return await supabase
          .from('locations')
          .update(data)
          .eq('id', initialData.id)
          .select('id, updated_at')
          .single()
      } else {
        return await supabase
          .from('locations')
          .insert([data])
          .select('id, updated_at')
          .single()
      }
    }

    try {
      let { data: savedRecord, error } = await executeSave(submissionData)

      // --- Safe Save Fallback ---
      if (error && (error.message.includes('images') || error.message.includes('facebook_video_url') || error.message.includes('price_info') || error.message.includes('Column not found'))) {
        console.warn('New columns not found, retrying without them...')
        const safeData = { ...submissionData }
        const missingFields: string[] = []

        if (error.message.includes('images')) {
          delete (safeData as any).images
          missingFields.push('多图')
        }
        if (error.message.includes('facebook_video_url')) {
          delete (safeData as any).facebook_video_url
          missingFields.push('Facebook 视频')
        }
        if (error.message.includes('price_info')) {
          delete (safeData as any).price_info
          missingFields.push('花费参考')
        }

        if (error.message.includes('Column not found')) {
          delete (safeData as any).images
          delete (safeData as any).facebook_video_url
          delete (safeData as any).price_info
          if (!missingFields.length) {
            missingFields.push('多图', 'Facebook 视频', '花费参考')
          }
        }

        const retryResult = await executeSave(safeData)
        error = retryResult.error
        savedRecord = retryResult.data

        if (!error) {
          const fieldLabel = missingFields.length ? missingFields.join('、') : '新增字段'
          setMessage(`基础信息保存成功，但“${fieldLabel}”还没写入数据库。请先运行 SQL 脚本启用对应字段。`)
          router.refresh()
          setTimeout(() => router.push('/admin'), 3000)
          return
        }
      }
      // --------------------------

      if (error) throw error

      if (savedRecord?.id) {
        const slugResponse = await adminFetch('/api/admin/location-slugs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedRecord.id, slug: formData.custom_slug }),
        })

        if (!slugResponse.ok) {
          const slugPayload = await slugResponse.json().catch(() => ({}))
          throw new Error(slugPayload?.error || '保存自定义 slug 失败')
        }
      }

      setLastUpdatedAt(savedRecord?.updated_at || new Date().toISOString())
      setMessage(mode === 'edit' ? '更新成功！' : '发布成功！')
      
      // Force a router refresh to ensure data is up-to-date across the app
      router.refresh()
      
      if (mode === 'add') {
        // Reset form only on add
        setFormData({
          name: '',
          name_cn: '',
          custom_slug: '',
          category: 'attraction',
          address: '',
          latitude: '',
          longitude: '',
          region_id: 'null',
          video_url: '',
          facebook_video_url: '',
          image_url: '',
          images: [],
          review: '',
          tags: '',
          visit_date: new Date().toISOString().split('T')[0],
          opening_hours: '',
          price_info: '',
          status: 'active',
        })
        setPrimaryRegionId('null')
        setStructuredHours({
          isUnknown: true,
          open: '10:00',
          close: '22:00',
          closedDays: [],
          remarks: '',
          is24Hours: false,
          scheduleGroups: [],
        })
        setStructuredPriceInfo(createDefaultPriceInfo())
      } else {
        // Redirect back to list after edit
        setTimeout(() => router.push('/admin'), 1500)
      }
      
    } catch (error: any) {
      console.error('Error saving location:', error)
      setMessage(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const selectedRegion = regions.find((region) => String(region.id) === formData.region_id) || null
  const availableCountries = Array.from(
    new Set(regions.map((region) => getRegionCountry(region, regions)).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b))
  const normalizedRegionSearch = regionSearch.trim().toLowerCase()
  const currentCountry =
    filterCountry !== 'All' ? filterCountry : getRegionCountry(selectedRegion, regions) || 'All'
  const primaryRegions = currentCountry === 'All' ? [] : getCountryPrimaryRegions(regions, currentCountry)
  const selectedPrimaryRegion =
    primaryRegions.find((region) => String(region.id) === primaryRegionId) ||
    findRegionById(regions, selectedRegion?.parent_id) ||
    selectedRegion ||
    null
  const childRegions =
    currentCountry === 'All' || currentCountry === 'China'
      ? []
      : getChildRegions(regions, selectedPrimaryRegion?.id)
  const filteredPrimaryRegions = primaryRegions
    .filter((region) => {
      if (!normalizedRegionSearch) return true

      const haystack = [
        region.name,
        getRegionOptionLabel(region, regions),
        findRegionById(regions, region.parent_id)?.name || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedRegionSearch)
    })
    .sort((a, b) => getRegionOptionLabel(a, regions).localeCompare(getRegionOptionLabel(b, regions)))
  const filteredChildRegions = childRegions
    .filter((region) => {
      if (!normalizedRegionSearch) return true
      return [region.name, getRegionOptionLabel(region, regions)].join(' ').toLowerCase().includes(normalizedRegionSearch)
    })
    .sort((a, b) => getRegionOptionLabel(a, regions).localeCompare(getRegionOptionLabel(b, regions)))
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle>{mode === 'edit' ? '编辑景点' : '录入新景点'}</CardTitle>
        <CardDescription>
          {mode === 'edit' ? '修改现有景点资料' : '填写下方表单，把新的景点内容保存到数据库'}
        </CardDescription>
        {mode === 'edit' && initialData?.id ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>景点编号：#{initialData.id}</span>
              <span>最后更新：{formatLastUpdated(lastUpdatedAt)}</span>
            </div>
            <p className="mt-1 text-xs text-amber-800">
              如果另一台电脑也在编辑同一条资料，后保存的一方会覆盖先前修改。保存前先看一下这个时间。
            </p>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-gray-700">基础信息</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">主名称 (Primary)</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="没有英文名时，这里可以直接填中文"
                  required
                />
                <p className="text-xs text-gray-500">
                  这里放对外主要显示的名字；如果没有稳定英文名，可以直接放中文。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name_cn">中文名称</Label>
                <Input
                  id="name_cn"
                  name="name_cn"
                  value={formData.name_cn}
                  onChange={handleChange}
                  placeholder="例如：古来传统豆花"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom_slug">自定义网址 slug</Label>
              <Input
                id="custom_slug"
                name="custom_slug"
                value={formData.custom_slug}
                onChange={handleChange}
                placeholder="例如：guangzhou-tower 或 lao-xi-zi"
              />
              <p className="text-xs text-gray-500">
                {loadingCustomSlug ? '正在读取目前的 slug...' : '建议填写英文或拼音 slug。留空会自动生成安全网址；旧链接仍可打开，并会跳转到新的 canonical 网址。'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="category">分类</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attraction">景点</SelectItem>
                    <SelectItem value="food">美食</SelectItem>
                    <SelectItem value="accommodation">住宿</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">状态</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">正常营业</SelectItem>
                    <SelectItem value="permanently_closed">永久关闭</SelectItem>
                    <SelectItem value="temporarily_closed">暂时关闭</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visit_date">打卡日期</Label>
                <Input id="visit_date" name="visit_date" type="date" value={formData.visit_date} onChange={handleChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">标签</Label>
              <Input
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                placeholder="例如：亲子, 夜景, 打卡, featured-home"
              />
              <p className="text-xs text-gray-500">如果想让这个景点固定优先出现在首页精选景点，可加 `featured-home`。</p>
            </div>
          </div>

          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-gray-700">位置信息</h3>
            <div className="space-y-2">
              <Label htmlFor="address">地址</Label>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="输入地址或地点..."
                />
                <Button type="button" variant="secondary" onClick={handleSearchAddress} disabled={searching || !formData.address.trim()}>
                  {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  搜索
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAutoEnrichPlace}
                  disabled={enrichingPlace || (!formData.name.trim() && !formData.address.trim())}
                >
                  {enrichingPlace ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  自动补景点资讯/营业时间
                </Button>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Google Maps 辅助查询</p>
                  <p className="text-xs leading-5 text-slate-500">
                    用来快速核对营业时间和地点资讯。这里不会自动长期同步 Google 数据，你确认后再带回表单会更稳。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => googleMapsSearchUrl && window.open(googleMapsSearchUrl, '_blank', 'noopener,noreferrer')}
                    disabled={!googleMapsSearchUrl}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    打开 Google Maps 查询
                  </Button>

                  {googleMapsCoordsUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.open(googleMapsCoordsUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      用坐标查看地点
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="google-hours-draft">从 Google Maps 贴营业时间文本</Label>
                <Textarea
                  id="google-hours-draft"
                  value={googleHoursDraft}
                  onChange={(e) => setGoogleHoursDraft(e.target.value)}
                  placeholder="例如：每日 09:00-18:00 / 周三休息 / Public holiday hours may vary"
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={handleApplyGoogleHoursDraft} disabled={!googleHoursDraft.trim()}>
                    带入营业时间
                  </Button>
                </div>
              </div>
            </div>

            {enrichmentSuggestion ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-emerald-900">自动补全建议</p>
                      <p className="text-xs text-emerald-800">
                        先把候选资料放进来给你改，不会替你静默定稿。
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                      onClick={() => {
                        if (enrichmentSuggestion.suggestedDescription) {
                          handleApplySuggestedDescription(enrichmentSuggestion.suggestedDescription)
                        }
                        if (enrichmentSuggestion.openingHours) {
                          applyOpeningHoursSuggestion(enrichmentSuggestion.openingHours)
                        }
                      }}
                    >
                      一键采用建议
                    </Button>
                  </div>

                  {enrichmentSuggestion.displayName ? (
                    <div className="rounded-md bg-white/80 p-3 text-xs text-emerald-900">
                      匹配到的地点：{enrichmentSuggestion.displayName}
                    </div>
                  ) : null}

                  {enrichmentSuggestion.suggestedDescription ? (
                    <div className="space-y-2 rounded-md bg-white/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">景点资讯候选</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleApplySuggestedDescription(enrichmentSuggestion.suggestedDescription)}
                        >
                          带入到资讯栏
                        </Button>
                      </div>
                      <p className="whitespace-pre-line text-sm leading-6 text-gray-700">
                        {enrichmentSuggestion.suggestedDescription}
                      </p>
                    </div>
                  ) : null}

                  {enrichmentSuggestion.openingHours ? (
                    <div className="space-y-2 rounded-md bg-white/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">营业时间候选</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => applyOpeningHoursSuggestion(enrichmentSuggestion.openingHours)}
                        >
                          带入营业时间
                        </Button>
                      </div>
                      <p className="text-sm leading-6 text-gray-700">{enrichmentSuggestion.openingHours}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="latitude">纬度 (Lat)</Label>
                <Input id="latitude" name="latitude" value={formData.latitude} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">经度 (Lng)</Label>
                <Input id="longitude" name="longitude" value={formData.longitude} onChange={handleChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>所属地区</Label>
              <div className="space-y-2">
                <Input
                  value={regionSearch}
                  onChange={(e) => setRegionSearch(e.target.value)}
                  placeholder="搜索地区，例如 China / Harbin、Japan / Sapporo"
                />
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <Select
                  value={filterCountry}
                  onValueChange={(value) => {
                    setFilterCountry(value)
                    setPrimaryRegionId('null')
                    setFormData((prev) => ({ ...prev, region_id: 'null' }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="筛选国家" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Countries</SelectItem>
                    {availableCountries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={primaryRegionId}
                  onValueChange={(value) => {
                    setPrimaryRegionId(value)

                    if (value === 'null') {
                      setFormData((prev) => ({ ...prev, region_id: 'null' }))
                      return
                    }

                    setFormData((prev) => ({ ...prev, region_id: value }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={currentCountry === 'China' ? '选择城市/地区' : '选择一级地区'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">不指定</SelectItem>
                    {filteredPrimaryRegions.map((region) => (
                      <SelectItem key={region.id} value={String(region.id)}>
                        {getRegionOptionLabel(region, regions)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {currentCountry !== 'China' && filteredChildRegions.length > 0 ? (
                  <Select
                    value={selectedRegion?.parent_id ? formData.region_id : 'null'}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        region_id: value === 'null' ? primaryRegionId : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择二级地区（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">只用一级地区</SelectItem>
                      {filteredChildRegions.map((region) => (
                        <SelectItem key={region.id} value={String(region.id)}>
                          {getRegionOptionLabel(region, regions)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    {currentCountry === 'China'
                      ? '中国这里默认简化成 China / 城市，不再强制经过省份。'
                      : '当前一级地区下面没有更细的二级地区。'}
                  </div>
                )}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                现在按国家分层选择。像日本会是 Japan / Hokkaido / Sapporo，中国会简化成 China / Harbin。
              </p>
            </div>
          </div>


          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-gray-700">花费参考</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="priceCurrency">主要币种</Label>
                <Select
                  value={structuredPriceInfo.currency || '__none__'}
                  onValueChange={(value) =>
                    setStructuredPriceInfo((prev) => ({ ...prev, currency: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger id="priceCurrency">
                    <SelectValue placeholder="选择币种" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不显示币种</SelectItem>
                    <SelectItem value="RM">RM</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="THB">THB</SelectItem>
                    <SelectItem value="IDR">IDR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryPriceCurrency">第二币种</Label>
                <Select
                  value={structuredPriceInfo.secondaryCurrency || '__none__'}
                  onValueChange={(value) =>
                    setStructuredPriceInfo((prev) => ({ ...prev, secondaryCurrency: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger id="secondaryPriceCurrency">
                    <SelectValue placeholder="不显示第二币种" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不显示第二币种</SelectItem>
                    <SelectItem value="RM">RM</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="THB">THB</SelectItem>
                    <SelectItem value="IDR">IDR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">中国、日本这类海外地点可同时补一个 RM 给马来西亚旅客参考。</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceCheckedAt">最后核对日期</Label>
                <Input
                  id="priceCheckedAt"
                  type="date"
                  value={structuredPriceInfo.lastCheckedAt}
                  onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, lastCheckedAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="priceSource">价格来源</Label>
                <Input
                  id="priceSource"
                  value={structuredPriceInfo.priceSource}
                  onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, priceSource: e.target.value }))}
                  placeholder="例如：官网 / Klook / Trip.com / 现场价"
                />
              </div>
            </div>

            {shouldShowPriceReference ? (
              <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {isAttractionCategory ? '景点 / Attraction pricing' : isFoodCategory ? '美食 / Food budget' : '住宿 / Stay pricing'}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {isAttractionCategory ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="priceLocalAdult">本地成人票</Label>
                        <Input
                          id="priceLocalAdult"
                          value={structuredPriceInfo.admissionLocalAdult}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionLocalAdult: e.target.value }))}
                          placeholder="例如 3"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceLocalAdultSecondary">本地成人票第二币种</Label>
                        <Input
                          id="priceLocalAdultSecondary"
                          value={structuredPriceInfo.admissionLocalAdultSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionLocalAdultSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 2`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceLocalChild">本地小孩票</Label>
                        <Input
                          id="priceLocalChild"
                          value={structuredPriceInfo.admissionLocalChild}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionLocalChild: e.target.value }))}
                          placeholder="例如 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceLocalChildSecondary">本地小孩票第二币种</Label>
                        <Input
                          id="priceLocalChildSecondary"
                          value={structuredPriceInfo.admissionLocalChildSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionLocalChildSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 1`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceForeignAdult">外国成人票</Label>
                        <Input
                          id="priceForeignAdult"
                          value={structuredPriceInfo.admissionForeignAdult}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionForeignAdult: e.target.value }))}
                          placeholder="例如 10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceForeignAdultSecondary">外国成人票第二币种</Label>
                        <Input
                          id="priceForeignAdultSecondary"
                          value={structuredPriceInfo.admissionForeignAdultSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionForeignAdultSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 6`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceForeignChild">外国小孩票</Label>
                        <Input
                          id="priceForeignChild"
                          value={structuredPriceInfo.admissionForeignChild}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionForeignChild: e.target.value }))}
                          placeholder="例如 5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceForeignChildSecondary">外国小孩票第二币种</Label>
                        <Input
                          id="priceForeignChildSecondary"
                          value={structuredPriceInfo.admissionForeignChildSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionForeignChildSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 3`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceAdult">通用成人票</Label>
                        <Input
                          id="priceAdult"
                          value={structuredPriceInfo.admissionAdult}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionAdult: e.target.value }))}
                          placeholder="例如 120 / 免费 / 约 120-140"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceAdultSecondary">通用成人票第二币种</Label>
                        <Input
                          id="priceAdultSecondary"
                          value={structuredPriceInfo.admissionAdultSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionAdultSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 38`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceChild">通用儿童票</Label>
                        <Input
                          id="priceChild"
                          value={structuredPriceInfo.admissionChild}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionChild: e.target.value }))}
                          placeholder="例如 60 / 学生优惠"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceChildSecondary">通用儿童票第二币种</Label>
                        <Input
                          id="priceChildSecondary"
                          value={structuredPriceInfo.admissionChildSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, admissionChildSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 20`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceParking">停车费</Label>
                        <Input
                          id="priceParking"
                          value={structuredPriceInfo.parkingBudget}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, parkingBudget: e.target.value }))}
                          placeholder="例如 每次 5 / 每小时 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceParkingSecondary">停车费第二币种</Label>
                        <Input
                          id="priceParkingSecondary"
                          value={structuredPriceInfo.parkingBudgetSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, parkingBudgetSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 2`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceTransport">交通参考</Label>
                        <Input
                          id="priceTransport"
                          value={structuredPriceInfo.transportBudget}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, transportBudget: e.target.value }))}
                          placeholder="例如 往返车费约 20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceTransportSecondary">交通参考第二币种</Label>
                        <Input
                          id="priceTransportSecondary"
                          value={structuredPriceInfo.transportBudgetSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, transportBudgetSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 12`}
                        />
                      </div>
                      <div className="flex items-end md:col-span-2 xl:col-span-4">
                        <label className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                          <Checkbox
                            checked={structuredPriceInfo.isFree}
                            onCheckedChange={(checked) =>
                              setStructuredPriceInfo((prev) => ({ ...prev, isFree: Boolean(checked) }))
                            }
                          />
                          免费景点 / 免费入场
                        </label>
                      </div>
                    </>
                  ) : null}

                  {isFoodCategory ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="priceMeal">吃喝参考</Label>
                        <Input
                          id="priceMeal"
                          value={structuredPriceInfo.mealBudget}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, mealBudget: e.target.value }))}
                          placeholder="例如 16 / 35-60 / 约 120"
                        />
                        <p className="text-xs text-slate-500">
                          默认会按 {structuredPriceInfo.mealPartySize || 2} 人份自动换算成人均显示。
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceMealSecondary">吃喝参考第二币种</Label>
                        <Input
                          id="priceMealSecondary"
                          value={structuredPriceInfo.mealBudgetSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, mealBudgetSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 12`}
                        />
                        <p className="text-xs text-slate-500">会一起跟着人均换算并在前台双币展示。</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceMealPartySize">吃喝人数</Label>
                        <Select
                          value={String(structuredPriceInfo.mealPartySize || 2)}
                          onValueChange={(value) =>
                            setStructuredPriceInfo((prev) => ({ ...prev, mealPartySize: Math.max(1, Number(value) || 2) }))
                          }
                        >
                          <SelectTrigger id="priceMealPartySize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 人</SelectItem>
                            <SelectItem value="2">2 人</SelectItem>
                            <SelectItem value="3">3 人</SelectItem>
                            <SelectItem value="4">4 人</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : null}

                  {formData.category === 'accommodation' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="priceStay">住宿价格</Label>
                        <Input
                          id="priceStay"
                          value={structuredPriceInfo.accommodationBudget}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, accommodationBudget: e.target.value }))}
                          placeholder="例如 220"
                        />
                        <p className="text-xs text-slate-500">填你住到的大约价格，前台会自动整理成参考房价区间。</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priceStaySecondary">住宿价格第二币种</Label>
                        <Input
                          id="priceStaySecondary"
                          value={structuredPriceInfo.accommodationBudgetSecondary}
                          onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, accommodationBudgetSecondary: e.target.value }))}
                          placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 150`}
                        />
                        <p className="text-xs text-slate-500">可选，适合补 RM 或当地币做双币展示。</p>
                      </div>
                    </>
                  ) : null}
                </div>

                {isAttractionCategory ? (
                  <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">自定义费用项目</p>
                        <p className="text-xs text-slate-500">例如船票套餐、缆车方案、租椅费、寄物柜、冲凉费等。</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={addPriceCustomItem}>
                        添加费用项目
                      </Button>
                    </div>

                    {structuredPriceInfo.customItems.length ? (
                      <div className="space-y-3">
                        {structuredPriceInfo.customItems.map((item, index) => (
                          <div key={`price-custom-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                              <div className="space-y-2">
                                <Label>中文标题</Label>
                                <Input
                                  value={item.label}
                                  onChange={(e) => updatePriceCustomItem(index, 'label', e.target.value)}
                                  placeholder="例如 船票套餐 A"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>English Title</Label>
                                <Input
                                  value={item.labelEn}
                                  onChange={(e) => updatePriceCustomItem(index, 'labelEn', e.target.value)}
                                  placeholder="e.g. Boat Package A"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>价格 / Value</Label>
                                <Input
                                  value={item.value}
                                  onChange={(e) => updatePriceCustomItem(index, 'value', e.target.value)}
                                  placeholder="例如 RM40 adult / RM20 child"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>第二币种 / Secondary</Label>
                                <Input
                                  value={item.valueSecondary}
                                  onChange={(e) => updatePriceCustomItem(index, 'valueSecondary', e.target.value)}
                                  placeholder={`例如 ${structuredPriceInfo.secondaryCurrency || 'RM'} 12 / ${structuredPriceInfo.secondaryCurrency || 'RM'} 6`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>备注</Label>
                                <Input
                                  value={item.note}
                                  onChange={(e) => updatePriceCustomItem(index, 'note', e.target.value)}
                                  placeholder="例如 Boat transfer only"
                                />
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removePriceCustomItem(index)}>
                                删除项目
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4">
                      <p className="text-sm font-medium text-slate-800">费用资讯配图</p>
                      <p className="mt-1 text-xs text-slate-500">可贴 Imgbb 或其他图片直链，把票价表、现场价目牌、套餐图插入花费参考里。</p>
                      <div className="mt-3 flex flex-col gap-3 md:flex-row">
                        <Textarea
                          value={priceImageInput}
                          onChange={(e) => setPriceImageInput(e.target.value)}
                          placeholder="每行一个图片链接，或用逗号分隔"
                          rows={3}
                          className="md:flex-1"
                        />
                        <Button type="button" variant="secondary" onClick={addPriceInfoImages}>
                          添加图片
                        </Button>
                      </div>

                      {structuredPriceInfo.infoImages.length ? (
                        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                          {structuredPriceInfo.infoImages.map((url) => (
                            <div key={url} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                              <div className="relative aspect-[4/3]">
                                <FallbackImage
                                  src={url}
                                  alt="price info"
                                  fill
                                  sizes="240px"
                                  className="object-cover"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2 p-2">
                                <span className="truncate text-xs text-slate-500">费用配图</span>
                                <Button type="button" variant="ghost" className="h-auto px-2 py-1 text-xs text-red-600 hover:text-red-700" onClick={() => removePriceInfoImage(url)}>
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-end">
                <p className="text-xs text-gray-500">
                  {isAttractionCategory
                    ? '景点如果要区分本地人与外国人，可优先填写四种门票；停车费也会同步显示到前台。'
                    : isFoodCategory
                      ? '美食类会自动把总价换算成人均展示，更适合游客快速判断预算。'
                      : '住宿类会自动把你的输入整理成参考房价区间，更适合游客阅读和 SEO。'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priceNotes">价格备注</Label>
              <Textarea
                id="priceNotes"
                value={structuredPriceInfo.notes}
                onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="例如：旺季票价会上浮；日落时段需提前预约；餐厅低消另计。"
                rows={3}
              />
              <p className="text-xs text-gray-500">
                这里建议写“参考价”而不是死价格。门票、酒店、体验项目都可能因日期、节假日和平台活动浮动。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="klookWidgetCode">Klook Dynamic Widget HTML</Label>
              <Textarea
                id="klookWidgetCode"
                value={structuredPriceInfo.klookWidgetCode}
                onChange={(e) => setStructuredPriceInfo((prev) => ({ ...prev, klookWidgetCode: e.target.value }))}
                placeholder={`<ins class="klk-aff-widget" data-adid="..." data-prod="dynamic_widget"><a href="//www.klook.com/">Klook.com</a></ins>\n<script type="text/javascript">\n(function(){ ... })()\n</script>`}
                rows={8}
              />
              <p className="text-xs text-gray-500">
                可直接贴 Klook 提供的整段 widget code。保存后会显示在景点详情页预订推荐区域上方。
              </p>
            </div>
              </>
            ) : null}
          </div>

          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-gray-700">媒体信息</h3>

            <div className="space-y-2">
              <Label htmlFor="image_url">封面图 (Cover Thumbnail)</Label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-800">直接上传到 Cloudflare R2</p>
                    <p className="text-xs text-gray-500">
                      不用再经过 ImgBB。上传完成后会自动回填 R2 封面链接。
                    </p>
                  </div>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
                    <span className="inline-flex items-center rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-gray-100">
                      {uploadingCover ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      上传封面图
                    </span>
                  </label>
                </div>
                {formData.image_url ? (
                  <div className="mt-4 space-y-3">
                    <div className="relative h-44 overflow-hidden rounded-lg border bg-white">
                      <FallbackImage src={formData.image_url} alt="Cover preview" fill className="object-cover" />
                      <ImageMetadataBadge url={formData.image_url} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadImage(formData.image_url, `cover-${formData.custom_slug || formData.name || 'spot'}`)}
                      >
                        下载封面图
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteCover}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete cover
                      </Button>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                    </div>
                  </div>
                ) : null}
              </div>
              <Input
                id="image_url"
                name="image_url"
                value={formData.image_url}
                onChange={handleChange}
                placeholder="输入封面图片 URL"
              />
              <p className="text-xs text-gray-500">这张图片将作为卡片封面，不参与详情页轮播。</p>
            </div>

            <div className="space-y-2">
              <Label>展示图集 (Gallery Images)</Label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-800">批量上传图库图片</p>
                    <p className="text-xs text-gray-500">
                      可一次上传多张图片，系统会先压缩，再自动存入 Cloudflare R2 并加入当前图库。
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <input
                      ref={galleryFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleGalleryUpload}
                      disabled={uploadingGallery}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        console.log('[gallery-upload] choose button clicked')
                        galleryFileInputRef.current?.click()
                      }}
                      disabled={uploadingGallery}
                    >
                      {uploadingGallery ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                      批量上传图片
                    </Button>
                    {galleryUploadStatus ? (
                      <p className="max-w-sm text-xs text-gray-600">{galleryUploadStatus}</p>
                    ) : null}
                  </div>
                </div>
                {formData.images.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <Button type="button" variant="outline" onClick={handleDownloadGallery}>
                      下载整组图集 ZIP
                    </Button>
                    <Button type="button" variant="destructive" onClick={handleDeleteGallery}>
                      一键清空与删除图集
                    </Button>
                    <p className="text-xs text-gray-500">
                      下载转 WebP 后，你可用右侧按钮彻底清空旧图库释放空间。
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Textarea
                  value={imageInput}
                  onChange={(e) => setImageInput(e.target.value)}
                  placeholder={"输入图片 URL，支持一行一条\\nhttps://ibb.co/rRcTVxpj\\nhttps://ibb.co/Q7jdtXQt\\nhttps://i.ibb.co/....jpg"}
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!e.shiftKey) {
                        e.preventDefault()
                        handleAddImage()
                      }
                    }
                  }}
                />
                  <Button type="button" onClick={handleAddImage} variant="secondary" disabled={resolvingExternalImages}>
                  {resolvingExternalImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  转换并加入图集
                </Button>
              </div>
              <p className="text-xs text-gray-500">支持直接贴 `ibb.co / imgbb` 分享页链接，系统会自动转成可显示图片。</p>

              {visibleGalleryImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {visibleGalleryImages.map(({ url, index }, displayIndex) => {
                    const previousVisibleIndex = visibleGalleryImages[displayIndex - 1]?.index
                    const nextVisibleIndex = visibleGalleryImages[displayIndex + 1]?.index

                    return (
                    <div
                      key={url + '-' + index}
                      draggable
                      onDragStart={() => setDraggedGalleryIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedGalleryIndex === null) return
                        moveGalleryImage(draggedGalleryIndex, index)
                        setDraggedGalleryIndex(null)
                      }}
                      onDragEnd={() => setDraggedGalleryIndex(null)}
                      className={[
                        'group relative aspect-video overflow-hidden rounded-md bg-gray-100 ring-offset-2 transition',
                        draggedGalleryIndex === index ? 'ring-2 ring-amber-400' : '',
                      ].join(' ')}
                    >
                      <FallbackImage src={url} alt={'Preview ' + index} fill className="object-cover" />
                      <ImageMetadataBadge url={url} className="absolute top-8 right-1" />
                      <div className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] text-white">
                        <GripVertical className="h-3 w-3" />
                        <span>{displayIndex + 1}</span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-8 bg-white/90 px-2 text-[11px] hover:bg-white"
                            onClick={() => setFormData((prev) => ({ ...prev, image_url: withImageFocus(url, { x: 50, y: 50 }) }))}
                          >
                            设为封面
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 bg-white/90 hover:bg-white"
                            onClick={() => {
                              if (previousVisibleIndex !== undefined) moveGalleryImage(index, previousVisibleIndex)
                            }}
                            disabled={previousVisibleIndex === undefined}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 bg-white/90 hover:bg-white"
                            onClick={() => {
                              if (nextVisibleIndex !== undefined) moveGalleryImage(index, nextVisibleIndex)
                            }}
                            disabled={nextVisibleIndex === undefined}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-8 bg-white/90 px-2 text-[11px] hover:bg-white"
                            onClick={() => handleDownloadImage(url, `gallery-${formData.custom_slug || formData.name || 'spot'}-${index + 1}`)}
                          >
                            下载
                          </Button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute right-1 top-1 z-20 rounded-full bg-red-500 p-1.5 text-white shadow-md hover:bg-red-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                    )
                  })}
                </div>
              ) : null}
              {formData.image_url && formData.images.some((url) => imageFingerprint(url) === imageFingerprint(formData.image_url)) ? (
                <p className="text-xs text-amber-600">当前封面图仍保留在图集数据中，但前台图集会自动隐藏封面，避免重复展示。</p>
              ) : null}
              <p className="text-xs text-gray-500">提示：这些图片会按当前顺序显示在详情页轮播中，可直接拖动排序，也可用上下按钮微调。</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="video_url">YouTube 完整影片</Label>
                <Input
                  id="video_url"
                  name="video_url"
                  value={formData.video_url}
                  onChange={handleChange}
                  placeholder="https://youtube.com/..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook_video_url">Facebook 景点影片</Label>
                <Input
                  id="facebook_video_url"
                  name="facebook_video_url"
                  value={formData.facebook_video_url}
                  onChange={handleChange}
                  placeholder="https://www.facebook.com/jnqjourney/videos/..."
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-b pb-4">
            <Label className="font-semibold text-gray-700">开放时间</Label>
            <div className="space-y-4 rounded-md border bg-gray-50 p-4">
              <div className="space-y-2">
                <Label htmlFor="hoursMode" className="text-xs text-gray-500">营业时间状态</Label>
                <Select value={openingHoursMode} onValueChange={handleOpeningHoursModeChange}>
                  <SelectTrigger id="hoursMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">No information</SelectItem>
                    <SelectItem value="custom">自订营业时间</SelectItem>
                    <SelectItem value="always">24 小时营业</SelectItem>
                  </SelectContent>
                </Select>
                {openingHoursMode === 'unknown' ? (
                  <p className="text-xs text-slate-500">暂时查不到正确营业时间时先选这个，避免默认时间误导游客。</p>
                ) : null}
              </div>

              <div className={['flex items-center gap-4 transition-opacity', structuredHours.is24Hours || structuredHours.isUnknown ? 'pointer-events-none opacity-50' : ''].join(' ')}>
                <div className="space-y-1">
                  <Label htmlFor="openTime" className="text-xs text-gray-500">
                    开始时间
                  </Label>
                  <Input
                    id="openTime"
                    type="time"
                    value={structuredHours.open}
                    onChange={(e) => setStructuredHours((prev) => ({ ...prev, open: e.target.value }))}
                  />
                </div>
                <span className="mt-6 text-gray-400">-</span>
                <div className="space-y-1">
                  <Label htmlFor="closeTime" className="text-xs text-gray-500">
                    结束时间
                  </Label>
                  <Input
                    id="closeTime"
                    type="time"
                    value={structuredHours.close}
                    onChange={(e) => setStructuredHours((prev) => ({ ...prev, close: e.target.value }))}
                  />
                </div>
              </div>

              <div className={['space-y-2 transition-opacity', structuredHours.isUnknown ? 'pointer-events-none opacity-50' : ''].join(' ')}>
                <Label className="text-xs text-gray-500">休息日</Label>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {weekdayLabels.map((dayLabel, dayIndex) => (
                    <label key={dayIndex} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                      <Checkbox
                        checked={structuredHours.closedDays.includes(dayIndex)}
                        onCheckedChange={(checked) => {
                          setStructuredHours((prev) => ({
                            ...prev,
                            closedDays: checked
                              ? Array.from(new Set([...prev.closedDays, dayIndex])).sort((a, b) => a - b)
                              : prev.closedDays.filter((day) => day !== dayIndex),
                          }))
                        }}
                      />
                      <span>周{dayLabel}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hoursRemarks" className="text-xs text-gray-500">
                  备注 / 特殊情况
                </Label>
                <Textarea
                  id="hoursRemarks"
                  value={structuredHours.remarks}
                  onChange={(e) => setStructuredHours((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder={structuredHours.isUnknown ? '例如：暂未查到、等待确认' : '例如：公众假期营业时间可能调整'}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review">景点资讯 / Description</Label>
            <Textarea
              id="review"
              name="review"
              value={formData.review}
              onChange={handleChange}
              placeholder="补充景点特色、注意事项、推荐玩法等"
              rows={5}
            />
          </div>

          {mode === 'edit' && initialData?.id ? (
            <AdminAffiliateLinksPanel
              locationId={initialData.id}
              locationName={formData.name || initialData.name || '当前景点'}
              regionId={formData.region_id !== 'null' ? Number(formData.region_id) : null}
              regionName={
                regions.find((region) => String(region.id) === formData.region_id)?.name ||
                initialData?.regions?.name ||
                null
              }
            />
          ) : null}

          {message ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.push('/admin')}>
              返回列表
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {mode === 'edit' ? '保存更新' : '发布景点'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}



