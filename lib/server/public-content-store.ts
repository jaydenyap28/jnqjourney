import 'server-only'

import { freshGuideSnapshotUrl } from '@/lib/guide-publication'
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

async function readCdnCollection<T>(fileName: string, key: 'guides' | 'notes', tags: string[]) {
  const base = cdnBase()
  if (!base) return null
  try {
    const response = await withTimeout(fetch(key === 'guides' ? freshGuideSnapshotUrl(base) : `${base}/public-data/${fileName}`, key === 'guides'
      // The outer unstable_cache owns persistence. Next 14's ISR renderer
      // treats an explicit no-store init as a dynamic bailout even inside that
      // callback. A unique publication URL bypasses old CDN objects; no inner
      // force-cache entry is written while the callback runs force-no-store.
      ? { headers: { 'Cache-Control': 'no-cache' } }
      : { headers: { 'Cache-Control': 'no-cache' }, next: { revalidate: 3600, tags } }), `Public ${key} CDN`)
    if (!response.ok) return null
    const payload = await response.json() as Record<string, unknown>
    return payload?.schemaVersion === 1 && Array.isArray(payload[key]) ? payload[key] as unknown[] : null
  } catch (error) {
    // Framework control flow is not an origin outage. Swallowing it would
    // cache a bundled fallback as though a fresh public snapshot was read.
    if (error && typeof error === 'object' && 'digest' in error && ['DYNAMIC_SERVER_USAGE', 'NEXT_STATIC_GEN_BAILOUT'].includes(String(error.digest))) throw error
    return null
  }
}

async function readPublicGuidesUncached(): Promise<TravelGuide[]> {
  const snapshot = await readCdnCollection('guides.json', 'guides', ['guides'])
  if (snapshot) return snapshot.map((item) => normalizeGuidePayload(item)).filter((guide) => guide.slug && guide.title)
  return readGuides()
}

async function readPublicGuideBySlugUncached(slug: string): Promise<TravelGuide | null> {
  const guides = await readPublicGuides()
  return guides.find((guide) => guide.slug === slug || guide.aliases?.includes(slug)) || null
}

async function readPublicNotesUncached(): Promise<LongformNote[]> {
  const snapshot = await readCdnCollection('notes.json', 'notes', ['notes'])
  if (snapshot) return snapshot.map((item) => normalizeNotePayload(item)).filter((note) => note.published && note.slug && note.title)
  return readPublishedNotes()
}

async function readPublicNoteBySlugUncached(slug: string): Promise<LongformNote | null> {
  const notes = await readPublicNotes()
  return notes.find((note) => note.slug === slug || note.aliases?.includes(slug)) || null
}

// Drop v3 entries that may contain a swallowed static-generation fallback.
const readGuidesCached = unstable_cache(readPublicGuidesUncached, ['public-guides-v4'], {
  revalidate: 3600,
  tags: ['guides'],
})
const readNotesCached = unstable_cache(readPublicNotesUncached, ['public-notes-v3'], {
  revalidate: 3600,
  tags: ['notes'],
})

export function readPublicGuides() {
  return readGuidesCached()
}

export async function readPublicGuideBySlug(slug: string) {
  // One collection cache, then a cheap selection. Nesting a second persistent
  // cache here can freeze a stale selection while the collection refreshes.
  return readPublicGuideBySlugUncached(slug)
}

export function readPublicNotes() {
  return readNotesCached()
}

export async function readPublicNoteBySlug(slug: string) {
  return readPublicNoteBySlugUncached(slug)
}
