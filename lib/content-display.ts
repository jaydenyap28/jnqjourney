import type { TravelGuide } from '@/lib/guides'

function containsCjk(value?: string | null) {
  return /[\u3400-\u9fff]/.test(String(value || ''))
}

function normalizeComparableText(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function looksLikeStructuredOpeningHours(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        ('open' in parsed || 'close' in parsed || 'closedDays' in parsed || 'is24Hours' in parsed)
    )
  } catch {
    return false
  }
}

function looksLikeOpeningHoursText(value: string, openingHours?: string | null) {
  const trimmed = value.trim()
  if (!trimmed) return false

  if (looksLikeStructuredOpeningHours(trimmed)) return true

  const normalizedValue = normalizeComparableText(trimmed)
  const normalizedHours = normalizeComparableText(openingHours)

  if (normalizedHours && normalizedValue === normalizedHours) return true

  let signalCount = 0

  if (/(opening hours|business hours|daily hours|open 24 hours|closed on)/i.test(trimmed)) {
    signalCount += 1
  }

  if (/\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(trimmed) && /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(trimmed)) {
    signalCount += 1
  }

  if (/\b\d{1,2}:\d{2}\s*[-~to]{1,3}\s*\d{1,2}:\d{2}\b/i.test(trimmed)) {
    signalCount += 1
  }

  if (/^\s*(sun|mon|tue|wed|thu|fri|sat)\s*[:?-]/im.test(trimmed)) {
    signalCount += 1
  }

  return signalCount >= 2 && trimmed.length <= 500
}

export function getSpotDescription(location: {
  description?: string | null
  review?: string | null
  opening_hours?: string | null
}) {
  const candidates = [location.description, location.review]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    if (!looksLikeOpeningHoursText(candidate, location.opening_hours)) {
      return candidate
    }
  }

  return ''
}

export function getDisplayTitle(name: string, nameCn?: string | null) {
  const english = String(name || '').trim()
  const chinese = String(nameCn || '').trim()

  if (english && chinese && english !== chinese) {
    return { primary: english, secondary: chinese }
  }

  return { primary: english || chinese, secondary: '' }
}

export function getGuideDisplayPair(guide: Pick<TravelGuide, 'shortTitle' | 'title'>) {
  const shortTitle = String(guide.shortTitle || '').trim()
  const title = String(guide.title || '').trim()

  if (!shortTitle && !title) return { primary: '', secondary: '' }
  if (!shortTitle) return { primary: title, secondary: '' }
  if (!title) return { primary: shortTitle, secondary: '' }
  if (shortTitle === title) return { primary: shortTitle, secondary: '' }

  const shortIsCjk = containsCjk(shortTitle)
  const titleIsCjk = containsCjk(title)

  if (titleIsCjk && !shortIsCjk) {
    return { primary: title, secondary: shortTitle }
  }

  if (shortIsCjk && !titleIsCjk) {
    return { primary: shortTitle, secondary: title }
  }

  return { primary: shortTitle, secondary: title }
}
