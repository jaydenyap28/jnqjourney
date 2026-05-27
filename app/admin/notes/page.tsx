'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Image as ImageIcon, Plus, Save, Search, Trash2 } from 'lucide-react'

import type { LongformNote, NoteBlock, NoteImageSize } from '@/lib/notes'
import {
  buildFallbackAlt,
  DEFAULT_NOTE_COVER_ACCENT,
  EMPTY_NOTE,
  getRenderableNoteBlocks,
  convertBlocksToMarkdown,
  parseMarkdownToBlocks,
} from '@/lib/notes'
import { adminFetch } from '@/lib/admin-fetch'
import { supabase } from '@/lib/supabase'
import FallbackImage from '@/components/FallbackImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
  image_url?: string | null
  images?: string[] | null
  category?: string | null
  regions?: RegionOption | null
}

interface AffiliateOption {
  id: number
  title?: string | null
  provider?: string | null
  link_type?: string | null
  url?: string | null
  locations?: { name?: string | null; name_cn?: string | null } | null
  regions?: { name?: string | null; name_cn?: string | null; country?: string | null } | null
}

interface KlookWidgetOption {
  id: string
  title: string
  description?: string
  isActive: boolean
}

function slugify(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseCommaSeparated(value: string) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringifyCommaSeparated(value?: string[]) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function getLocationLabel(location?: LocationOption | null) {
  if (!location) return ''
  return location.name_cn || location.name
}

const IMAGE_SIZE_OPTIONS: { value: NoteImageSize; label: string }[] = [
  { value: 'wide', label: 'Wide' },
  { value: 'medium', label: 'Medium' },
  { value: 'small', label: 'Small' },
  { value: 'full', label: 'Full' },
]

function getImageFigureClass(size?: NoteImageSize, isFullPreview = false) {
  if (size === 'small') return 'max-w-sm'
  if (size === 'medium') return 'max-w-2xl'
  if (size === 'full') return 'max-w-full'
  return isFullPreview ? 'max-w-4xl' : 'max-w-3xl'
}

function getGalleryClass(size?: NoteImageSize, count = 1) {
  const widthClass = size === 'small' ? 'max-w-xl' : size === 'medium' ? 'max-w-2xl' : size === 'full' ? 'max-w-full' : 'max-w-4xl'
  const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  return `${widthClass} ${gridClass}`
}

function imageMarkdown(size: NoteImageSize) {
  const sizeText = size && size !== 'wide' ? `{size=${size}}` : ''
  return `![图片描述](https://)${sizeText}`
}

function getLocationImages(location?: LocationOption | null) {
  if (!location) return []
  const items = [location.image_url, ...(location.images || [])].filter(Boolean) as string[]
  return Array.from(new Set(items))
}

function renderableBlocks(note: LongformNote) {
  return getRenderableNoteBlocks(note)
}

function getDisplayKicker(kicker?: string | null) {
  const value = String(kicker || '').trim()
  return value && value.toLowerCase() !== 'longform note' ? value : ''
}

function getYoutubeEmbedUrl(url: string) {
  const value = String(url || '').trim()
  const match = value.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return match ? `https://www.youtube.com/embed/${match[1]}` : ''
}

function getFacebookVideoEmbedUrl(url: string) {
  const value = String(url || '').trim()
  return /facebook\.com|fb\.watch/i.test(value)
    ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&show_text=false&width=720`
    : ''
}

function getCoverVideoEmbedUrl(url?: string | null) {
  const value = String(url || '').trim()
  if (!value) return ''
  return getYoutubeEmbedUrl(value) || getFacebookVideoEmbedUrl(value)
}

function CoverVideoPreview({ url, title }: { url?: string | null; title: string }) {
  const embedUrl = getCoverVideoEmbedUrl(url)
  if (!embedUrl) return null

  return (
    <iframe
      src={embedUrl}
      title={title}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  )
}

function BlockPreview({
  block,
  locationsById,
  isFullPreview = false,
}: {
  block: NoteBlock
  locationsById: Map<number, LocationOption>
  isFullPreview?: boolean
}) {
  if (block.type === 'heading') {
    if (isFullPreview) {
      return (
        <h2 id={`heading-${block.id}`} className="max-w-2xl mx-auto pt-10 pb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl scroll-mt-24">
          {block.content}
        </h2>
      )
    }
    return (
      <h3 className="pt-6 pb-2 text-2xl font-bold tracking-tight text-white border-l-2 border-amber-400 pl-3">
        {block.content}
      </h3>
    )
  }

  if (block.type === 'quote') {
    if (isFullPreview) {
      return (
        <blockquote className="max-w-2xl mx-auto rounded-[32px] border border-amber-200/15 bg-amber-200/10 px-8 py-6 text-xl leading-9 text-white/88 my-8 relative pl-12">
          <span className="absolute left-4 top-3 text-5xl font-serif text-amber-400/40 select-none">“</span>
          {block.content}
        </blockquote>
      )
    }
    return (
      <blockquote className="relative my-6 rounded-[24px] border border-amber-200/10 bg-gradient-to-br from-amber-500/5 to-transparent px-6 py-5 text-lg italic leading-8 text-amber-100/90 pl-10">
        <span className="absolute left-3 top-2 text-4xl font-serif text-amber-400/40">“</span>
        {block.content}
      </blockquote>
    )
  }

  if (block.type === 'image' && block.imageUrl) {
    const alt = block.alt?.trim() || buildFallbackAlt(undefined, block.caption)
    if (isFullPreview) {
      return (
        <figure className={`${getImageFigureClass(block.imageSize, true)} mx-auto w-full my-10 space-y-3 group`}>
          <div className="relative aspect-[16/9] overflow-hidden rounded-[34px] border border-white/10 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
            <FallbackImage src={block.imageUrl} alt={alt} fill sizes="(max-width: 1024px) 100vw, 980px" className="object-cover" />
          </div>
          {block.caption ? <figcaption className="px-2 text-sm leading-7 text-white/55 text-center italic">{block.caption}</figcaption> : null}
        </figure>
      )
    }
    return (
      <figure className={`${getImageFigureClass(block.imageSize)} mx-auto w-full space-y-2 my-6`}>
        <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-lg">
          <FallbackImage src={block.imageUrl} alt={alt} fill sizes="(max-width: 1024px) 100vw, 760px" className="object-cover" />
        </div>
        {block.caption ? <figcaption className="text-xs text-white/55 text-center">{block.caption}</figcaption> : null}
      </figure>
    )
  }

  if ((block.type === 'gallery' || block.type === 'spotImages') && block.images?.length) {
    const spot = block.spotId ? locationsById.get(block.spotId) : null
    const spotLabel = block.spotName || (spot ? spot.name_cn || spot.name : '')
    if (isFullPreview) {
      return (
        <div className="max-w-4xl mx-auto w-full my-10 space-y-6 rounded-[36px] border border-white/10 bg-white/[0.02] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.25)] backdrop-blur-md">
          <div className="hidden">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <span className="text-sm">📍</span>
              </div>
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h4 className="text-xl font-bold text-white tracking-tight">{spot?.name_cn || spotLabel}</h4>
                  {spot?.name_cn && spot.name && (
                    <span className="text-sm font-normal text-white/50">{spot.name}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/40 uppercase tracking-widest">
                  {spot?.regions ? `${spot.regions.country} · ${spot.regions.name_cn || spot.regions.name}` : '旅行相册'}
                </p>
              </div>
            </div>
            {spot && (
              <span className="text-xs text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                关联景点已链接 ✓
              </span>
            )}
          </div>
          <div className={`mx-auto grid gap-5 ${getGalleryClass(block.imageSize, block.images.length)}`}>
            {block.images.map((image, index) => (
              <div key={`${block.id}-${index}`} className="space-y-2 group">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[26px] border border-white/10 bg-white/5 shadow-md">
                  <FallbackImage src={image.src} alt={image.alt || 'Travel photo'} fill sizes="(max-width: 1024px) 100vw, 400px" className="object-cover" />
                </div>
                {image.caption ? <p className="px-2 text-xs text-white/45 text-center leading-relaxed tracking-wide italic">{image.caption}</p> : null}
              </div>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-4 rounded-[28px] border border-emerald-500/10 bg-emerald-500/5 p-4 my-6">
        <div className="hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
              <span className="text-sm">📍</span>
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm">{spotLabel || '景点相册'}</h4>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">{spot?.regions?.name_cn || '旅行相册'}</p>
            </div>
          </div>
          <span className="text-xs text-emerald-400 font-medium">关联景点已链接 ✓</span>
        </div>
        <div className={`mx-auto grid gap-3 ${getGalleryClass(block.imageSize, block.images.length)}`}>
          {block.images.map((image, index) => (
            <figure key={`${block.id}-${index}`} className="relative group overflow-hidden rounded-xl aspect-[4/3] border border-white/5">
              <FallbackImage
                src={image.src}
                alt={image.alt || 'Travel photo'}
                fill
                sizes="300px"
                className="object-cover"
              />
            </figure>
          ))}
        </div>
      </div>
    )
  }

  if (block.type === 'spot' && block.spotId) {
    const spot = locationsById.get(block.spotId)
    if (isFullPreview) {
      if (!spot) return null
      return (
        <div className="max-w-3xl mx-auto w-full my-8">
          <div className="grid gap-5 overflow-hidden rounded-[30px] border border-white/10 bg-white/5 md:grid-cols-[240px_minmax(0,1fr)] shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
            <div className="relative aspect-[4/3] overflow-hidden bg-black/20">
              <FallbackImage
                src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'}
                alt={spot.name_cn || spot.name}
                fill
                sizes="(max-width: 768px) 100vw, 240px"
                className="object-cover"
              />
            </div>
            <div className="p-6 flex flex-col justify-center text-left">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Related Spot / 相关景点</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{spot.name_cn || spot.name}</h3>
              <p className="mt-3 text-sm leading-7 text-gray-300 line-clamp-3">
                点击前往景点详情页，可查看此景点的开放时间、详细交通方式、门票信息、以及更多深度的旅行游记与用户评价。
              </p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="my-6 rounded-[24px] border border-white/10 bg-white/5 p-4 flex gap-4 items-center">
        <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-black/20 shrink-0">
          <FallbackImage
            src={spot?.image_url || spot?.images?.[0] || '/placeholder-image.jpg'}
            alt={spot?.name_cn || spot?.name || 'Spot'}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>
        <div className="text-left">
          <h4 className="font-semibold text-white">{spot?.name_cn || spot?.name || 'Linked Spot'}</h4>
          <p className="text-xs text-white/50 line-clamp-1">{spot?.regions?.country} / {spot?.regions?.name_cn || spot?.regions?.name}</p>
        </div>
      </div>
    )
  }

  if (isFullPreview) {
    return (
      <p className="max-w-2xl mx-auto text-[1.08rem] leading-9 text-gray-200 whitespace-pre-wrap md:text-[1.13rem] tracking-wide my-6 text-left">
        {block.content}
      </p>
    )
  }

  return <p className="text-base leading-8 text-gray-200 whitespace-pre-wrap my-4 text-left">{block.content}</p>
}

export default function AdminNotesPage() {
  const [notes, setNotes] = useState<LongformNote[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [form, setForm] = useState<LongformNote>(EMPTY_NOTE)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateOption[]>([])
  const [klookWidgets, setKlookWidgets] = useState<KlookWidgetOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<'split' | 'preview'>('split')

  const [pickerOpen, setPickerOpen] = useState(false)
  const [affiliatePickerOpen, setAffiliatePickerOpen] = useState(false)
  const [klookPickerOpen, setKlookPickerOpen] = useState(false)
  const [spotQuery, setSpotQuery] = useState('')
  const [affiliateQuery, setAffiliateQuery] = useState('')
  const [klookQuery, setKlookQuery] = useState('')
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null)
  const [selectedSpotImageUrls, setSelectedSpotImageUrls] = useState<string[]>([])
  const [selectedAffiliateIds, setSelectedAffiliateIds] = useState<number[]>([])
  const [selectedKlookWidgetIds, setSelectedKlookWidgetIds] = useState<string[]>([])
  const [imageInsertSize, setImageInsertSize] = useState<NoteImageSize>('wide')
  const [markdownText, setMarkdownText] = useState('')
  const markdownSelectionRef = useRef({ start: 0, end: 0 })

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      try {
        const [notesResponse, locationsResponse, affiliateResponse, widgetsResponse] = await Promise.all([
          adminFetch('/api/admin/notes', { cache: 'no-store' }),
          supabase
            .from('locations')
            .select('id,name,name_cn,image_url,images,category,regions:region_id(id,name,name_cn,country)')
            .order('id', { ascending: false }),
          supabase
            .from('affiliate_links')
            .select('id,title,provider,link_type,url,locations:location_id(name,name_cn),regions:region_id(name,name_cn,country)')
            .eq('is_active', true)
            .order('id', { ascending: false })
            .limit(200),
          adminFetch('/api/admin/klook-widgets', { cache: 'no-store' }),
        ])

        const notesResult = notesResponse.ok ? await notesResponse.json() : { notes: [] }
        const widgetsResult = widgetsResponse.ok ? await widgetsResponse.json() : { widgets: [] }
        if (cancelled) return

        const nextNotes = Array.isArray(notesResult?.notes) ? notesResult.notes : []
        setNotes(nextNotes)
        setLocations((locationsResponse.data || []).map((item: any) => ({
          ...item,
          regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
        })))
        setAffiliateLinks(((affiliateResponse.data || []) as any[]).map((item) => ({
          ...item,
          locations: Array.isArray(item?.locations) ? item.locations[0] || null : item?.locations || null,
          regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
        })))
        setKlookWidgets((Array.isArray(widgetsResult?.widgets) ? widgetsResult.widgets : []).filter((widget: KlookWidgetOption) => widget.isActive !== false))

        if (nextNotes.length) {
          setSelectedSlug(nextNotes[0].slug)
          const firstNote = nextNotes[0]
          const hydrated = {
            ...firstNote,
            blocks: renderableBlocks(firstNote),
          }
          setForm(hydrated)
          setMarkdownText(hydrated.content || convertBlocksToMarkdown(hydrated.blocks))
        } else {
          setForm(EMPTY_NOTE)
          setMarkdownText('')
        }
      } catch {
        if (!cancelled) {
          setNotes([])
          setLocations([])
          setAffiliateLinks([])
          setKlookWidgets([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedSlug) return
    const selected = notes.find((item) => item.slug === selectedSlug)
    if (!selected) return
    const hydrated = {
      ...selected,
      blocks: renderableBlocks(selected),
    }
    setForm(hydrated)
    setMarkdownText(hydrated.content || convertBlocksToMarkdown(hydrated.blocks))
    setMessage('')
  }, [notes, selectedSlug])

  const locationsById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations])

  const filteredSpots = useMemo(() => {
    const keyword = spotQuery.trim().toLowerCase()
    if (!keyword) return locations.slice(0, 20)
    return locations
      .filter((location) => {
        const haystack = `${location.name} ${location.name_cn || ''} ${location.regions?.name || ''} ${location.regions?.name_cn || ''}`.toLowerCase()
        return haystack.includes(keyword)
      })
      .slice(0, 30)
  }, [locations, spotQuery])

  const filteredAffiliateLinks = useMemo(() => {
    const keyword = affiliateQuery.trim().toLowerCase()
    return affiliateLinks
      .filter((link) => {
        const haystack = `${link.title || ''} ${link.provider || ''} ${link.link_type || ''} ${link.locations?.name || ''} ${link.locations?.name_cn || ''} ${link.regions?.name || ''} ${link.regions?.name_cn || ''}`.toLowerCase()
        return !keyword || haystack.includes(keyword)
      })
      .slice(0, 80)
  }, [affiliateLinks, affiliateQuery])

  const filteredKlookWidgets = useMemo(() => {
    const keyword = klookQuery.trim().toLowerCase()
    return klookWidgets
      .filter((widget) => {
        const haystack = `${widget.title || ''} ${widget.description || ''}`.toLowerCase()
        return !keyword || haystack.includes(keyword)
      })
      .slice(0, 80)
  }, [klookWidgets, klookQuery])

  const selectedSpot = selectedSpotId ? locationsById.get(selectedSpotId) || null : null
  const selectedSpotImages = useMemo(() => getLocationImages(selectedSpot), [selectedSpot])

  const previewBlocks = useMemo(() => parseMarkdownToBlocks(markdownText), [markdownText])

  function createNewNote() {
    setSelectedSlug('')
    setForm(EMPTY_NOTE)
    setMarkdownText('')
    setMessage('')
  }

  function updateForm(patch: Partial<LongformNote>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function openMarkdownSpotPicker() {
    rememberMarkdownSelection()
    setPickerOpen(true)
    setSpotQuery('')
    setSelectedSpotId(null)
    setSelectedSpotImageUrls([])
  }

  function openAffiliatePicker() {
    rememberMarkdownSelection()
    setAffiliatePickerOpen(true)
    setAffiliateQuery('')
    setSelectedAffiliateIds([])
  }

  function openKlookPicker() {
    rememberMarkdownSelection()
    setKlookPickerOpen(true)
    setKlookQuery('')
    setSelectedKlookWidgetIds([])
  }

  function rememberMarkdownSelection() {
    const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement | null
    if (!textarea) return
    markdownSelectionRef.current = {
      start: textarea.selectionStart ?? textarea.value.length,
      end: textarea.selectionEnd ?? textarea.value.length,
    }
  }

  function insertTextAtCursor(textToInsert: string) {
    const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement
    const savedSelection = markdownSelectionRef.current
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    if (!textarea && !markdownText) {
      setMarkdownText(textToInsert.trim())
      window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY))
      return
    }

    const text = textarea?.value ?? markdownText
    const start = textarea
      ? Math.min(savedSelection.start, text.length)
      : text.length
    const end = textarea
      ? Math.min(savedSelection.end, text.length)
      : text.length
    const before = text.substring(0, start)
    const after = text.substring(end, text.length)

    const needsBeforeBreak = before.trim().length > 0 && !before.endsWith('\n\n')
    const needsAfterBreak = after.trim().length > 0 && !after.startsWith('\n\n')
    const insertion = `${needsBeforeBreak ? '\n\n' : ''}${textToInsert.trim()}${needsAfterBreak ? '\n\n' : ''}`
    const nextText = before + insertion + after
    setMarkdownText(nextText)

    setTimeout(() => {
      if (!textarea) return
      const nextCursor = start + insertion.length
      textarea.selectionStart = textarea.selectionEnd = nextCursor
      markdownSelectionRef.current = { start: nextCursor, end: nextCursor }
      window.scrollTo(scrollX, scrollY)
    }, 0)
  }

  function applySpotImagesToMarkdown() {
    if (!selectedSpot) return
    const scrollX = window.scrollX
    const scrollY = window.scrollY

    const imagesList = selectedSpotImageUrls.join(',')
    const sizeText = imageInsertSize && imageInsertSize !== 'wide' ? ` size="${imageInsertSize}"` : ''
    const shortcode = `[spot-images id="${selectedSpot.id}" name="${getLocationLabel(selectedSpot)}" images="${imagesList}"${sizeText}]`

    insertTextAtCursor(shortcode)
    setPickerOpen(false)
    window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY))
    setMessage(`Inserted ${selectedSpotImageUrls.length} image${selectedSpotImageUrls.length > 1 ? 's' : ''} for "${getLocationLabel(selectedSpot)}" at the saved cursor position.`)
  }

  function applyAffiliateLinksToMarkdown() {
    if (!selectedAffiliateIds.length) return
    insertTextAtCursor(`[affiliate ids="${selectedAffiliateIds.join(',')}" title="Recommended Links" content=""]`)
    setAffiliatePickerOpen(false)
    setMessage(`Inserted ${selectedAffiliateIds.length} affiliate link${selectedAffiliateIds.length > 1 ? 's' : ''} at the saved cursor position.`)
  }

  function applyKlookWidgetsToMarkdown() {
    if (!selectedKlookWidgetIds.length) return
    insertTextAtCursor(`[klook-widget ids="${selectedKlookWidgetIds.join(',')}" title="Klook" content=""]`)
    setKlookPickerOpen(false)
    setMessage(`Inserted ${selectedKlookWidgetIds.length} Klook widget${selectedKlookWidgetIds.length > 1 ? 's' : ''} at the saved cursor position.`)
  }

  async function saveNote() {
    setSaving(true)
    setMessage('')

    const parsedBlocks = parseMarkdownToBlocks(markdownText)

    const payload: LongformNote & { previousSlug?: string } = {
      ...form,
      slug: form.slug || slugify(form.title),
      shortTitle: form.shortTitle || form.title,
      tags: parseCommaSeparated(stringifyCommaSeparated(form.tags)),
      content: markdownText.trim(),
      blocks: parsedBlocks,
      updatedAt: new Date().toISOString(),
      previousSlug: selectedSlug || undefined,
    }

    try {
      const response = await adminFetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to save note.')

      const nextNote = result.note as LongformNote
      const hydrated = { ...nextNote, blocks: renderableBlocks(nextNote) }
      setNotes((current) => {
        const existing = current.findIndex((item) => item.slug === selectedSlug || item.slug === nextNote.slug)
        if (existing >= 0) {
          const next = [...current]
          next[existing] = hydrated
          return next
        }
        return [hydrated, ...current]
      })
      setSelectedSlug(hydrated.slug)
      setForm(hydrated)
      setMarkdownText(hydrated.content || convertBlocksToMarkdown(hydrated.blocks))
      setMessage(hydrated.published ? 'Published note saved.' : 'Draft saved.')
    } catch (error: any) {
      setMessage(error?.message || 'Failed to save note.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCurrentNote() {
    if (!form.slug) return
    try {
      const response = await adminFetch(`/api/admin/notes?slug=${encodeURIComponent(form.slug)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete note.')
      const remaining = notes.filter((item) => item.slug !== form.slug)
      setNotes(remaining)
      if (remaining.length) {
        setSelectedSlug(remaining[0].slug)
        setForm({ ...remaining[0], blocks: renderableBlocks(remaining[0]) })
      } else {
        createNewNote()
      }
      setMessage('Note deleted.')
    } catch (error: any) {
      setMessage(error?.message || 'Failed to delete note.')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#09090b] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10">Loading notes...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(20,184,166,0.16),transparent_24%),radial-gradient(circle_at_88%_12%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#0a0a0b_0%,#09090b_35%,#050505_100%)] text-white">
      <div className="mx-auto grid max-w-[1780px] gap-6 px-4 py-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-lg">
                <span>Notes</span>
                <Button type="button" size="sm" onClick={createNewNote} className="bg-white text-black hover:bg-amber-50">
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notes.length ? (
                notes.map((note) => (
                  <button
                     key={note.slug}
                     type="button"
                     onClick={() => setSelectedSlug(note.slug)}
                     className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedSlug === note.slug ? 'border-amber-300/40 bg-amber-400/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{note.shortTitle || note.title}</p>
                        <p className="mt-2 line-clamp-2 text-xs leading-6 text-gray-400">{note.tagline || note.summary || 'No excerpt yet.'}</p>
                      </div>
                      <Badge variant={note.published ? 'default' : 'outline'} className={note.published ? 'bg-emerald-500/20 text-emerald-100' : 'border-white/10 text-white/70'}>
                        {note.published ? 'Live' : 'Draft'}
                      </Badge>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-400">No notes yet.</p>
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="flex flex-col gap-6">
          <Card className="order-2 border-white/10 bg-white/5 text-white">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Longform Note Editor</p>
                <CardTitle className="mt-3 text-3xl">{form.title || 'Untitled note'}</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.slug ? (
                  <Link href={`/notes/${form.slug}`} target="_blank" className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10">
                    Preview
                  </Link>
                ) : null}
                <Button type="button" variant="outline" onClick={deleteCurrentNote} className="border-white/10 bg-transparent text-white hover:bg-white/10">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <Button type="button" onClick={saveNote} disabled={saving} className="bg-white text-black hover:bg-amber-50">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : form.published ? 'Save & Update' : 'Save Draft'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="Cameron Highlands travel guide" />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(event) => updateForm({ slug: slugify(event.target.value) })} placeholder="cameron-highlands-trip" />
              </div>
              <div className="space-y-2">
                <Label>Short Title</Label>
                <Input value={form.shortTitle} onChange={(event) => updateForm({ shortTitle: event.target.value })} placeholder="Cameron Highlands" />
              </div>
              <div className="space-y-2">
                <Label>Kicker</Label>
                <Input value={form.kicker} onChange={(event) => updateForm({ kicker: event.target.value })} placeholder="Longform Note" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tagline</Label>
                <Textarea value={form.tagline} onChange={(event) => updateForm({ tagline: event.target.value })} rows={2} placeholder="A concise subtitle for the note." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Card Summary / 首页短摘要</Label>
                <Textarea value={form.summary} onChange={(event) => updateForm({ summary: event.target.value })} rows={2} placeholder="Keep this short. Full article content is edited in the writing canvas above." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Cover Image URL</Label>
                <Input value={form.coverImage || ''} onChange={(event) => updateForm({ coverImage: event.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Cover Video URL</Label>
                <Input value={form.coverVideoUrl || ''} onChange={(event) => updateForm({ coverVideoUrl: event.target.value })} placeholder="Facebook or YouTube video link" />
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <Input value={stringifyCommaSeparated(form.tags)} onChange={(event) => updateForm({ tags: parseCommaSeparated(event.target.value) })} placeholder="cameron highlands, tea plantation" />
              </div>
              <div className="flex items-center gap-3 pt-8">
                <input id="published" type="checkbox" checked={form.published} onChange={(event) => updateForm({ published: event.target.checked })} />
                <Label htmlFor="published" className="cursor-pointer">Published</Label>
              </div>
              {message ? (
                <div className={`md:col-span-2 rounded-2xl border px-4 py-3 text-sm ${message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>
                  {message}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* WORKSPACE VIEW CONTROLLER Segmented Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-white/10 bg-black/45 p-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2 pl-3">
              <span className="text-xs uppercase tracking-[0.24em] text-white/40 font-bold">Workspace View / 编辑画布视图</span>
            </div>
            <div className="flex items-center bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-inner">
              <button
                type="button"
                onClick={() => setWorkspaceMode('split')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 ${workspaceMode === 'split' ? 'bg-amber-400 text-black shadow-[0_4px_12px_rgba(245,158,11,0.3)] scale-[1.03]' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                编辑画布 (Editor)
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('split')}
                className="hidden"
                aria-hidden="true"
              >
                📝 仅编辑 (Edit Only)
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('preview')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 ${workspaceMode === 'preview' ? 'bg-amber-400 text-black shadow-[0_4px_12px_rgba(245,158,11,0.3)] scale-[1.03]' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                ✨ 实境预览 (True Preview)
              </button>
            </div>
          </div>

          {workspaceMode === 'preview' ? (
            /* TRUE PREVIEW MODE: Highly Realistic 100% Simulation of Frontend Page Layout */
            <div className="order-1 flex flex-col gap-6">
              {/* Simulated Glowing Progress Bar */}
              <div className="w-full h-[4px] bg-gradient-to-r from-amber-400 via-emerald-400 to-amber-500 rounded-full opacity-90 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse" />

              {/* Cover Header */}
              <section className={`overflow-hidden rounded-[42px] border border-white/10 p-7 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm md:p-10 ${form.coverAccent || DEFAULT_NOTE_COVER_ACCENT}`}>
                <div className={`grid gap-8 ${form.coverImage || form.coverVideoUrl ? 'lg:grid-cols-[minmax(0,1.05fr)_520px] lg:items-center' : ''}`}>
                  <div className="space-y-5 text-left">
                    {getDisplayKicker(form.kicker) ? <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">{getDisplayKicker(form.kicker)}</p> : null}
                    <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl tracking-tight">{form.title || 'Your note title'}</h1>
                    {form.tagline ? <p className="max-w-3xl text-lg leading-8 text-white/80">{form.tagline}</p> : null}
                  </div>
                  {form.coverVideoUrl ? (
                    <div className="relative aspect-video overflow-hidden rounded-[34px] border border-white/10 bg-black/30 shadow-2xl">
                      <CoverVideoPreview url={form.coverVideoUrl} title={`${form.title || 'Note'} cover video`} />
                    </div>
                  ) : form.coverImage ? (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[34px] border border-white/10 bg-black/20 shadow-2xl">
                      <FallbackImage src={form.coverImage} alt={`${form.title || 'Note'} cover`} fill sizes="(max-width: 1024px) 100vw, 520px" className="object-cover" priority />
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Grid content matching public detail page */}
              <div className="grid gap-10 lg:grid-cols-[minmax(0,980px)_360px] lg:items-start lg:justify-center">
                {/* Main Article column */}
                <article className="space-y-2 rounded-[38px] border border-white/10 bg-white/[0.035] px-5 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur-md md:px-10 md:py-12 w-full text-left">
                  {form.summary ? (
                    <div className="max-w-2xl mx-auto rounded-[28px] border border-emerald-300/15 bg-emerald-400/10 px-6 py-5 text-base leading-8 text-emerald-50/85 mb-8">
                      <p className="text-xs text-emerald-300 font-bold uppercase tracking-widest mb-1">Card Summary</p>
                      {form.summary}
                    </div>
                  ) : null}

                  {previewBlocks.length ? (
                    previewBlocks.map((block) => (
                      <BlockPreview key={block.id} block={block} locationsById={locationsById} isFullPreview={true} />
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic text-center py-10">在写作画布中输入 Markdown 格式故事，这里将渲染出 100% 真实的排版。</p>
                  )}
                </article>

                {/* Sidebar Column */}
                <aside className="space-y-4 lg:sticky lg:top-6 w-full text-left">
                  {/* Simulated TOC */}
                  <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80 mb-4 font-bold">Table of Contents / 目录</p>
                    <div className="space-y-3 border-l border-white/10 pl-4 py-1">
                      {previewBlocks.filter(b => b.type === 'heading' && b.content).length ? (
                        previewBlocks.filter(b => b.type === 'heading' && b.content).map((b, i) => (
                          <p key={b.id} className={`text-sm leading-6 transition ${i === 0 ? 'text-amber-300 font-medium' : 'text-white/60'}`}>
                            {b.content}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs text-white/40 italic">暂无目录标题 (添加 H2 标题自动生成)</p>
                      )}
                    </div>
                  </div>

                  {/* Related Spots */}
                  <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80 font-bold">Related Spots / 相关景点</p>
                    <div className="mt-4 space-y-3">
                      {Array.from(new Set(previewBlocks.map(b => b.spotId).filter((id): id is number => Number.isFinite(id)))).length ? (
                        Array.from(new Set(previewBlocks.map(b => b.spotId).filter((id): id is number => Number.isFinite(id)))).map(spotId => {
                          const spot = locationsById.get(spotId)
                          if (!spot) return null
                          return (
                            <div
                              key={spot.id}
                              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 hover:bg-white/5 transition duration-200"
                            >
                              <div className="relative h-14 w-14 overflow-hidden rounded-xl shrink-0">
                                <FallbackImage
                                  src={spot.image_url || spot.images?.[0] || '/placeholder-image.jpg'}
                                  alt={spot.name_cn || spot.name}
                                  fill
                                  sizes="56px"
                                  className="object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-white text-sm">{spot.name_cn || spot.name}</p>
                                <p className="truncate text-[10px] text-white/45">{spot.regions?.country} · {spot.regions?.name_cn || spot.regions?.name}</p>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-xs text-white/40 italic">未关联任何景点 (正文插入景点图片自动链接)</p>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          ) : (
            /* EDIT AND SPLIT MODES */
            <div className="order-1 grid grid-cols-1 gap-6">
              {/* LEFT PANEL: Markdown Writing Canvas */}
              <Card className="border-white/10 bg-[rgba(8,8,10,0.85)] text-white shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-md">
                <CardHeader className="border-b border-white/5 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="text-left">
                      <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Writing Canvas</p>
                      <span className="mt-1 block text-2xl font-bold">博客写作画布</span>
                      <p className="mt-1 text-sm font-normal text-white/50">
                        支持标准 Markdown。您可在任何段落后点击 **“关联景点图片”** 直接在光标处插入景点画廊。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={imageInsertSize}
                        onChange={(event) => setImageInsertSize(event.target.value as NoteImageSize)}
                        className="h-9 rounded-md border border-white/10 bg-[#121214] px-3 text-sm text-white outline-none focus:border-amber-300/60"
                        aria-label="Image size"
                      >
                        {IMAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            图片尺寸: {option.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-[#121214] text-white hover:bg-white/10"
                        onClick={() => insertTextAtCursor('## ')}
                      >
                        标题 (H2)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-[#121214] text-white hover:bg-white/10"
                        onClick={() => insertTextAtCursor('> ')}
                      >
                        引用段
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-[#121214] text-white hover:bg-white/10"
                        onClick={() => insertTextAtCursor(imageMarkdown(imageInsertSize))}
                      >
                        独立图片
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="border-emerald-400/20 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                        onClick={openMarkdownSpotPicker}
                      >
                        <ImageIcon className="mr-2 h-4 w-4" />
                        关联已有景点图片
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-[#121214] text-white hover:bg-white/10"
                        onClick={openAffiliatePicker}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Affiliate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-[#121214] text-white hover:bg-white/10"
                        onClick={openKlookPicker}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Klook Widget
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <Textarea
                    id="markdown-editor"
                    value={markdownText}
                    onChange={(event) => setMarkdownText(event.target.value)}
                    onSelect={rememberMarkdownSelection}
                    onKeyUp={rememberMarkdownSelection}
                    onClick={rememberMarkdownSelection}
                    onFocus={rememberMarkdownSelection}
                    rows={36}
                    className="font-mono text-[14px] leading-7 bg-black/40 border-white/5 text-gray-100 placeholder:text-white/20 focus-visible:ring-amber-300/50 resize-y"
                    placeholder={`在此输入您的旅行故事...\n\n支持 Markdown 格式：\n## 这是一个二级标题\n这里是正文段落，可以直接写一大堆文字。\n\n> 这是一个好看的引用块\n\n点击上方的“关联已有景点图片”可以将您已收藏景点的照片瞬间插入！`}
                  />
                </CardContent>
              </Card>

              {/* BOTTOM PANEL: Live Premium Preview */}
              {false && workspaceMode === 'split' && (
                <Card className="border-white/10 bg-[rgba(5,5,7,0.9)] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
                  <CardHeader className="border-b border-white/5 pb-4">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>实时博客效果预览 (Live Preview)</span>
                      <span className="text-xs text-amber-300/80 font-normal">WYSIWYG</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-8">
                    {/* Simulated Glowing Progress Bar */}
                    <div className="w-full h-[3px] bg-gradient-to-r from-amber-400 via-emerald-400 to-amber-500 rounded-full opacity-80" />

                    {/* Cover Header */}
                    <section className={`overflow-hidden rounded-[30px] border border-white/10 p-6 relative text-left ${form.coverAccent || DEFAULT_NOTE_COVER_ACCENT}`}>
                      <p className="text-xs uppercase tracking-[0.24em] text-amber-200/80">{form.kicker || 'Longform Note'}</p>
                      <h2 className="mt-4 text-3xl font-semibold leading-tight text-white">{form.title || 'Your note title'}</h2>
                      {form.tagline ? <p className="mt-3 text-sm leading-7 text-white/80">{form.tagline}</p> : null}
                    </section>

                    {form.summary ? (
                      <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-sm leading-7 text-white/70 text-left">
                        <p className="text-xs text-amber-300/80 uppercase tracking-widest mb-1">Card Summary</p>
                        {form.summary}
                      </div>
                    ) : null}

                    {/* Article Body Renderer */}
                    <div className="space-y-6 max-w-xl mx-auto text-left">
                      {previewBlocks.length ? (
                        previewBlocks.map((block) => (
                          <BlockPreview key={block.id} block={block} locationsById={locationsById} />
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 italic text-center py-10">在左侧编辑区域输入文字后，这里将实时渲染出高档的杂志排版效果。</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[94vh] max-w-[92vw] overflow-y-auto border-white/10 bg-[#0b0b0d] text-white xl:max-w-7xl">
          <DialogHeader>
            <DialogTitle>关联景点已有相册图片</DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>搜索已有景点</Label>
                <Input value={spotQuery} onChange={(event) => setSpotQuery(event.target.value)} placeholder="BOH Tea Centre, Green View Garden…" />
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
                {filteredSpots.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => {
                      setSelectedSpotId(spot.id)
                      setSelectedSpotImageUrls(getLocationImages(spot))
                    }}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${selectedSpotId === spot.id ? 'border-amber-300/40 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  >
                    <p className="font-medium text-white">{getLocationLabel(spot)}</p>
                    <p className="mt-1 text-xs text-white/55">{spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name || 'No region'}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="font-medium text-white">{selectedSpot ? getLocationLabel(selectedSpot) : '请先在左侧选择景点'}</p>
                <p className="mt-1 text-sm text-white/55">
                  {selectedSpot ? '从该景点的现有相册中，勾选一张或多张图片插入到您的文章光标处。' : '此选择器会复用该景点已保存的相册及封面图。'}
                </p>
              </div>

              {selectedSpot && selectedSpotImages.length ? (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <Button type="button" size="sm" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setSelectedSpotImageUrls(selectedSpotImages)}>
                    Select all
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setSelectedSpotImageUrls([])}>
                    Clear
                  </Button>
                  <span className="text-xs text-white/45">{selectedSpotImageUrls.length} / {selectedSpotImages.length} selected</span>
                </div>
              ) : null}

              {selectedSpot ? (
                selectedSpotImages.length ? (
                  <div className="grid max-h-[68vh] gap-6 overflow-y-auto pr-1 xl:grid-cols-2">
                    {selectedSpotImages.map((src) => {
                      const checked = selectedSpotImageUrls.includes(src)
                      return (
                        <button
                          key={src}
                          type="button"
                          onClick={() =>
                            setSelectedSpotImageUrls((current) =>
                              current.includes(src) ? current.filter((item) => item !== src) : [...current, src]
                            )
                          }
                          className={`overflow-hidden rounded-[24px] border text-left transition ${checked ? 'border-amber-300/60 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                        >
                          <div className="relative aspect-[16/10] min-h-[260px] overflow-hidden md:min-h-[340px]">
                            <FallbackImage src={src} alt={getLocationLabel(selectedSpot)} fill sizes="(max-width: 1280px) 100vw, 620px" className="object-cover" />
                            {checked ? (
                              <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-black shadow-lg">
                                ✓
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <span className="truncate text-sm text-white/80">{checked ? 'Selected' : 'Click to select'}</span>
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${checked ? 'border-amber-300 bg-amber-200 text-black' : 'border-white/20 text-white/55'}`}>
                              {checked ? '✓' : ''}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-sm text-white/55">
                    该景点目前没有关联任何图片。
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-sm text-white/55">
                  请先在左侧输入搜索并选择景点，再从其关联的画廊中挑选照片。
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setPickerOpen(false)}>
              取消
            </Button>
            <Button type="button" className="bg-white text-black hover:bg-amber-50" onClick={applySpotImagesToMarkdown} disabled={!selectedSpotId || !selectedSpotImageUrls.length}>
              插入所选景点图片
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={affiliatePickerOpen} onOpenChange={setAffiliatePickerOpen}>
        <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-white/10 bg-[#0b0b0d] text-white">
          <DialogHeader>
            <DialogTitle>Select affiliate links</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={affiliateQuery} onChange={(event) => setAffiliateQuery(event.target.value)} placeholder="Search Agoda, Klook, hotel, tickets..." />
            <div className="grid max-h-[56vh] gap-3 overflow-y-auto md:grid-cols-2">
              {filteredAffiliateLinks.map((link) => {
                const checked = selectedAffiliateIds.includes(link.id)
                const label = link.title || `${link.provider || 'Affiliate'} ${link.link_type || ''}`.trim()
                const target = link.locations?.name_cn || link.locations?.name || link.regions?.name_cn || link.regions?.name || 'Site-wide'
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => setSelectedAffiliateIds((current) => checked ? current.filter((id) => id !== link.id) : [...current, link.id])}
                    className={`rounded-2xl border p-4 text-left transition ${checked ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  >
                    <p className="font-semibold text-white">{label}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-white/45">{link.provider} / {link.link_type}</p>
                    <p className="mt-2 text-sm text-white/60">{target}</p>
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setAffiliatePickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-white text-black hover:bg-amber-50" onClick={applyAffiliateLinksToMarkdown} disabled={!selectedAffiliateIds.length}>
              Insert affiliate block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={klookPickerOpen} onOpenChange={setKlookPickerOpen}>
        <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-white/10 bg-[#0b0b0d] text-white">
          <DialogHeader>
            <DialogTitle>Select Klook widgets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={klookQuery} onChange={(event) => setKlookQuery(event.target.value)} placeholder="Search Klook widget..." />
            <div className="grid max-h-[56vh] gap-3 overflow-y-auto md:grid-cols-2">
              {filteredKlookWidgets.map((widget) => {
                const checked = selectedKlookWidgetIds.includes(widget.id)
                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => setSelectedKlookWidgetIds((current) => checked ? current.filter((id) => id !== widget.id) : [...current, widget.id])}
                    className={`rounded-2xl border p-4 text-left transition ${checked ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  >
                    <p className="font-semibold text-white">{widget.title}</p>
                    {widget.description ? <p className="mt-2 text-sm leading-6 text-white/60">{widget.description}</p> : null}
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setKlookPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-white text-black hover:bg-amber-50" onClick={applyKlookWidgetsToMarkdown} disabled={!selectedKlookWidgetIds.length}>
              Insert Klook widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
