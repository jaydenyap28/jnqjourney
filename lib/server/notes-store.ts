import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { LongformNote, NoteBlock } from '@/lib/notes'
import { DEFAULT_NOTE_COVER_ACCENT } from '@/lib/notes'

const notesFilePath = path.join(process.cwd(), 'data', 'notes.json')
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'
const STORAGE_PATH = '_system/notes.webp'
const LEGACY_STORAGE_PATH = '_system/notes.json'
const VERSIONED_STORAGE_DIR = '_system/notes'
const STORAGE_LATEST_POINTER_PATH = '_system/notes-latest.webp'
const LEGACY_STORAGE_LATEST_POINTER_PATH = '_system/notes-latest.txt'

// In-memory cache to reduce Supabase Storage egress
let cachedNotes: LongformNote[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 60 * 1000 // 1 minute cache in memory

function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function normalizeBlock(value: any): NoteBlock | null {
  const type = String(value?.type || '').trim() as NoteBlock['type']
  if (!type) return null

  const block: NoteBlock = {
    id: String(value?.id || '').trim() || `block-${Math.random().toString(36).slice(2, 10)}`,
    type,
    title: String(value?.title || '').trim() || undefined,
    content: String(value?.content || '').trim() || undefined,
    imageUrl: String(value?.imageUrl || '').trim() || undefined,
    caption: String(value?.caption || '').trim() || undefined,
    spotId: Number.isFinite(Number(value?.spotId)) ? Number(value.spotId) : undefined,
    affiliateIds: normalizeNumberArray(value?.affiliateIds),
  }

  if (block.type === 'image' && !block.imageUrl) return null
  if (block.type === 'spot' && !block.spotId) return null
  if (block.type === 'affiliate' && !block.affiliateIds?.length) return null
  if ((block.type === 'paragraph' || block.type === 'quote' || block.type === 'heading') && !block.content) {
    return null
  }

  return block
}

export function normalizeNotePayload(value: any): LongformNote {
  return {
    slug: String(value?.slug || '').trim(),
    aliases: normalizeStringArray(value?.aliases),
    title: String(value?.title || '').trim(),
    shortTitle: String(value?.shortTitle || '').trim() || String(value?.title || '').trim(),
    kicker: String(value?.kicker || '').trim() || 'Longform Note',
    tagline: String(value?.tagline || '').trim(),
    summary: String(value?.summary || '').trim(),
    coverImage: String(value?.coverImage || '').trim() || undefined,
    coverAccent: String(value?.coverAccent || '').trim() || DEFAULT_NOTE_COVER_ACCENT,
    published: Boolean(value?.published),
    tags: normalizeStringArray(value?.tags),
    relatedRegionIds: normalizeNumberArray(value?.relatedRegionIds),
    relatedSpotIds: normalizeNumberArray(value?.relatedSpotIds),
    blocks: Array.isArray(value?.blocks)
      ? value.blocks
          .map((item: any) => normalizeBlock(item))
          .filter((item: NoteBlock | null): item is NoteBlock => Boolean(item))
      : [],
    createdAt: String(value?.createdAt || '').trim() || undefined,
    updatedAt: String(value?.updatedAt || '').trim() || undefined,
  }
}

function sortNotes(notes: LongformNote[]) {
  return [...notes].sort((left, right) => {
    const leftDate = left.updatedAt || left.createdAt || ''
    const rightDate = right.updatedAt || right.createdAt || ''
    if (leftDate && rightDate && leftDate !== rightDate) {
      return Date.parse(rightDate) - Date.parse(leftDate)
    }
    if (left.published !== right.published) {
      return left.published ? -1 : 1
    }
    return left.title.localeCompare(right.title)
  })
}

async function readLocalNotes() {
  try {
    const raw = await readFile(notesFilePath, 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeNotePayload).filter((note) => note.slug && note.title)
  } catch {
    return []
  }
}

async function writeLocalNotes(notes: LongformNote[]) {
  try {
    await writeFile(notesFilePath, JSON.stringify(notes, null, 2), 'utf8')
  } catch (error: any) {
    if (error?.code === 'EROFS' || error?.code === 'EPERM') return
    throw error
  }
}

async function readStorageNotes() {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return null

  try {
    const candidatePaths: string[] = []

    for (const pointerPath of [STORAGE_LATEST_POINTER_PATH, LEGACY_STORAGE_LATEST_POINTER_PATH]) {
      const { data: latestPointer } = await supabase.storage.from(STORAGE_BUCKET).download(pointerPath)
      if (!latestPointer) continue
      const latestPath = String(await latestPointer.text()).trim()
      if (latestPath) candidatePaths.push(latestPath)
      if (latestPath) break
    }

    const { data: versions } = await supabase.storage.from(STORAGE_BUCKET).list(VERSIONED_STORAGE_DIR, {
      limit: 20,
      sortBy: { column: 'name', order: 'desc' },
    })

    const versionedFiles = Array.isArray(versions)
      ? versions
          .map((item) => String(item?.name || '').trim())
          .filter((item) => item.endsWith('.webp') || item.endsWith('.json'))
      : []

    candidatePaths.push(...versionedFiles.map((name) => `${VERSIONED_STORAGE_DIR}/${name}`), STORAGE_PATH, LEGACY_STORAGE_PATH)

    let raw = ''
    const dedupedPaths = Array.from(new Set(candidatePaths.filter(Boolean)))
    for (const candidatePath of dedupedPaths) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(candidatePath)
      if (error || !data) continue
      raw = await data.text()
      if (raw) break
    }

    if (!raw) return null
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) return []

    return parsed.map(normalizeNotePayload).filter((note) => note.slug && note.title)
  } catch {
    return null
  }
}

