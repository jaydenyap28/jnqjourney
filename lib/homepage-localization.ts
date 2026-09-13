import { applyLocalization, localizationRecord, type LocalizationSnapshot } from './localization.ts'
import type { LongformNote } from './notes.ts'
import type { TravelPackage } from './server/travel-packages.ts'

// Card text uses page records in the existing authoritative localization snapshot.
// Canonical records, package facts and the Chinese renderer remain untouched.
export function localizeHomepageNote(note: LongformNote, snapshot: LocalizationSnapshot) {
  const source = { title: note.title, shortTitle: note.shortTitle, tagline: note.tagline, summary: note.summary }
  const record = localizationRecord(snapshot, 'page', `notes/${note.slug}`)
  return { ...note, ...applyLocalization(source, record).value }
}

export function packageCardSource(item: TravelPackage) {
  return {
    title: item.title_en || item.title_zh,
    destination: item.destination || '',
    duration: item.duration || '',
    shortSummary: item.short_description || '',
    priceDisplay: item.price_display || '',
    whatsappMessage: item.whatsapp_message || '',
  }
}

export function localizeHomepagePackage(item: TravelPackage, snapshot: LocalizationSnapshot) {
  const source = packageCardSource(item)
  const record = localizationRecord(snapshot, 'page', `packages/${item.slug}`)
  const { value } = applyLocalization(source, record)
  return { ...item, title_en: value.title, destination: value.destination, duration: value.duration,
    short_description: value.shortSummary, price_display: value.priceDisplay, whatsapp_message: value.whatsappMessage }
}
