import type { TravelGuide } from './guides'
import type { LongformNote } from './notes'
import { resolveGuideMedia } from './guide-media.ts'

export type HomeGuideCard = Pick<TravelGuide, 'slug' | 'title' | 'shortTitle' | 'duration' | 'travelStyle' | 'tripStartDate' | 'budget' | 'tagline' | 'summary' | 'coverAccent'> & {
  coverImage?: string
  route: Array<{ name: string }>
}
export type HomeNoteCard = Pick<LongformNote, 'slug' | 'title' | 'shortTitle' | 'tagline' | 'summary' | 'kicker' | 'coverImage' | 'coverAccent' | 'published'>

// Resolve media first on the server, then send only fields the home cards use.
export function toHomeGuideCard(guide: TravelGuide): HomeGuideCard {
  const { slug, title, shortTitle, duration, travelStyle, tripStartDate, budget, tagline, summary, coverAccent } = guide
  return { slug, title, shortTitle, duration, travelStyle, tripStartDate, budget, tagline, summary, coverAccent,
    coverImage: resolveGuideMedia(guide).coverImage, route: guide.route.slice(0, 6).map(({ name }) => ({ name })) }
}

export function toHomeNoteCard(note: LongformNote): HomeNoteCard {
  const { slug, title, shortTitle, tagline, summary, kicker, coverImage, coverAccent, published } = note
  return { slug, title, shortTitle, tagline, summary, kicker, coverImage, coverAccent, published }
}
