'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Save, Search, Trash2 } from 'lucide-react'

import type { LongformNote, NoteBlock, NoteBlockType, NoteImageItem } from '@/lib/notes'
import {
  buildFallbackAlt,
  DEFAULT_NOTE_COVER_ACCENT,
  EMPTY_NOTE,
  getRenderableNoteBlocks,
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

function createBlockId() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getSlashCommandAtCursor(value: string, cursorPosition: number) {
  const safeCursor = Math.max(0, Math.min(cursorPosition, value.length))
  const beforeCursor = value.slice(0, safeCursor)
  const match = beforeCursor.match(/(^|\s)(\/[a-z]+)$/i)
  if (!match) return null

  const command = match[2].toLowerCase()
  const commandStart = beforeCursor.length - command.length

  return {
    command,
    commandStart,
    commandEnd: beforeCursor.length,
  }
}

function stripSlashCommand(value: string, commandStart: number, commandEnd: number) {
  const before = value.slice(0, commandStart).replace(/\s+$/, '')
  const after = value.slice(commandEnd).replace(/^\s+/, '')

  if (!before) return after
  if (!after) return before
  return `${before}\n${after}`
}

function createEmptyBlock(type: NoteBlockType): NoteBlock {
  if (type === 'image') {
    return { id: createBlockId(), type, imageUrl: '', alt: '', caption: '' }
  }
  if (type === 'gallery' || type === 'spotImages') {
    return { id: createBlockId(), type, images: [] }
  }
  return { id: createBlockId(), type, content: '' }
}

function moveItem<T>(items: T[], index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function getLocationLabel(location?: LocationOption | null) {
  if (!location) return ''
  return location.name_cn || location.name
}

function getLocationImages(location?: LocationOption | null) {
  if (!location) return []
  const items = [location.image_url, ...(location.images || [])].filter(Boolean) as string[]
  return Array.from(new Set(items))
}

function renderableBlocks(note: LongformNote) {
  return getRenderableNoteBlocks(note)
}

const BLOCK_OPTIONS: { type: NoteBlockType; label: string }[] = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'heading', label: 'Heading' },
  { type: 'quote', label: 'Quote' },
  { type: 'image', label: 'Single Image' },
  { type: 'spotImages', label: 'Spot Images' },
]