async function writeStorageNotes(notes: LongformNote[]) {
  const supabase = getAdminSupabaseClient()
  if (!supabase) return

  const payload = Buffer.from(`${JSON.stringify(notes, null, 2)}\n`, 'utf8')
  const versionedPath = `${VERSIONED_STORAGE_DIR}/${Date.now()}.webp`

  const { error: versionedError } = await supabase.storage.from(STORAGE_BUCKET).upload(versionedPath, payload, {
    upsert: false,
    contentType: 'image/webp',
    cacheControl: '0',
  })

  if (versionedError) {
    throw new Error(versionedError.message || 'Failed to persist versioned notes to storage.')
  }

  const { error: latestPointerError } = await supabase.storage.from(STORAGE_BUCKET).upload(
    STORAGE_LATEST_POINTER_PATH,
    Buffer.from(versionedPath, 'utf8'),
    {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '0',
    }
  )

  if (latestPointerError) {
    throw new Error(latestPointerError.message || 'Failed to persist latest notes pointer.')
  }

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, payload, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '0',
  })

  if (error) {
    throw new Error(error.message || 'Failed to persist notes to storage.')
  }
}

export async function readNotes() {
  const now = Date.now()
  if (cachedNotes && now - lastFetchTime < CACHE_TTL) {
    return sortNotes(cachedNotes)
  }

  const storageNotes = await readStorageNotes()
  if (storageNotes) {
    cachedNotes = storageNotes
    lastFetchTime = now
    try {
      await writeLocalNotes(storageNotes)
    } catch {}
    return sortNotes(storageNotes)
  }

  const localNotes = await readLocalNotes()
  if (localNotes.length) {
    cachedNotes = localNotes
    lastFetchTime = now
  }
  return sortNotes(localNotes)
}

export async function readPublishedNotes() {
  const notes = await readNotes()
  return notes.filter((note) => note.published)
}

export async function readNoteBySlug(slug: string) {
  const notes = await readNotes()
  return (
    notes.find(
      (note) => note.slug === slug || (Array.isArray(note.aliases) && note.aliases.includes(slug))
    ) || null
  )
}

export async function saveNotes(notes: LongformNote[]) {
  const normalized = notes.map(normalizeNotePayload)
  try {
    await writeLocalNotes(normalized)
  } catch {}
  await writeStorageNotes(normalized)
  // Clear cache after save
  cachedNotes = null
  lastFetchTime = 0
  return normalized
}
