'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Search, Trash2, X } from 'lucide-react'

import type { LongformNote, NoteBlock, NoteBlockType } from '@/lib/notes'
import { EMPTY_NOTE, DEFAULT_NOTE_COVER_ACCENT } from '@/lib/notes'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import FallbackImage from '@/components/FallbackImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  function addBlock(type: NoteBlockType) {
    setForm((current) => ({ ...current, blocks: [...current.blocks, createEmptyBlock(type)] }))
  }

  function removeBlock(index: number) {
    setForm((current) => ({ ...current, blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index) }))
  }

  function moveBlock(index: number, direction: 'up' | 'down') {
    setForm((current) => ({ ...current, blocks: moveItem(current.blocks, index, direction) }))
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
      setMessage('长文笔记已保存。')
    } catch (error: any) {
      setMessage(error?.message || '保存失败。')
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
      setMessage('长文笔记已删除。')
    } catch (error: any) {
      setMessage(error?.message || '删除失败。')
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#09090b] text-white"><div className="mx-auto max-w-7xl px-4 py-10">正在加载长文笔记后台...</div></main>
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0a0a0b_0%,#09090b_35%,#050505_100%)] text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span>长文笔记</span>
                <Button size="sm" onClick={createNewNote} className="bg-white text-black hover:bg-amber-50">
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
                <Button variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={deleteCurrentNote} disabled={!form.slug}><Trash2 className="mr-2 h-4 w-4" />删除</Button>
                <Button className="bg-white text-black hover:bg-amber-50" onClick={saveNote} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? '保存中...' : '保存'}</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label>标题</Label><Input value={form.title} onChange={(event) => updateForm({ title: event.target.value, slug: form.slug || slugify(event.target.value) })} /></div>
              <div className="space-y-2"><Label>短标题</Label><Input value={form.shortTitle} onChange={(event) => updateForm({ shortTitle: event.target.value })} /></div>
              <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={(event) => updateForm({ slug: slugify(event.target.value) })} /></div>
              <div className="space-y-2"><Label>Kicker</Label><Input value={form.kicker} onChange={(event) => updateForm({ kicker: event.target.value })} /></div>
              <div className="space-y-2 md:col-span-2"><Label>Tagline</Label><Input value={form.tagline} onChange={(event) => updateForm({ tagline: event.target.value })} /></div>
              <div className="space-y-2 md:col-span-2"><Label>摘要</Label><Textarea value={form.summary} onChange={(event) => updateForm({ summary: event.target.value })} rows={4} /></div>
              <div className="space-y-2"><Label>封面图 URL</Label><Input value={form.coverImage || ''} onChange={(event) => updateForm({ coverImage: event.target.value })} /></div>
              <div className="space-y-2"><Label>标签</Label><Input value={stringifyCommaSeparated(form.tags)} onChange={(event) => updateForm({ tags: parseCommaSeparated(event.target.value) })} placeholder="例如：曼谷, 咖啡馆, 长文攻略" /></div>
              <label className="inline-flex items-center gap-3 text-sm text-white/80"><input type="checkbox" checked={form.published} onChange={(event) => updateForm({ published: event.target.checked })} />发布这篇笔记</label>
              {message ? <p className="md:col-span-2 text-sm text-amber-200">{message}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
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
              <CardTitle>正文模块</CardTitle>
              <div className="flex flex-wrap gap-2">
                {(['paragraph', 'heading', 'quote', 'image', 'spot', 'affiliate'] as NoteBlockType[]).map((type) => (
                  <Button key={type} variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => addBlock(type)}>
                    <Plus className="mr-2 h-4 w-4" />{type}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {form.blocks.length ? form.blocks.map((block, index) => {
                const selectedSpot = locations.find((item) => item.id === block.spotId)
                const selectedAffiliateIds = new Set(block.affiliateIds || [])
                return (
                  <div key={block.id} className="rounded-[28px] border border-white/10 bg-black/20 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-amber-400/10 text-amber-200">{block.type}</Badge>
                        <span className="text-sm text-gray-400">Block {index + 1}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="icon" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => moveBlock(index, 'up')}><ArrowUp className="h-4 w-4" /></Button>
                        <Button size="icon" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => moveBlock(index, 'down')}><ArrowDown className="h-4 w-4" /></Button>
                        <Button size="icon" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => removeBlock(index)}><Trash2 className="h-4 w-4" /></Button>
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
                        <div className="space-y-2"><Label>图片 URL</Label><Input value={block.imageUrl || ''} onChange={(event) => updateBlock(index, { imageUrl: event.target.value })} /></div>
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
    </main>
  )
}



