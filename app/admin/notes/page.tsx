'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ExternalLink, Eye, Image as ImageIcon, MapPin, Plus, Save, Search, Trash2, X, Command } from 'lucide-react'

import type { LongformNote, NoteBlock, NoteBlockType } from '@/lib/notes'
import { EMPTY_NOTE, DEFAULT_NOTE_COVER_ACCENT, parseSummary } from '@/lib/notes'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import FallbackImage from '@/components/FallbackImage'
import SupportSidebarCard from '@/components/SupportSidebarCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

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
  description?: string | null
  provider: string
  link_type: string
  url: string
  location_id?: number | null
  region_id?: number | null
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

function createEmptyBlock(type: NoteBlockType): NoteBlock {
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    content: type === 'heading' ? '新小节标题' : '',
    affiliateIds: type === 'affiliate' ? [] : undefined,
  }
}

function moveItem<T>(items: T[], index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function getLocationCover(location?: LocationOption | null) {
  return location?.image_url || location?.images?.[0] || '/placeholder-image.jpg'
}

function getLocationLabel(location?: LocationOption | null) {
  if (!location) return ''
  return location.name_cn || location.name
}

const BLOCK_LABELS: Record<NoteBlockType, string> = {
  paragraph: 'Paragraph / 段落',
  heading: 'Heading / 标题',
  quote: 'Quote / 引言',
  image: 'Image / 图片',
  spot: 'Spot Card / 景点卡片',
  affiliate: 'Affiliate / 联盟推荐',
}

export default function AdminNotesPage() {
  const [notes, setNotes] = useState<LongformNote[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [form, setForm] = useState<LongformNote>(EMPTY_NOTE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [regions, setRegions] = useState<RegionOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateOption[]>([])
  const [spotSearch, setSpotSearch] = useState('')
  const [affiliateSearch, setAffiliateSearch] = useState('')
  const blocksSectionRef = useRef<HTMLDivElement | null>(null)
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [activeBlockId, setActiveBlockId] = useState('')
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Interactive Summary Insertion States
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)
  const [isSpotDialogOpen, setIsSpotDialogOpen] = useState(false)
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState('')
  const [summaryInsertPos, setSummaryInsertPos] = useState<{ start: number, end: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      try {
        const [notesResponse, regionsResponse, locationsResponse, affiliateResponse] = await Promise.all([
          adminFetch('/api/admin/notes', { cache: 'no-store' }),
          supabase.from('regions').select('id,name,name_cn,country').order('name', { ascending: true }),
          supabase
            .from('locations')
            .select('id,name,name_cn,image_url,images,category,regions:region_id(id,name,name_cn,country)')
            .order('id', { ascending: false }),
          supabase
            .from('affiliate_links')
            .select('id,title,description,provider,link_type,url,location_id,region_id')
            .eq('is_active', true)
            .order('id', { ascending: false }),
        ])

        const notesResult = notesResponse.ok ? await notesResponse.json() : { notes: [] }
        if (cancelled) return

        setNotes(Array.isArray(notesResult?.notes) ? notesResult.notes : [])
        setRegions(regionsResponse.data || [])
        setLocations((locationsResponse.data || []).map((item: any) => ({
          ...item,
          regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
        })))
        setAffiliateLinks((affiliateResponse.data || []) as AffiliateOption[])
      } catch {
        if (!cancelled) setNotes([])
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
    if (selected) {
      setForm(selected)
      setMessage('')
      setActiveBlockId(selected.blocks[0]?.id || '')
    }
  }, [notes, selectedSlug])

  const selectedRelatedSpots = useMemo(
    () => locations.filter((location) => form.relatedSpotIds.includes(location.id)),
    [form.relatedSpotIds, locations]
  )

  const selectedRegions = useMemo(
    () => regions.filter((region) => form.relatedRegionIds.includes(region.id)),
    [form.relatedRegionIds, regions]
  )

  const filteredSpots = useMemo(() => {
    const keyword = spotSearch.trim().toLowerCase()
    const pool = locations.filter((location) => !form.relatedSpotIds.includes(location.id))
    if (!keyword) return pool.slice(0, 24)
    return pool
      .filter((location) => {
        const haystack = `${location.name} ${location.name_cn || ''} ${location.regions?.name || ''} ${location.regions?.name_cn || ''}`.toLowerCase()
        return haystack.includes(keyword)
      })
      .slice(0, 24)
  }, [form.relatedSpotIds, locations, spotSearch])

  const filteredAffiliateLinks = useMemo(() => {
    const keyword = affiliateSearch.trim().toLowerCase()
    const selectedSet = new Set(form.blocks.flatMap((block) => block.affiliateIds || []))
    if (!keyword) return affiliateLinks.filter((item) => !selectedSet.has(item.id)).slice(0, 30)
    return affiliateLinks
      .filter((item) => {
        if (selectedSet.has(item.id)) return false
        const haystack = `${item.title || ''} ${item.description || ''} ${item.provider} ${item.link_type}`.toLowerCase()
        return haystack.includes(keyword)
      })
      .slice(0, 30)
  }, [affiliateLinks, affiliateSearch, form.blocks])

  const contentBlocks = useMemo(
    () => form.blocks.filter((block) => block.type !== 'affiliate'),
    [form.blocks]
  )

  const sidebarAffiliateBlocks = useMemo(
    () => form.blocks.filter((block) => block.type === 'affiliate' && Boolean(block.affiliateIds?.length)),
    [form.blocks]
  )

  const affiliateSelectionCount = useMemo(
    () => new Set(form.blocks.flatMap((block) => block.affiliateIds || [])).size,
    [form.blocks]
  )

  const summaryParts = useMemo(() => parseSummary(form.summary), [form.summary])

  const draftCharacterCount = useMemo(() => {
    const text = [
      form.title,
      form.tagline,
      form.summary,
      ...form.blocks.map((block) => [block.title, block.content, block.caption].filter(Boolean).join(' ')),
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, '')
    return text.length
  }, [form])

  function registerBlockRef(blockId: string, element: HTMLDivElement | null) {
    if (!element) {
      delete blockRefs.current[blockId]
      return
    }
    blockRefs.current[blockId] = element
  }

  function focusBlockEditor(blockId: string) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        blocksSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        const container = blockRefs.current[blockId]
        if (!container) return
        container.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const focusable = container.querySelector('input, textarea, button')
        if (focusable instanceof HTMLElement) {
          focusable.focus()
        }
      })
    })
  }

  function createNewNote() {
    const next: LongformNote = {
      ...EMPTY_NOTE,
      slug: '',
      title: '',
      shortTitle: '',
      coverAccent: DEFAULT_NOTE_COVER_ACCENT,
      blocks: [createEmptyBlock('paragraph')],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setSelectedSlug('')
    setForm(next)
    setMessage('')
    setActiveBlockId(next.blocks[0]?.id || '')
    focusBlockEditor(next.blocks[0]?.id || '')
  }

  function updateForm(patch: Partial<LongformNote>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function updateBlock(index: number, patch: Partial<NoteBlock>) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...patch } : block
      ),
    }))
  }

  function addBlock(type: NoteBlockType, afterBlockId?: string) {
    const nextBlock = createEmptyBlock(type)
    setForm((current) => {
      if (afterBlockId) {
        const index = current.blocks.findIndex(b => b.id === afterBlockId)
        if (index !== -1) {
          const nextBlocks = [...current.blocks]
          nextBlocks.splice(index + 1, 0, nextBlock)
          return { ...current, blocks: nextBlocks }
        }
      }
      return { ...current, blocks: [...current.blocks, nextBlock] }
    })
    setActiveBlockId(nextBlock.id)
    setMessage(type === 'image' ? '已新增图片模块，直接贴上图片链接即可开始排版。' : `已新增 ${BLOCK_LABELS[type]} 模块。`)
    focusBlockEditor(nextBlock.id)
  }

  function removeBlock(index: number) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index),
    }))
  }

  function moveBlock(index: number, direction: 'up' | 'down') {
    const movingBlock = form.blocks[index]
    setForm((current) => ({ ...current, blocks: moveItem(current.blocks, index, direction) }))
    if (movingBlock?.id) {
      setActiveBlockId(movingBlock.id)
      focusBlockEditor(movingBlock.id)
    }
  }

  function toggleRelatedSpot(spotId: number) {
    setForm((current) => {
      const exists = current.relatedSpotIds.includes(spotId)
      return {
        ...current,
        relatedSpotIds: exists ? current.relatedSpotIds.filter((id) => id !== spotId) : [...current.relatedSpotIds, spotId],
      }
    })
  }

  function toggleRegion(regionId: number) {
    setForm((current) => {
      const exists = current.relatedRegionIds.includes(regionId)
      return {
        ...current,
        relatedRegionIds: exists ? current.relatedRegionIds.filter((id) => id !== regionId) : [...current.relatedRegionIds, regionId],
      }
    })
  }

  function toggleAffiliateForBlock(index: number, affiliateId: number) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) => {
        if (blockIndex !== index) return block
        const currentIds = block.affiliateIds || []
        const exists = currentIds.includes(affiliateId)
        return {
          ...block,
          affiliateIds: exists ? currentIds.filter((id) => id !== affiliateId) : [...currentIds, affiliateId],
        }
      }),
    }))
  }

  function insertIntoSummary(text: string, overridePos?: { start: number, end: number }) {
    const textarea = summaryTextareaRef.current
    if (!textarea) return

    const start = overridePos ? overridePos.start : textarea.selectionStart
    const end = overridePos ? overridePos.end : textarea.selectionEnd
    const current = form.summary || ''
    const next = current.substring(0, start) + text + current.substring(end)
    
    updateForm({ summary: next })
    
    // Restore focus and selection
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

  function handleSummaryKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === '/') {
      const textarea = summaryTextareaRef.current
      if (!textarea) return
      setSummaryInsertPos({ start: textarea.selectionStart, end: textarea.selectionEnd })
      setIsCommandMenuOpen(true)
      // We don't preventDefault yet, let them type / then we replace it or they pick
    }
  }

  function confirmImageInsert() {
    if (tempImageUrl) {
      insertIntoSummary(`[img:${tempImageUrl}]`, summaryInsertPos || undefined)
      setTempImageUrl('')
      setIsImageDialogOpen(false)
      setSummaryInsertPos(null)
    }
  }

  function confirmSpotInsert(spotId: number) {
    insertIntoSummary(`[spot:${spotId}]`, summaryInsertPos || undefined)
    setIsSpotDialogOpen(false)
    setSummaryInsertPos(null)
  }

  async function saveNote() {
    setSaving(true)
    setMessage('')

    const payload: LongformNote & { previousSlug?: string } = {
      ...form,
      slug: form.slug || slugify(form.title),
      shortTitle: form.shortTitle || form.title,
      tags: parseCommaSeparated(stringifyCommaSeparated(form.tags)),
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
      if (!response.ok) throw new Error(result?.error || '保存失败')

      const nextNote = result.note as LongformNote
      setNotes((current) => {
        const existing = current.findIndex((item) => item.slug === selectedSlug || item.slug === nextNote.slug)
        if (existing >= 0) {
          const next = [...current]
          next[existing] = nextNote
          return next
        }
        return [nextNote, ...current]
      })
      setSelectedSlug(nextNote.slug)
      setForm(nextNote)
      setMessage(nextNote.published ? 'Published note saved successfully.' : 'Draft saved successfully.')
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
      if (!response.ok) throw new Error('删除失败')
      setNotes((current) => current.filter((item) => item.slug !== form.slug))
      createNewNote()
      setMessage('Note deleted.')
    } catch (error: any) {
      setMessage(error?.message || 'Failed to delete note.')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#09090b] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10">正在加载长文笔记后台...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0a0a0b_0%,#09090b_35%,#050505_100%)] text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span>长文笔记</span>
                <Button type="button" size="sm" onClick={createNewNote} className="bg-white text-black hover:bg-amber-50">
                  <Plus className="mr-2 h-4 w-4" />新建
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notes.length ? notes.map((note) => (
                <button
                  key={note.slug}
                  type="button"
                  onClick={() => setSelectedSlug(note.slug)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedSlug === note.slug ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{note.shortTitle || note.title}</p>
                    {note.published ? <Badge className="bg-emerald-500/20 text-emerald-200">已发布</Badge> : <Badge variant="outline">草稿</Badge>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-6 text-gray-400">{note.summary || '还没有摘要。'}</p>
                </button>
              )) : <p className="text-sm text-gray-400">还没有笔记，先新建一篇。</p>}
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-6">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Longform Note Studio</p>
                <CardTitle className="mt-3 text-3xl">{form.title || '未命名长文笔记'}</CardTitle>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {form.slug ? <Link href={`/notes/${form.slug}`} target="_blank" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/10"><ExternalLink className="h-4 w-4" />打开前台</Link> : null}
                <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={deleteCurrentNote} disabled={!form.slug}><Trash2 className="mr-2 h-4 w-4" />删除</Button>
                <Button type="button" className="bg-white text-black hover:bg-amber-50" onClick={saveNote} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : form.published ? 'Save & Update' : 'Save Draft'}</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label>标题</Label><Input value={form.title} onChange={(event) => updateForm({ title: event.target.value, slug: form.slug || slugify(event.target.value) })} /></div>
              <div className="space-y-2"><Label>短标题</Label><Input value={form.shortTitle} onChange={(event) => updateForm({ shortTitle: event.target.value })} /></div>
              <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={(event) => updateForm({ slug: slugify(event.target.value) })} /></div>
              <div className="space-y-2"><Label>Kicker</Label><Input value={form.kicker} onChange={(event) => updateForm({ kicker: event.target.value })} /></div>
              <div className="space-y-2 md:col-span-2"><Label>Tagline</Label><Input value={form.tagline} onChange={(event) => updateForm({ tagline: event.target.value })} /></div>
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>摘要 (Summary)</Label>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="outline" 
                      className="h-7 border-white/10 bg-transparent px-2 text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        const textarea = summaryTextareaRef.current
                        if (textarea) setSummaryInsertPos({ start: textarea.selectionStart, end: textarea.selectionEnd })
                        setIsImageDialogOpen(true)
                      }}
                    >
                      <ImageIcon className="mr-1 h-3 w-3" />插入图片
                    </Button>
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="outline" 
                      className="h-7 border-white/10 bg-transparent px-2 text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        const textarea = summaryTextareaRef.current
                        if (textarea) setSummaryInsertPos({ start: textarea.selectionStart, end: textarea.selectionEnd })
                        setIsSpotDialogOpen(true)
                      }}
                    >
                      <MapPin className="mr-1 h-3 w-3" />插入景点
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Textarea 
                    ref={summaryTextareaRef}
                    value={form.summary} 
                    onChange={(event) => updateForm({ summary: event.target.value })} 
                    onKeyDown={handleSummaryKeyDown}
                    rows={8} 
                    className="font-mono text-sm leading-relaxed"
                    placeholder="输入文字... 输入 '/' 触发快捷指令。支持插入图片或景点卡片。"
                  />
                  {isCommandMenuOpen && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#09090b] p-1 shadow-2xl">
                      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-gray-500">插入内容</div>
                      <button 
                        onClick={() => { setIsCommandMenuOpen(false); setIsImageDialogOpen(true); }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/10"
                      >
                        <ImageIcon className="h-4 w-4 text-amber-300" /> 图片 (Image)
                      </button>
                      <button 
                        onClick={() => { setIsCommandMenuOpen(false); setIsSpotDialogOpen(true); }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/10"
                      >
                        <MapPin className="h-4 w-4 text-emerald-300" /> 景点 (Spot Card)
                      </button>
                      <div className="h-px bg-white/5 my-1" />
                      <button 
                        onClick={() => setIsCommandMenuOpen(false)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-white/10"
                      >
                        取消 (Esc)
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2"><Label>封面图 URL</Label><Input value={form.coverImage || ''} onChange={(event) => updateForm({ coverImage: event.target.value })} /></div>
              <div className="space-y-2"><Label>标签</Label><Input value={stringifyCommaSeparated(form.tags)} onChange={(event) => updateForm({ tags: parseCommaSeparated(event.target.value) })} placeholder="例如：曼谷, 咖啡馆, 长文攻略" /></div>
              <label className="inline-flex items-center gap-3 text-sm text-white/80"><input type="checkbox" checked={form.published} onChange={(event) => updateForm({ published: event.target.checked })} />发布这篇笔记</label>
              {message ? <p className={`md:col-span-2 rounded-2xl border px-4 py-3 text-sm ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('error') ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>{message}</p> : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">正文模块</p>
              <p className="mt-3 text-3xl font-semibold text-white">{form.blocks.length}</p>
              <p className="mt-2 text-sm text-white/55">段落、图片、景点卡与联盟区块</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">关联景点</p>
              <p className="mt-3 text-3xl font-semibold text-white">{selectedRelatedSpots.length}</p>
              <p className="mt-2 text-sm text-white/55">会在正文下方形成延伸阅读入口</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">变现入口</p>
              <p className="mt-3 text-3xl font-semibold text-white">{affiliateSelectionCount}</p>
              <p className="mt-2 text-sm text-white/55">右侧栏集中放联盟推荐与工具入口</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">内容长度</p>
              <p className="mt-3 text-3xl font-semibold text-white">{draftCharacterCount}</p>
              <p className="mt-2 text-sm text-white/55">用于判断这篇长文是否够扎实、够可读</p>
            </div>
          </div>

          <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(255,255,255,0.03))] text-white">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">Quick Insert</CardTitle>
              <p className="text-sm text-white/65">
                现在点击会自动插入到当前激活的模块下方并聚焦。
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {(['paragraph', 'heading', 'quote', 'image', 'spot', 'affiliate'] as NoteBlockType[]).map((type) => (
                <Button
                  type="button"
                  key={`quick-${type}`}
                  variant={type === 'image' ? 'default' : 'outline'}
                  className={
                    type === 'image'
                      ? 'bg-amber-200 text-black hover:bg-amber-100'
                      : 'border-white/10 bg-transparent text-white hover:bg-white/10'
                  }
                  onClick={() => addBlock(type, activeBlockId)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {BLOCK_LABELS[type]}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] text-white">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Live Draft Preview</p>
                <CardTitle className="mt-3 text-3xl">{form.title || 'Draft preview'}</CardTitle>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80">
                <Eye className="h-4 w-4" />
                {form.published ? 'Published layout' : 'Draft layout'}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <section className={`overflow-hidden rounded-[32px] border border-white/10 p-6 md:p-8 ${form.coverAccent || DEFAULT_NOTE_COVER_ACCENT}`}>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:items-end">
                  <div>
                    <p className="section-kicker text-xs text-amber-100/80">{form.kicker || 'Longform Note'}</p>
                    <h2 className="font-display mt-5 text-4xl leading-none text-white md:text-6xl">{form.title || 'Your longform title'}</h2>
                    {form.tagline ? <p className="mt-5 max-w-3xl text-sm leading-8 text-white/80 md:text-base">{form.tagline}</p> : null}
                  </div>
                  {form.coverImage ? (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
                      <FallbackImage src={form.coverImage} alt={form.title || 'Note cover'} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-[28px] border border-dashed border-white/15 bg-black/20 text-sm text-white/45">
                      Cover image preview
                    </div>
                  )}
                </div>
              </section>

              <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-5">
                  {summaryParts.length ? (
                    <div className="max-w-4xl space-y-5 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 shadow-inner">
                      <p className="text-[10px] uppercase tracking-widest text-amber-300/50 mb-2">摘要渲染效果</p>
                      {summaryParts.map((part, index) => {
                        if (part.type === 'text') {
                          return <p key={index} className="text-base leading-8 text-gray-100 whitespace-pre-wrap">{part.content}</p>
                        }
                        if (part.type === 'image' && part.imageUrl) {
                          return (
                            <div key={index} className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                              <FallbackImage src={part.imageUrl} alt="Summary image" fill className="object-cover" />
                            </div>
                          )
                        }
                        if (part.type === 'spot' && part.spotId) {
                          const spot = locations.find(l => l.id === part.spotId)
                          return (
                            <div key={index} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3">
                              <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                                <FallbackImage src={getLocationCover(spot)} alt={getLocationLabel(spot)} fill className="object-cover" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-white">{getLocationLabel(spot) || `Spot #${part.spotId}`}</p>
                                <p className="truncate text-xs text-gray-400">{spot?.regions?.country} / {spot?.regions?.name_cn || spot?.regions?.name}</p>
                              </div>
                            </div>
                          )
                        }
                        return null
                      })}
                    </div>
                  ) : null}
                  {contentBlocks.length ? (
                    contentBlocks.map((block) => {
                      const selectedSpot = locations.find((item) => item.id === block.spotId)

                      if (block.type === 'heading') {
                        return <h3 key={block.id} className="font-display pt-2 text-3xl text-white">{block.content || block.title || 'Section heading'}</h3>
                      }

                      if (block.type === 'quote') {
                        return <blockquote key={block.id} className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 text-lg leading-8 text-white/85">{block.content || 'Quote preview'}</blockquote>
                      }

                      if (block.type === 'image') {
                        return (
                          <figure key={block.id} className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5">
                            <div className="relative aspect-[16/9] overflow-hidden">
                              {block.imageUrl ? (
                                <FallbackImage src={block.imageUrl} alt={block.caption || form.title || 'Preview image'} fill className="object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-sm text-white/45">Image preview</div>
                              )}
                            </div>
                            {block.caption ? <figcaption className="px-5 py-4 text-sm leading-7 text-gray-300">{block.caption}</figcaption> : null}
                          </figure>
                        )
                      }

                      if (block.type === 'spot') {
                        return (
                          <div key={block.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
                            <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                              <div className="relative aspect-[4/3] overflow-hidden md:aspect-auto">
                                <FallbackImage src={getLocationCover(selectedSpot)} alt={getLocationLabel(selectedSpot) || 'Spot preview'} fill className="object-cover" />
                              </div>
                              <div className="p-5">
                                <p className="section-kicker text-xs text-amber-300/80">Linked Spot</p>
                                <h3 className="mt-3 text-2xl font-semibold text-white">{getLocationLabel(selectedSpot) || 'Choose a spot card'}</h3>
                                <p className="mt-3 text-sm leading-7 text-gray-300">
                                  {selectedSpot ? 'This note will link back to your existing spot page.' : 'Pick one related spot and it will appear here as a premium card.'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <p key={block.id} className="max-w-3xl text-base leading-8 text-gray-200">
                          {block.content || 'Paragraph preview'}
                        </p>
                      )
                    })
                  ) : (
                    <div className="rounded-[28px] border border-dashed border-white/15 bg-black/20 p-6 text-sm text-white/50">
                      Add a paragraph block to start building this longform note.
                    </div>
                  )}
                </div>

                {selectedRelatedSpots.length ? (
                  <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                    <p className="section-kicker text-xs text-amber-300/80">Connected Spots</p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">文末延伸景点</h3>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {selectedRelatedSpots.map((spot) => (
                        <div key={spot.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="relative h-16 w-16 overflow-hidden rounded-2xl">
                            <FallbackImage src={getLocationCover(spot)} alt={getLocationLabel(spot)} fill className="object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{getLocationLabel(spot)}</p>
                            <p className="truncate text-xs text-gray-400">{spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <aside className="space-y-4">
                  <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                    <p className="section-kicker text-xs text-amber-300/80">Monetization Rail</p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">右侧侧栏预览</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-300">
                      这里现在专门放联盟营销、住宿预订、工具入口与未来的打赏组件，正文保持更像高级旅游专栏。
                    </p>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                    <p className="section-kicker text-xs text-emerald-300/80">Publishing Signals</p>
                    <div className="mt-4 space-y-3 text-sm text-gray-300">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">状态：{form.published ? '已发布' : '草稿中'}</div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">正文模块：{contentBlocks.length} 个</div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">侧栏联盟区块：{sidebarAffiliateBlocks.length} 个</div>
                    </div>
                  </div>

                  {sidebarAffiliateBlocks.length ? (
                    sidebarAffiliateBlocks.map((block) => {
                      const linkedAffiliates = affiliateLinks.filter((item) => (block.affiliateIds || []).includes(item.id))
                      return (
                        <div key={block.id} className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                          <p className="section-kicker text-xs text-amber-300/80">Affiliate Module</p>
                          <h3 className="mt-3 text-xl font-semibold text-white">{block.title || '旅途工具 / 预订入口'}</h3>
                          {block.content ? <p className="mt-2 text-sm leading-7 text-gray-300">{block.content}</p> : null}
                          <div className="mt-4 flex flex-wrap gap-2">
                            {linkedAffiliates.length ? (
                              linkedAffiliates.map((item) => (
                                <span key={item.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/85">
                                  {item.title || `${item.provider} ${item.link_type}`}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-white/45">这个侧栏模块还没选联盟链接。</span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-[28px] border border-dashed border-white/15 bg-black/20 p-5 text-sm leading-7 text-white/55">
                      还没有侧栏变现模块。你可以新增 `Affiliate / 联盟推荐`，把住宿、门票、保险或交通入口集中放到右边。
                    </div>
                  )}

                  <SupportSidebarCard className="bg-white/5" />
                </aside>
              </div>
            </CardContent>
          </Card>

          <Card ref={blocksSectionRef} className="border-white/10 bg-white/5 text-white">
            <CardHeader><CardTitle>相关景点与地区</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <Label>已关联景点</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedRelatedSpots.length ? selectedRelatedSpots.map((spot) => (
                    <button key={spot.id} type="button" onClick={() => toggleRelatedSpot(spot.id)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/90">
                      {getLocationLabel(spot)}<X className="h-3 w-3" />
                    </button>
                  )) : <p className="text-sm text-gray-400">还没关联景点。</p>}
                </div>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><Input className="pl-10" value={spotSearch} onChange={(event) => setSpotSearch(event.target.value)} placeholder="搜索并 @ 已有景点" /></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredSpots.map((spot) => (
                    <button key={spot.id} type="button" onClick={() => toggleRelatedSpot(spot.id)} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left transition hover:border-amber-300/50 hover:bg-white/5">
                      <div className="relative aspect-[16/9] overflow-hidden">
                        <FallbackImage src={getLocationCover(spot)} alt={getLocationLabel(spot)} fill className="object-cover" />
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-white">{getLocationLabel(spot)}</p>
                        <p className="mt-1 text-xs text-gray-400">{spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>相关地区</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedRegions.length ? selectedRegions.map((region) => (
                    <button key={region.id} type="button" onClick={() => toggleRegion(region.id)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/90">
                      {region.name_cn || region.name}<X className="h-3 w-3" />
                    </button>
                  )) : <p className="text-sm text-gray-400">还没关联地区。</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {regions.filter((region) => !form.relatedRegionIds.includes(region.id)).slice(0, 24).map((region) => (
                    <button key={region.id} type="button" onClick={() => toggleRegion(region.id)} className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/75 hover:bg-white/10">
                      {region.country} / {region.name_cn || region.name}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>正文模块</CardTitle>
                <p className="mt-2 text-sm text-white/55">像搭积木一样排正文。点击模块即可激活，激活后点击上方的 Quick Insert 会在下方插入。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['paragraph', 'heading', 'quote', 'image', 'spot', 'affiliate'] as NoteBlockType[]).map((type) => (
                  <Button type="button" key={type} variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => addBlock(type, activeBlockId)}>
                    <Plus className="mr-2 h-4 w-4" />{BLOCK_LABELS[type]}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {form.blocks.length ? form.blocks.map((block, index) => {
                const selectedSpot = locations.find((item) => item.id === block.spotId)
                const selectedAffiliateIds = new Set(block.affiliateIds || [])
                return (
                  <div
                    key={block.id}
                    ref={(element) => registerBlockRef(block.id, element)}
                    className={`rounded-[28px] border p-4 transition ${activeBlockId === block.id ? 'border-amber-300/50 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.15)]' : 'border-white/10 bg-black/20'}`}
                    onClick={() => setActiveBlockId(block.id)}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-amber-400/10 text-amber-200">{BLOCK_LABELS[block.type]}</Badge>
                        <span className="text-sm text-gray-400">Block {index + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-white/40 hover:bg-white/10 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); addBlock('paragraph', block.id); }}
                          title="在下方插入段落"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => moveBlock(index, 'up')}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => moveBlock(index, 'down')}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => removeBlock(index)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>

                    {(block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') ? (
                      <div className="space-y-3">
                        {block.type !== 'paragraph' ? <div className="space-y-2"><Label>小标题</Label><Input value={block.title || ''} onChange={(event) => updateBlock(index, { title: event.target.value })} /></div> : null}
                        <div className="space-y-2"><Label>内容</Label><Textarea rows={block.type === 'quote' ? 3 : 6} value={block.content || ''} onChange={(event) => updateBlock(index, { content: event.target.value })} /></div>
                      </div>
                    ) : null}

                    {block.type === 'image' ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-dashed border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm leading-7 text-amber-100/90">
                          贴上图片直链后，这一块会立刻在上方预览和前台文章中显示。
                        </div>
                        <div className="space-y-2"><Label>图片 URL</Label><Input value={block.imageUrl || ''} onChange={(event) => updateBlock(index, { imageUrl: event.target.value })} placeholder="https://..." /></div>
                        <div className="space-y-2"><Label>图说</Label><Input value={block.caption || ''} onChange={(event) => updateBlock(index, { caption: event.target.value })} /></div>
                      </div>
                    ) : null}

                    {block.type === 'spot' ? (
                      <div className="space-y-3">
                        {selectedSpot ? (
                          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                            <div className="relative aspect-[16/9] overflow-hidden"><FallbackImage src={getLocationCover(selectedSpot)} alt={getLocationLabel(selectedSpot)} fill className="object-cover" /></div>
                            <div className="flex items-center justify-between p-3">
                              <div>
                                <p className="font-medium text-white">{getLocationLabel(selectedSpot)}</p>
                                <p className="mt-1 text-xs text-gray-400">{selectedSpot.regions?.country} / {selectedSpot.regions?.name_cn || selectedSpot.regions?.name}</p>
                              </div>
                              <Button variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => updateBlock(index, { spotId: undefined })}>清除</Button>
                            </div>
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {selectedRelatedSpots.slice(0, 12).map((spot) => (
                            <button key={spot.id} type="button" onClick={() => updateBlock(index, { spotId: spot.id })} className={`overflow-hidden rounded-2xl border text-left transition ${block.spotId === spot.id ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}>
                              <div className="relative aspect-[16/9] overflow-hidden"><FallbackImage src={getLocationCover(spot)} alt={getLocationLabel(spot)} fill className="object-cover" /></div>
                              <div className="p-3"><p className="font-medium text-white">{getLocationLabel(spot)}</p></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {block.type === 'affiliate' ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {(block.affiliateIds || []).map((id) => {
                            const link = affiliateLinks.find((item) => item.id === id)
                            if (!link) return null
                            return (
                              <button key={id} type="button" onClick={() => toggleAffiliateForBlock(index, id)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/90">
                                {link.title || `${link.provider} ${link.link_type}`}<X className="h-3 w-3" />
                              </button>
                            )
                          })}
                        </div>
                        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><Input className="pl-10" value={affiliateSearch} onChange={(event) => setAffiliateSearch(event.target.value)} placeholder="搜索并嵌入联盟链接" /></div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {filteredAffiliateLinks.map((link) => (
                            <button key={link.id} type="button" onClick={() => toggleAffiliateForBlock(index, link.id)} className={`rounded-2xl border p-4 text-left transition ${selectedAffiliateIds.has(link.id) ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}>
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-white">{link.title || `${link.provider} ${link.link_type}`}</p>
                                <Badge variant="outline">{link.provider}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-400">{link.description || link.url}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              }) : <p className="text-sm text-gray-400">还没有正文模块，先加一个 paragraph 开始写。</p>}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Dialogs for Summary Interactive Insert */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="border-white/10 bg-[#09090b] text-white">
          <DialogHeader><DialogTitle>插入图片</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label>图片 URL</Label>
            <Input 
              autoFocus
              value={tempImageUrl} 
              onChange={(e) => setTempImageUrl(e.target.value)} 
              placeholder="https://..." 
              onKeyDown={(e) => e.key === 'Enter' && confirmImageInsert()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImageDialogOpen(false)}>取消</Button>
            <Button className="bg-white text-black hover:bg-amber-50" onClick={confirmImageInsert}>确认插入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSpotDialogOpen} onOpenChange={setIsSpotDialogOpen}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#09090b] text-white">
          <DialogHeader><DialogTitle>插入景点卡片</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input className="pl-10" value={spotSearch} onChange={(e) => setSpotSearch(e.target.value)} placeholder="搜索景点..." />
            </div>
            <div className="max-h-[300px] overflow-y-auto grid gap-3 sm:grid-cols-2">
              {filteredSpots.map((spot) => (
                <button 
                  key={spot.id} 
                  onClick={() => confirmSpotInsert(spot.id)}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                    <FallbackImage src={getLocationCover(spot)} alt={getLocationLabel(spot)} fill className="object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{getLocationLabel(spot)}</p>
                    <p className="truncate text-[10px] text-gray-400">{spot.regions?.country} / {spot.regions?.name_cn || spot.regions?.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSpotDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