function BlockPreview({
  block,
  locationsById,
}: {
  block: NoteBlock
  locationsById: Map<number, LocationOption>
}) {
  if (block.type === 'heading') {
    return <h3 className="text-2xl font-semibold text-white">{block.content || 'Section heading'}</h3>
  }

  if (block.type === 'quote') {
    return <blockquote className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-base leading-8 text-white/85">{block.content || 'Quote block'}</blockquote>
  }

  if (block.type === 'image' && block.imageUrl) {
    const alt = block.alt?.trim() || buildFallbackAlt(undefined, block.caption)
    return (
      <figure className="space-y-3">
        <div className="relative aspect-[16/10] overflow-hidden rounded-[26px] border border-white/10 bg-white/5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
          <FallbackImage src={block.imageUrl} alt={alt} fill sizes="(max-width: 1024px) 100vw, 760px" className="object-cover" />
        </div>
        {block.caption ? <figcaption className="text-sm leading-7 text-white/55">{block.caption}</figcaption> : null}
      </figure>
    )
  }

  if ((block.type === 'gallery' || block.type === 'spotImages') && block.images?.length) {
    const spot = block.spotId ? locationsById.get(block.spotId) : null
    return (
      <div className="space-y-4">
        {block.type === 'spotImages' ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            <ImageIcon className="h-3.5 w-3.5" />
            {block.spotName || getLocationLabel(spot) || 'Spot images'}
          </div>
        ) : null}
        <div className={`grid gap-4 ${block.images.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {block.images.map((image, index) => (
            <figure key={`${block.id}-${index}`} className="space-y-3">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-[0_16px_35px_rgba(0,0,0,0.16)]">
                <FallbackImage
                  src={image.src}
                  alt={image.alt || buildFallbackAlt(block.spotName || getLocationLabel(spot), image.caption)}
                  fill
                  sizes="(max-width: 1024px) 100vw, 520px"
                  className="object-cover"
                />
              </div>
              {image.caption ? <figcaption className="text-sm leading-7 text-white/55">{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
    )
  }

  return <p className="text-base leading-8 text-gray-200 whitespace-pre-wrap">{block.content || 'Paragraph block'}</p>
}

export default function AdminNotesPage() {
  const [notes, setNotes] = useState<LongformNote[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [form, setForm] = useState<LongformNote>({ ...EMPTY_NOTE, blocks: [createEmptyBlock('paragraph')] })
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerBlockId, setPickerBlockId] = useState('')
  const [pickerMode, setPickerMode] = useState<'replace' | 'insertAfter'>('replace')
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [commandBlockId, setCommandBlockId] = useState('')
  const [spotQuery, setSpotQuery] = useState('')
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null)
  const [selectedSpotImageUrls, setSelectedSpotImageUrls] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      try {
        const [notesResponse, locationsResponse] = await Promise.all([
          adminFetch('/api/admin/notes', { cache: 'no-store' }),
          supabase
            .from('locations')
            .select('id,name,name_cn,image_url,images,category,regions:region_id(id,name,name_cn,country)')
            .order('id', { ascending: false }),
        ])

        const notesResult = notesResponse.ok ? await notesResponse.json() : { notes: [] }
        if (cancelled) return

        const nextNotes = Array.isArray(notesResult?.notes) ? notesResult.notes : []
        setNotes(nextNotes)
        setLocations((locationsResponse.data || []).map((item: any) => ({
          ...item,
          regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
        })))

        if (nextNotes.length) {
          setSelectedSlug(nextNotes[0].slug)
          setForm({
            ...nextNotes[0],
            blocks: renderableBlocks(nextNotes[0]),
          })
        } else {
          setForm({ ...EMPTY_NOTE, blocks: [createEmptyBlock('paragraph')] })
        }
      } catch {
        if (!cancelled) {
          setNotes([])
          setLocations([])
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
    setForm({
      ...selected,
      blocks: renderableBlocks(selected),
    })
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

  const selectedSpot = selectedSpotId ? locationsById.get(selectedSpotId) || null : null
  const selectedSpotImages = useMemo(() => getLocationImages(selectedSpot), [selectedSpot])

  function createNewNote() {
    const next: LongformNote = {
      ...EMPTY_NOTE,
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
      blocks: current.blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, ...patch } : block)),
    }))
  }

  function updateBlockImage(index: number, imageIndex: number, patch: Partial<NoteImageItem>) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) => {
        if (blockIndex !== index) return block
        const nextImages = (block.images || []).map((image, currentImageIndex) =>
          currentImageIndex === imageIndex ? { ...image, ...patch } : image
        )
        return { ...block, images: nextImages }
      }),
    }))
  }

  function removeBlock(index: number) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index),
    }))
  }

  function addBlock(type: NoteBlockType, afterIndex?: number) {
    const nextBlock = createEmptyBlock(type)
    setForm((current) => {
      if (typeof afterIndex === 'number') {
        const nextBlocks = [...current.blocks]
        nextBlocks.splice(afterIndex + 1, 0, nextBlock)
        return { ...current, blocks: nextBlocks }
      }
      return { ...current, blocks: [...current.blocks, nextBlock] }
    })
  }

  function moveBlock(index: number, direction: 'up' | 'down') {
    setForm((current) => ({
      ...current,
      blocks: moveItem(current.blocks, index, direction),
    }))
  }

  function openSpotImagePicker(blockId: string, mode: 'replace' | 'insertAfter' = 'replace') {
    const targetBlock = form.blocks.find((block) => block.id === blockId)
    setPickerBlockId(blockId)
    setPickerMode(mode)
    setPickerOpen(true)
    setSpotQuery('')
    if (mode === 'replace') {
      setSelectedSpotId(targetBlock?.spotId || null)
      setSelectedSpotImageUrls(targetBlock?.images?.map((image) => image.src) || [])
    } else {
      setSelectedSpotId(null)
      setSelectedSpotImageUrls([])
    }
  }

  function openCommandMenu(blockId: string) {
    setCommandBlockId(blockId)
    setCommandMenuOpen(true)
  }

  function runCommand(type: 'paragraph' | 'image' | 'spotImages') {
    const targetIndex = form.blocks.findIndex((block) => block.id === commandBlockId)
    if (targetIndex === -1) {
      setCommandMenuOpen(false)
      return
    }

    if (type === 'spotImages') {
      setCommandMenuOpen(false)
      openSpotImagePicker(commandBlockId, 'insertAfter')
      return
    }

    addBlock(type, targetIndex)
    setCommandMenuOpen(false)
    setMessage(
      type === 'image'
        ? 'Inserted a single image block below the current text block.'
        : 'Inserted a paragraph block below the current text block.'
    )
  }

  function runSlashCommandFromEditor(blockId: string, command: string) {
    const normalized = command.toLowerCase()
    setCommandMenuOpen(false)

    if (normalized === '/spot') {
      openSpotImagePicker(blockId, 'insertAfter')
      setMessage('Opening spot gallery picker for this block.')
      return
    }

    if (normalized === '/image') {
      const targetIndex = form.blocks.findIndex((block) => block.id === blockId)
      if (targetIndex === -1) return
      addBlock('image', targetIndex)
      setMessage('Inserted a single image block below the current text block.')
      return
    }

    if (normalized === '/p' || normalized === '/paragraph') {
      const targetIndex = form.blocks.findIndex((block) => block.id === blockId)
      if (targetIndex === -1) return
      addBlock('paragraph', targetIndex)
      setMessage('Inserted a paragraph block below the current text block.')
    }
  }

  function applySpotImagesToBlock() {
    if (!pickerBlockId || !selectedSpot) return

    const targetIndex = form.blocks.findIndex((block) => block.id === pickerBlockId)
    if (targetIndex === -1) return

    const images = selectedSpotImageUrls
      .map((src) =>
        ({
          src,
          alt: buildFallbackAlt(getLocationLabel(selectedSpot)),
          caption: '',
        }) satisfies NoteImageItem
      )
      .filter((image) => image.src)

    if (pickerMode === 'insertAfter') {
      const nextBlock: NoteBlock = {
        id: createBlockId(),
        type: 'spotImages',
        spotId: selectedSpot.id,
        spotName: getLocationLabel(selectedSpot),
        images,
      }

      setForm((current) => {
        const nextBlocks = [...current.blocks]
        nextBlocks.splice(targetIndex + 1, 0, nextBlock)
        return { ...current, blocks: nextBlocks }
      })
      setMessage(`Inserted ${images.length} image${images.length > 1 ? 's' : ''} from ${getLocationLabel(selectedSpot)} below the current block.`)
    } else {
      updateBlock(targetIndex, {
        type: 'spotImages',
        spotId: selectedSpot.id,
        spotName: getLocationLabel(selectedSpot),
        images,
      })
      setMessage(`Updated this image block with ${images.length} image${images.length > 1 ? 's' : ''} from ${getLocationLabel(selectedSpot)}.`)
    }
    setPickerOpen(false)
  }

  async function saveNote() {
    setSaving(true)
    setMessage('')

    const normalizedBlocks = form.blocks
      .map((block) => {
        if (block.type === 'image') {
          return {
            ...block,
            imageUrl: String(block.imageUrl || '').trim(),
            alt: String(block.alt || '').trim() || buildFallbackAlt(undefined, block.caption),
            caption: String(block.caption || '').trim() || undefined,
          }
        }

        if (block.type === 'gallery' || block.type === 'spotImages') {
          return {
            ...block,
            images: (block.images || [])
              .map((image) => ({
                src: String(image.src || '').trim(),
                alt: String(image.alt || '').trim() || buildFallbackAlt(block.spotName, image.caption),
                caption: String(image.caption || '').trim() || undefined,
              }))
              .filter((image) => image.src),
          }
        }

        return {
          ...block,
          content: String(block.content || '').trim(),
        }
      })
      .filter((block) => {
        if (block.type === 'image') return Boolean(block.imageUrl)
        if (block.type === 'gallery' || block.type === 'spotImages') return Boolean(block.images?.length)
        return Boolean(block.content)
      })

    const contentFallback = normalizedBlocks
      .filter((block) => block.type === 'paragraph' || block.type === 'quote')
      .map((block) => block.content || '')
      .filter(Boolean)
      .join('\n\n')

    const payload: LongformNote & { previousSlug?: string } = {
      ...form,
      slug: form.slug || slugify(form.title),
      shortTitle: form.shortTitle || form.title,
      tags: parseCommaSeparated(stringifyCommaSeparated(form.tags)),
      content: contentFallback || form.content || '',
      blocks: normalizedBlocks,
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
        <div className="mx-auto max-w-7xl px-4 py-10">Loading notes…</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0a0a0b_0%,#09090b_35%,#050505_100%)] text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[300px_minmax(0,1fr)]">
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

        <section className="space-y-6">
          <Card className="border-white/10 bg-white/5 text-white">
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
                  {saving ? 'Saving…' : form.published ? 'Save & Update' : 'Save Draft'}
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
                <Label>Excerpt / Summary</Label>
                <Textarea value={form.summary} onChange={(event) => updateForm({ summary: event.target.value })} rows={3} placeholder="This summary is used for cards and metadata." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Cover Image URL</Label>
                <Input value={form.coverImage || ''} onChange={(event) => updateForm({ coverImage: event.target.value })} placeholder="https://..." />
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

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="border-white/10 bg-white/5 text-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>Content Blocks</span>
                  <div className="flex flex-wrap gap-2">
                    {BLOCK_OPTIONS.map((option) => (
                      <Button
                        key={option.type}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-white/10 bg-transparent text-white hover:bg-white/10"
                        onClick={() => addBlock(option.type)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {form.blocks.length ? (
                  form.blocks.map((block, index) => (
                    <div key={block.id} className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">{block.type}</p>
                          <p className="mt-2 text-lg font-medium text-white">Block {index + 1}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="icon" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => moveBlock(index, 'up')}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => moveBlock(index, 'down')}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="icon" className="border-red-400/20 bg-transparent text-red-200 hover:bg-red-500/10" onClick={() => removeBlock(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        {(block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') ? (
                          <div className="space-y-2">
                            <Label>Text</Label>
                            <Textarea
                              value={block.content || ''}
                              onChange={(event) => updateBlock(index, { content: event.target.value })}
                              onKeyDown={(event) => {
                                const target = event.currentTarget
                                const slashCommand =
                                  event.key === ' ' || event.key === 'Enter' || event.key === 'Tab'
                                    ? getSlashCommandAtCursor(target.value, target.selectionStart ?? target.value.length)
                                    : null

                                if (slashCommand && ['/spot', '/image', '/p', '/paragraph'].includes(slashCommand.command)) {
                                  event.preventDefault()
                                  const nextContent = stripSlashCommand(target.value, slashCommand.commandStart, slashCommand.commandEnd)
                                  updateBlock(index, { content: nextContent })
                                  runSlashCommandFromEditor(block.id, slashCommand.command)
                                  return
                                }

                              }}
                              rows={block.type === 'heading' ? 2 : 6}
                              placeholder={block.type === 'heading' ? 'Section heading' : "Write your paragraph here. Press '/' or type /spot, /image, /p."}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
                              <p>Type <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70">/spot</span>, <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70">/image</span>, <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70">/p</span> then press space, Enter, or Tab.</p>
                              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white" onClick={() => openCommandMenu(block.id)}>
                                Quick Insert
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {block.type === 'image' ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Image URL</Label>
                              <Input value={block.imageUrl || ''} onChange={(event) => updateBlock(index, { imageUrl: event.target.value })} placeholder="https://..." />
                            </div>
                            <div className="space-y-2">
                              <Label>Alt</Label>
                              <Input value={block.alt || ''} onChange={(event) => updateBlock(index, { alt: event.target.value })} placeholder="If empty, it will be generated automatically." />
                            </div>
                            <div className="space-y-2">
                              <Label>Caption</Label>
                              <Textarea value={block.caption || ''} onChange={(event) => updateBlock(index, { caption: event.target.value })} rows={2} placeholder="Optional caption" />
                            </div>
                          </div>
                        ) : null}

                        {(block.type === 'spotImages' || block.type === 'gallery') ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                              <div>
                                <p className="font-medium text-white">{block.spotName || 'No spot selected yet'}</p>
                                <p className="text-sm text-white/55">
                                  {block.images?.length ? `${block.images.length} images selected` : 'Pick a spot, then select one or more images.'}
                                </p>
                              </div>
                              <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => openSpotImagePicker(block.id, 'replace')}>
                                <Search className="mr-2 h-4 w-4" />
                                Change selected images
                              </Button>
                            </div>

                            {block.images?.length ? (
                              <div className="space-y-4">
                                {block.images.map((image, imageIndex) => (
                                  <div key={`${block.id}-${imageIndex}`} className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
                                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                                      <FallbackImage src={image.src} alt={image.alt} fill sizes="180px" className="object-cover" />
                                    </div>
                                    <div className="space-y-3">
                                      <div className="space-y-2">
                                        <Label>Alt</Label>
                                        <Input
                                          value={image.alt}
                                          onChange={(event) => updateBlockImage(index, imageIndex, { alt: event.target.value })}
                                          placeholder="Alt text"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Caption</Label>
                                        <Textarea
                                          value={image.caption || ''}
                                          onChange={(event) => updateBlockImage(index, imageIndex, { caption: event.target.value })}
                                          rows={2}
                                          placeholder="Optional caption"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => addBlock('paragraph', index)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Paragraph below
                          </Button>
                          <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => addBlock('image', index)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Single image below
                          </Button>
                          {(block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') ? (
                            <Button type="button" variant="outline" className="border-emerald-400/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20" onClick={() => openSpotImagePicker(block.id, 'insertAfter')}>
                              <ImageIcon className="mr-2 h-4 w-4" />
                              Insert spot gallery below
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => addBlock('spotImages', index)}>
                              <Plus className="mr-2 h-4 w-4" />
                              Spot images below
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-white/15 bg-black/20 p-6 text-sm text-white/55">
                    No blocks yet. Add a paragraph block to begin.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5 text-white">
              <CardHeader>
                <CardTitle>Structure Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <section className={`overflow-hidden rounded-[30px] border border-white/10 p-6 ${form.coverAccent || DEFAULT_NOTE_COVER_ACCENT}`}>
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-200/80">{form.kicker || 'Longform Note'}</p>
                  <h2 className="mt-4 text-4xl font-semibold leading-tight text-white">{form.title || 'Your note title'}</h2>
                  {form.tagline ? <p className="mt-4 text-sm leading-7 text-white/80">{form.tagline}</p> : null}
                </section>

                {form.summary ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-sm leading-7 text-white/70">
                    {form.summary}
                  </div>
                ) : null}

                <div className="space-y-6">
                  {form.blocks.map((block) => (
                    <BlockPreview key={block.id} block={block} locationsById={locationsById} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-5xl border-white/10 bg-[#0b0b0d] text-white">
          <DialogHeader>
            <DialogTitle>{pickerMode === 'insertAfter' ? 'Insert spot images below current block' : 'Edit selected spot images'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Search spot</Label>
                <Input value={spotQuery} onChange={(event) => setSpotQuery(event.target.value)} placeholder="BOH Tea Centre, Green View Garden…" />
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
                {filteredSpots.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => {
                      setSelectedSpotId(spot.id)
                      setSelectedSpotImageUrls([])
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
                <p className="font-medium text-white">{selectedSpot ? getLocationLabel(selectedSpot) : 'Choose a spot first'}</p>
                <p className="mt-1 text-sm text-white/55">
                  {selectedSpot ? 'Select one or more existing images and insert them exactly below the block you selected.' : 'This picker reuses images already saved on the spot.'}
                </p>
              </div>

              {selectedSpot ? (
                selectedSpotImages.length ? (
                  <div className="grid max-h-[480px] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
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
                          className={`overflow-hidden rounded-[24px] border text-left transition ${checked ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden">
                            <FallbackImage src={src} alt={getLocationLabel(selectedSpot)} fill sizes="320px" className="object-cover" />
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
                    This spot has no images yet.
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-sm text-white/55">
                  Search a spot on the left, then choose images from its existing gallery or cover.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-white text-black hover:bg-amber-50" onClick={applySpotImagesToBlock} disabled={!selectedSpotId || !selectedSpotImageUrls.length}>
              Insert selected images
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commandMenuOpen} onOpenChange={setCommandMenuOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-[#0b0b0d] text-white">
          <DialogHeader>
            <DialogTitle>Quick Insert</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => runCommand('spotImages')}
              className="flex w-full items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-left transition hover:bg-emerald-500/20"
            >
              <div>
                <p className="font-medium text-emerald-100">Insert spot gallery below</p>
                <p className="mt-1 text-sm text-emerald-100/65">Search an existing spot and insert one or more of its saved images below this text block.</p>
              </div>
              <ImageIcon className="h-5 w-5 text-emerald-200" />
            </button>

            <button
              type="button"
              onClick={() => runCommand('image')}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:bg-white/10"
            >
              <div>
                <p className="font-medium text-white">Insert single image below</p>
                <p className="mt-1 text-sm text-white/55">Add one standalone image block and paste a URL.</p>
              </div>
              <Plus className="h-5 w-5 text-white/70" />
            </button>

            <button
              type="button"
              onClick={() => runCommand('paragraph')}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:bg-white/10"
            >
              <div>
                <p className="font-medium text-white">Insert paragraph below</p>
                <p className="mt-1 text-sm text-white/55">Continue the story with another text block below the current one.</p>
              </div>
              <Plus className="h-5 w-5 text-white/70" />
            </button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10" onClick={() => setCommandMenuOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
