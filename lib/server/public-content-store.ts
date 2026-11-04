import 'server-only'

import { freshGuideSnapshotUrl } from '@/lib/guide-publication'
import { freshNoteSnapshotUrl } from '@/lib/note-publication'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

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

async function readCdnCollection(key: 'guides' | 'notes') {
  const base = cdnBase()
  if (!base) return null
  const response = await withTimeout(fetch(key === 'guides' ? freshGuideSnapshotUrl(base) : freshNoteSnapshotUrl(base),
      // The outer unstable_cache owns persistence. Next 14's ISR renderer
      // treats an explicit no-store init as a dynamic bailout even inside that
      // callback. A unique publication URL bypasses old CDN objects; no inner
      // force-cache entry is written while the callback runs force-no-store.
      { headers: { 'Cache-Control': 'no-cache' } }), `Public ${key} CDN`)
  if (!response.ok) throw new Error(`Published ${key} snapshot unavailable (${response.status})`)
  const payload = await response.json() as Record<string, unknown>
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload[key])) throw new Error(`Invalid published ${key} snapshot`)
  // Errors deliberately escape: ISR can retain a previously generated page;
  // configured source failures must not cache an older bundled collection.
  return payload[key] as unknown[]
}

async function readPublicGuidesUncached(): Promise<TravelGuide[]> {
  const snapshot = await readCdnCollection('guides')
  if (snapshot) return snapshot.map((item) => normalizeGuidePayload(item)).filter((guide) => guide.slug && guide.title)
  return readGuides()
}

async function readPublicGuideBySlugUncached(slug: string): Promise<TravelGuide | null> {
  const guides = await readPublicGuides()
  return guides.find((guide) => guide.slug === slug || guide.aliases?.includes(slug)) || null
}

async function readPublicNotesUncached(): Promise<LongformNote[]> {
  const snapshot = await readCdnCollection('notes')
  if (snapshot) return snapshot.map((item) => normalizeNotePayload(item)).filter((note) => note.published && note.slug && note.title)
  return readPublishedNotes()
}

async function readPublicNoteBySlugUncached(slug: string): Promise<LongformNote | null> {
  const notes = await readPublicNotes()
  return notes.find((note) => note.slug === slug || note.aliases?.includes(slug)) || null
}

// Drop v3 entries that may contain a swallowed static-generation fallback.
const readGuidesCached = unstable_cache(readPublicGuidesUncached, ['public-guides-v5'], {
  revalidate: 3600,
  tags: ['guides'],
})
const readNotesCached = unstable_cache(readPublicNotesUncached, ['public-notes-v4'], {
  revalidate: 3600,
  tags: ['notes'],
})

export const readPublicGuides = typeof cache === 'function' ? cache(readGuidesCached) : readGuidesCached

// Memoize selection only for the current render. The collection remains the
// sole persistent entry, so edits and aliases use the existing invalidations.
export const readPublicGuideBySlug = typeof cache === 'function' ? cache(readPublicGuideBySlugUncached) : readPublicGuideBySlugUncached
export const readPublicNotes = typeof cache === 'function' ? cache(readNotesCached) : readNotesCached
export const readPublicNoteBySlug = typeof cache === 'function' ? cache(readPublicNoteBySlugUncached) : readPublicNoteBySlugUncached
