import type { TravelGuide } from './guides.ts'
import type { LongformNote } from './notes.ts'
import type { PublicLocation, PublicRegion } from './public-data.ts'
import { guideRouteSpotIds } from './guide-route-spot-ids.ts'
import { noteRegionIds, selectNoteSpotIds, relatedNotesForNote } from './content-relations.ts'

export type PublicationKind = 'spot' | 'guide' | 'note' | 'price' | 'widget' | 'affiliate'
export interface PublicationChange {
  kind: PublicationKind
  ids?: number[]
  slugs?: string[]
  previousSlugs?: string[]
  widgetIds?: string[]
  priceSource?: 'highlights' | 'trip-cost'
  /** Carry an already computed old dependency scope across a failed refresh. */
  previousPaths?: string[]
  previousEnglishPaths?: string[]
}
export interface PublicationCatalog {
  locations: PublicLocation[]
  regions: PublicRegion[]
  guides: TravelGuide[]
  notes: LongformNote[]
  /** Old identities/relationships are retained for deletes, moves and renames. */
  previousLocations?: PublicLocation[]
  previousGuides?: TravelGuide[]
  previousNotes?: LongformNote[]
  relatedNoteSlugsBySpot?: Record<string, string[]>
  englishVersions?: Record<string, string>
}
export interface PublicationPlan { tags: string[]; paths: string[]; englishPaths: string[] }

export function validPublicationPath(value: string) {
  return /^\/(?:en(?:\/(?:spot|guide|notes|region)\/[\p{L}\p{N}_-]+|\/(?:guide|notes|region|search))?|(?:spot|guide|notes|region)\/[\p{L}\p{N}_-]+|(?:guide|notes|region|search)|api\/(?:locations|guides|notes|affiliate-links|spots\/[\p{L}\p{N}_-]+)|sitemap\.xml)?$/u.test(value)
}

