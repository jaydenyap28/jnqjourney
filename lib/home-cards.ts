import type { TravelGuide } from './guides'
import type { LongformNote } from './notes'
import type { TravelPackage } from './server/travel-packages'
import { resolveGuideMedia } from './guide-media'

// Pages Router JSON props reject explicit undefined values; optional card fields
// must be omitted, while null and the original display strings are preserved.
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

export type HomeGuideCard = Pick<TravelGuide, 'slug' | 'shortTitle' | 'title' | 'tagline' | 'summary' | 'duration' | 'budget' | 'travelStyle' | 'coverImage' | 'coverAccent' | 'tripStartDate'> & { route: { name: string }[] }
export function toHomeGuideCard(guide: TravelGuide): HomeGuideCard {
  const { slug, shortTitle, title, tagline, summary, duration, budget, travelStyle, coverAccent, tripStartDate } = guide
  return defined({ slug, shortTitle, title, tagline, summary, duration, budget, travelStyle, coverAccent, tripStartDate,
    coverImage: resolveGuideMedia(guide).coverImage, route: guide.route.slice(0, 6).map(({ name }) => ({ name })) })
}
export type HomeNoteCard = Pick<LongformNote, 'slug' | 'title' | 'shortTitle' | 'tagline' | 'summary' | 'kicker' | 'coverImage' | 'coverAccent'>
export function toHomeNoteCard({ slug, title, shortTitle, tagline, summary, kicker, coverImage, coverAccent }: LongformNote): HomeNoteCard {
  return defined({ slug, title, shortTitle, tagline, summary, kicker, coverImage, coverAccent })
}
export type PackageCard = Pick<TravelPackage, 'id' | 'slug' | 'title_zh' | 'title_en' | 'destination' | 'duration' | 'short_description' | 'cover_image' | 'price_display' | 'source_code' | 'whatsapp_message'>
export function toPackageCard({ id, slug, title_zh, title_en, destination, duration, short_description, cover_image, price_display, source_code, whatsapp_message }: TravelPackage): PackageCard {
  return defined({ id, slug, title_zh, title_en, destination, duration, short_description, cover_image, price_display, source_code, whatsapp_message })
}
