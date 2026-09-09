import { localizedPath, type Locale } from './locale.ts'
import type { TranslationStatus } from './localization.ts'

export function localizedAlternates(path: string, locale: Locale, status: TranslationStatus) {
  const zh = localizedPath(path, 'zh')
  const en = localizedPath(path, 'en')
  return {
    canonical: locale === 'en' ? en : zh,
    ...(status === 'complete' ? { languages: { zh, en, 'x-default': zh } } : {}),
  }
}

export function localizedRobots(locale: Locale, status: TranslationStatus) {
  return { index: locale === 'zh' || status === 'complete', follow: true }
}