export function planPublication(change: PublicationChange, catalog: PublicationCatalog): PublicationPlan {
  const tags = new Set<string>(), paths = new Set<string>(), english = new Set<string>()
  for (const route of change.previousPaths || []) { if (!validPublicationPath(route)) throw new Error('Invalid previous public identity'); paths.add(route) }
  for (const route of change.previousEnglishPaths || []) { if (!route.startsWith('/en') || !validPublicationPath(route)) throw new Error('Invalid previous English identity'); english.add(route) }
  const add = (route: string, both = true) => { if (!validPublicationPath(route)) throw new Error('Invalid public identity'); paths.add(route); if (both && !route.startsWith('/api/') && route !== '/sitemap.xml') english.add(route === '/' ? '/en' : `/en${route}`) }
  const locations = [...(catalog.previousLocations || []), ...catalog.locations]
  const guides = [...(catalog.previousGuides || []), ...catalog.guides]
  const notes = [...(catalog.previousNotes || []), ...catalog.notes]
  const ids = new Set(change.ids || []), slugs = new Set([...(change.slugs || []), ...(change.previousSlugs || [])])
  const own = (type: 'spot' | 'guide' | 'notes', slug: string) => add(`/${type}/${slug}`)
  const guideIds = (guide: TravelGuide) => new Set([...guideRouteSpotIds(guide), ...(guide.attractions || []).filter(a => a.enabled !== false).flatMap(a => a.spotId ? [a.spotId] : []),
    ...(guide.accommodationStays || []).map(a => a.accommodationId), ...(guide.itinerarySegments || []).flatMap(s => (s.accommodationStays || []).map(a => a.accommodationId))])
  const regionIds = new Set<number>()
  const addRegions = (values: Iterable<number>) => { for (const id of values) regionIds.add(id) }
  const guidePaths = (guide: TravelGuide) => { own('guide', guide.slug); for (const alias of guide.aliases || []) own('guide', alias) }
  const notePaths = (note: LongformNote) => { own('notes', note.slug); for (const alias of note.aliases || []) own('notes', alias) }

  if (change.kind === 'spot') {
    for (const tag of ['public-data', 'public-locations', 'bilingual:locations.json']) tags.add(tag)
    if (catalog.previousLocations && catalog.previousLocations.map(l=>l.slug).sort().join('\n') !== catalog.locations.map(l=>l.slug).sort().join('\n')) tags.add('public-spots')
    add('/'); add('/search'); add('/region'); add('/api/locations', false); add('/sitemap.xml', false)
    for (const id of ids) { tags.add(`public-spot:spot-${id}`); own('spot', `spot-${id}`) }
    for (const slug of slugs) own('spot', slug)
    const affected = locations.filter(l => ids.has(l.id))
    addRegions(affected.flatMap(l => l.region ? [l.region.id] : []))
    for (const location of affected) { own('spot', location.slug); tags.add(`public-spot:${location.slug}`); tags.add(`bilingual:spots/${location.slug}.json`) }
    // Neighbour cards and distance ordering use same-region summaries.
    for (const location of locations.filter(l => l.region && regionIds.has(l.region.id))) own('spot', location.slug)
    for (const guide of guides.filter(g => [...guideIds(g)].some(id => ids.has(id)))) guidePaths(guide)
    for (const note of notes.filter(n => selectNoteSpotIds(n, locations, catalog.regions).some(id => ids.has(id)))) notePaths(note)
  } else if (change.kind === 'guide' || change.kind === 'price') {
    if (change.kind === 'guide') {
      tags.add('guides'); tags.add('bilingual:guides.json'); add('/'); add('/guide'); add('/search'); add('/api/guides', false); add('/sitemap.xml', false)
    } else {
      if(change.priceSource !== 'trip-cost') tags.add('guide-price-highlights')
      if(change.priceSource !== 'highlights'){tags.add('guide-trip-costs');tags.add('bilingual:guide-trip-costs.json')}
      add('/api/guides', false)
    }
    const changed = guides.filter(g => slugs.has(g.slug) || g.aliases?.some(s => slugs.has(s)))
    for (const slug of slugs) { own('guide', slug); if(change.kind==='guide')tags.add(`guide:${slug}`); if(change.priceSource!=='highlights')tags.add(`guide-trip-cost:${slug}`) }
    for (const guide of changed) {
      guidePaths(guide)
      if (change.kind === 'guide') {
        const referenced = guideIds(guide)
        for (const location of locations.filter(l => referenced.has(l.id) || [...guide.route.map(r => r.mapSpotName || r.name), ...(guide.featuredSpotNames || [])].some(name => name && l.name.includes(name)))) {
          own('spot', location.slug); if (location.region) regionIds.add(location.region.id)
        }
        // Region template also matches explicit region text in Guide titles.
        addRegions(catalog.regions.filter(r => [r.name, r.name.split(' / ')[0]].some(name => name && guide.title.toLowerCase().includes(name.toLowerCase()))).map(r => r.id))
      }
    }
    if (change.kind === 'guide') {
      // Related Guides use the first three other records, not a region guess.
      for (const guide of guides) if (guides.filter(g => g.slug !== guide.slug).slice(0, 3).some(g => slugs.has(g.slug) || g.aliases?.some(s => slugs.has(s)))) guidePaths(guide)
    }
  } else if (change.kind === 'note') {
    tags.add('notes'); tags.add('bilingual:notes.json'); add('/'); add('/notes'); add('/api/notes', false); add('/sitemap.xml', false)
    const changed = notes.filter(n => slugs.has(n.slug) || n.aliases?.some(s => slugs.has(s)))
    for (const slug of slugs) { own('notes', slug); tags.add(`note:${slug}`) }
    for (const note of changed) { notePaths(note); addRegions(noteRegionIds(note, locations, catalog.regions)); for (const alias of note.aliases || []) slugs.add(alias) }
    for (const note of notes) if (relatedNotesForNote(note, notes, locations, catalog.regions).some(n => slugs.has(n.slug))) notePaths(note)
    for (const guide of guides) {
      const routes = [...guide.days, ...(guide.itinerarySegments || []).flatMap(s => [...s.verifiedRoutes, ...(s.referenceRoutes || [])])]
      if (routes.some(r => r.routeItems?.some(i => i.type === 'note' && slugs.has(i.noteSlug)))) guidePaths(guide)
    }
    for (const [id, related] of Object.entries(catalog.relatedNoteSlugsBySpot || {})) if (related.some(slug => slugs.has(slug))) for (const location of locations.filter(l => l.id === Number(id))) own('spot', location.slug)
  } else {
    tags.add(change.kind === 'widget' ? 'klook-widgets' : 'affiliate-links')
    if(change.kind==='affiliate')for(const id of ids)tags.add(`affiliate-link:${id}`)
    if (change.kind === 'affiliate') add('/api/affiliate-links', false)
    for (const slug of slugs) own('notes', slug)
    for (const note of notes) {
      const targeted = slugs.has(note.slug) || note.aliases?.some(slug => slugs.has(slug)) || (change.kind === 'affiliate' ? note.blocks.some(b => b.affiliateIds?.some(id => ids.has(id)))
        : note.blocks.some(b => b.klookWidgetIds?.some(id => change.widgetIds?.includes(id)))
      )
      if (targeted) notePaths(note)
    }
    // English Notes are translation fallback links and contain no widgets or
    // affiliate text, so do not rewrite them for these presentation-only edits.
    english.clear()
  }
  for (let pass = 0; pass < catalog.regions.length; pass++) for (const region of catalog.regions) if (regionIds.has(region.id) && region.parentId) regionIds.add(region.parentId)
  for (const region of catalog.regions.filter(r => regionIds.has(r.id))) add(`/region/${region.slug}`)
  return { tags: [...tags].sort(), paths: [...paths].sort(), englishPaths: [...english].sort() }
}
