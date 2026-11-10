import 'server-only'

import { readPrivatePublicFeed, PublicReadUnavailable } from './public-read-source'
import { requestCache as cache } from './request-cache'

import type { TravelGuide } from '@/lib/guides'
import type { LongformNote } from '@/lib/notes'
import { normalizeGuidePayload } from '@/lib/server/guides-store'
import { normalizeNotePayload } from '@/lib/server/notes-store'

async function readPublicGuidesUncached(): Promise<TravelGuide[]> {
  const value = await readPrivatePublicFeed<{guides: unknown[]}>('guides.json')
  if (!Array.isArray(value.guides)) throw new PublicReadUnavailable()
  return value.guides.map(item => normalizeGuidePayload(item)).filter(guide => guide.slug && guide.title)
}

async function readPublicGuideBySlugUncached(slug: string): Promise<TravelGuide | null> {
  const guides = await readPublicGuides()
  return guides.find((guide) => guide.slug === slug || guide.aliases?.includes(slug)) || null
}

async function readPublicNotesUncached(): Promise<LongformNote[]> {
  const value = await readPrivatePublicFeed<{notes: unknown[]}>('notes.json')
  if (!Array.isArray(value.notes)) throw new PublicReadUnavailable()
  return value.notes.map(normalizeNotePayload).filter(note => note.published && note.slug && note.title)
}

async function readPublicNoteBySlugUncached(slug: string): Promise<LongformNote | null> {
  const notes = await readPublicNotes()
  return notes.find((note) => note.slug === slug || note.aliases?.includes(slug)) || null
}

// Request-local memoization only; publication reads never persist across requests.
export const readPublicGuides = cache(readPublicGuidesUncached)
export const readPublicGuideBySlug = cache(readPublicGuideBySlugUncached)
export const readPublicNotes = cache(readPublicNotesUncached)
export const readPublicNoteBySlug = cache(readPublicNoteBySlugUncached)
