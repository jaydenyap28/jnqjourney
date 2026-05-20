import { getSiteUrl } from './site'
import type { Metadata } from 'next'

const defaultMetaDescription =
  'JnQ Journey by Jayden & Qing shares Asia travel guides, spot maps, food finds, stays, routes, and practical trip notes for Chinese and English-speaking travelers.'

const mojibakePattern = /[�鏅璺绠涓鍦缇钀甯锛俙鈥鎺鐩瀹闄鑷鏃琛敾闂]/

export function cleanSeoText(value?: string | null) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '')
    .trim()
}

export function isLikelyMojibake(value?: string | null) {
  return mojibakePattern.test(String(value || ''))
}

/**
 * Clean up an absolute URL by removing query strings and trailing slashes
 */
export function buildCanonicalUrl(path: string): string {
  const urlObj = new URL(path, getSiteUrl())
  // Remove query params and hash
  urlObj.search = ''
  urlObj.hash = ''
  // Remove trailing slashes
  return urlObj.toString().replace(/\/+$/, '')
}

/**
 * Generate a consistent SEO page title
 */
export function buildPageTitle(title: string, includeBrand = true): string {
  const cleanTitle = cleanSeoText(title)
  return includeBrand ? `${cleanTitle} | JnQ Journey` : cleanTitle
}

/**
 * Generate a safe SEO meta description (truncated to 160 chars)
 */
export function buildMetaDescription(description?: string | null, fallback = ''): string {
  const primary = cleanSeoText(description)
  const secondary = cleanSeoText(fallback)
  const text = primary && !isLikelyMojibake(primary) ? primary : secondary
  if (!text || isLikelyMojibake(text)) return defaultMetaDescription
  return text.slice(0, 160)
}

/**
 * Generate standardized OpenGraph metadata
 */
export function buildOpenGraphData(
  title: string,
  description: string,
  path: string,
  imageUrl?: string | null,
  type: 'website' | 'article' | 'profile' = 'website'
): Metadata['openGraph'] {
  const ogTitle = buildPageTitle(title, false)
  const ogDesc = buildMetaDescription(description)
  const ogUrl = buildCanonicalUrl(path)
  
  const finalImageUrl = imageUrl || 'https://www.jnqjourney.com/icon.png'
  
  return {
    title: ogTitle,
    description: ogDesc,
    url: ogUrl,
    type,
    images: [{ url: finalImageUrl }],
  }
}

/**
 * Generate standardized Twitter Card metadata
 */
export function buildTwitterCardData(
  title: string,
  description: string,
  imageUrl?: string | null
): Metadata['twitter'] {
  const twTitle = buildPageTitle(title, false)
  const twDesc = buildMetaDescription(description)
  const finalImageUrl = imageUrl || 'https://www.jnqjourney.com/icon.png'
  
  return {
    card: 'summary_large_image',
    title: twTitle,
    description: twDesc,
    images: [finalImageUrl],
  }
}
