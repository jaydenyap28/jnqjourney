import 'server-only'

import { unstable_cache } from 'next/cache'

import type { TravelGuide } from '@/lib/guides'
import type { LongformNote } from '@/lib/notes'
import { normalizeGuidePayload, readGuides } from '@/lib/server/guides-store'
import { normalizeNotePayload, readPublishedNotes } from '@/lib/server/notes-store'

const TIMEOUT_MS = 4000

function cdnBase() {
  return String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

async function withTimeout<T>(promise: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readCdnCollection<T>(fileName: string, key: 'guides' | 'notes', tag: string) {
  const base = cdnBase()
  if (!base) return null
  try {
    const response = await withTimeout(fetch(`${base}/public-data/${fileName}`, {
      next: { revalidate: 3600, tags: [tag] },
    }), `Public ${key} CDN`)
    if (!response.ok) return null
    const payload = await response.json() as Record<string, unknown>
    return payload?.schemaVersion === 1 && Array.isArray(payload[key]) ? payload[key] as unknown[] : null
  } catch {
    return null
  }
}

async function readPublicGuidesUncached(): Promise<TravelGuide[]> {
  const snapshot = await readCdnCollection('guides.json', 'guides', 'guides')
  if (snapshot) return snapshot.map((item) => normalizeGuidePayload(item)).filter((guide) => guide.slug && guide.title)
  return readGuides()
}

async function readPublicNotesUncached(): Promise<LongformNote[]> {
  const snapshot = await readCdnCollection('notes.json', 'notes', 'notes')
  if (snapshot) return snapshot.map((item) => normalizeNotePayload(item)).filter((note) => note.published && note.slug && note.title)
  return readPublishedNotes()
}

const readGuidesCached = unstable_cache(readPublicGuidesUncached, ['public-guides-v1'], {
  revalidate: 3600,
  tags: ['guides'],
})
const readNotesCached = unstable_cache(readPublicNotesUncached, ['public-notes-v1'], {
  revalidate: 3600,
  tags: ['notes'],
})

export function readPublicGuides() {
  return readGuidesCached()
}

export async function readPublicGuideBySlug(slug: string) {
  const guides = await readPublicGuides()
  return guides.find((guide) => guide.slug === slug || guide.aliases?.includes(slug)) || null
}

export function readPublicNotes() {
  return readNotesCached()
}

export async function readPublicNoteBySlug(slug: string) {
  const notes = await readPublicNotes()
  return notes.find((note) => note.slug === slug || note.aliases?.includes(slug)) || null
}
