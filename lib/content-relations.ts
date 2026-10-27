import type { LongformNote } from './notes.ts'
import type { PublicLocation, PublicRegion } from './public-data.ts'

export function packageMatchesSpot(item: { region_id?: number | null; related_location_ids?: number[] | null }, spot: { id: number; region_id?: number | null }) {
  return Boolean(item.related_location_ids?.includes(spot.id) ||
    (spot.region_id != null && item.region_id === spot.region_id))
}

export type RelatedNoteCard = Pick<LongformNote, 'slug' | 'title' | 'summary' | 'coverImage'>
export function toRelatedNoteCard({ slug, title, summary, coverImage }: LongformNote): RelatedNoteCard {
  return { slug, title, summary, ...(coverImage ? { coverImage } : {}) }
}

export type GuideRouteNoteCard = RelatedNoteCard & { routeItemSlug: string }

export function selectGuideRouteNoteCards(slugs: string[], notes: LongformNote[]): GuideRouteNoteCard[] {
  const seen = new Set<string>()
  return slugs.flatMap((routeItemSlug) => {
    const note = notes.find((item) => item.published && (item.slug === routeItemSlug || item.aliases?.includes(routeItemSlug)))
    if (!note || seen.has(note.slug)) return []
    seen.add(note.slug)
    return [{ ...toRelatedNoteCard(note), routeItemSlug }]
  })
}

export function selectRelatedNotes(slugs: string[] | null | undefined, notes: LongformNote[], self?: string) {
  const seen = new Set<string>()
  return (slugs || []).flatMap(slug => {
    const note = notes.find(item => item.published && (item.slug === slug || item.aliases?.includes(slug)))
    if (!note || note.slug === self || seen.has(note.slug)) return []
    seen.add(note.slug)
    return [note]
  })
}

// Manual links retain their order. Also expose published travel notes that
// explicitly reference this place; locality/tag similarity alone is insufficient.
export function relatedNotesForSpot(spot: { id: number; related_note_slugs?: string[] | null }, notes: LongformNote[]) {
  const selected = selectRelatedNotes(spot.related_note_slugs, notes)
  if (selected.length >= 4) return selected
  const seen = new Set(selected.map(note => note.slug))
  for (const note of notes) {
    if (!note.published || seen.has(note.slug)) continue
    if (!note.relatedSpotIds?.includes(spot.id) && !note.blocks.some(block => block.spotId === spot.id)) continue
    seen.add(note.slug)
    selected.push(note)
    if (selected.length === 4) break
  }
  return selected
}

// Only descend into explicitly selected geography. Never widen a city to its
// country or use unverified title/tag guesses to select a destination.
export function noteRegionIds(note: LongformNote, locations: PublicLocation[], regions: PublicRegion[]) {
  const explicit = note.relatedRegionIds || []
  const referenced = [...(note.relatedSpotIds || []), ...note.blocks.flatMap(b => b.spotId ? [b.spotId] : [])]
  const ids = new Set(explicit.length ? explicit : locations.filter(l => referenced.includes(l.id)).flatMap(l => l.region ? [l.region.id] : []))
  for (let pass = 0; pass < regions.length; pass++) {
    let changed = false
    for (const region of regions) {
      if (region.parentId && ids.has(region.parentId) && !ids.has(region.id)) {
        const parent = regions.find(r => r.id === region.parentId)
        if (parent?.country && region.country && parent.country !== region.country) continue
        ids.add(region.id); changed = true
      }
    }
    if (!changed) break
  }
  return ids
}

export function selectNoteSpotIds(note: LongformNote, locations: PublicLocation[], regions: PublicRegion[]) {
  if (note.relatedSpotIds?.length) return [...new Set(note.relatedSpotIds)]
  const regionIds = noteRegionIds(note, locations, regions)
  return locations.filter(l => l.region && regionIds.has(l.region.id)).slice(0, 8).map(l => l.id)
}

export function relatedNotesForNote(note: LongformNote, notes: LongformNote[], locations: PublicLocation[], regions: PublicRegion[]) {
  if (note.relatedNoteSlugs?.length) return selectRelatedNotes(note.relatedNoteSlugs, notes, note.slug)
  const ids = noteRegionIds(note, locations, regions)
  const tags = new Set(note.tags.map(t => t.trim().toLowerCase()))
  // Same explicitly identified locality plus shared tags; no global fallback.
  return notes.filter(other => other.published && other.slug !== note.slug &&
    other.tags.some(t => tags.has(t.trim().toLowerCase())) &&
    [...noteRegionIds(other, locations, regions)].some(id => ids.has(id))).slice(0, 4)
}
