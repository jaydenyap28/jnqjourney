import { spotDescriptionExcerpt } from './spot-description.ts'

export interface SpotImageText { alt_zh?: string; alt_en?: string; caption?: string }
export const SPOT_CONTENT_SELECT = 'publication_status,seo_title_zh,seo_description_zh,seo_title_en,seo_description_en,experience_zh,experience_en,related_note_slugs,image_metadata'
export function isSpotPublished(spot: { publication_status?: string | null }) {
  return spot.publication_status == null || spot.publication_status === 'published'
}
export interface SpotContentFields {
  publication_status?: 'published' | 'draft' | 'hidden' | null
  seo_title_zh?: string | null
  seo_description_zh?: string | null
  seo_title_en?: string | null
  seo_description_en?: string | null
  experience_zh?: string | null
  experience_en?: string | null
  related_note_slugs?: string[] | null
  image_metadata?: Record<string, SpotImageText> | null
  redirect_url?: string | null
  redirect_type?: 301 | 302 | null
}

export const spotContentEnglishFields = ['experience_en', 'seo_title_en', 'seo_description_en'] as const
export type SpotContentEnglishField = typeof spotContentEnglishFields[number]
export type SpotContentChineseSource = Record<'experience_zh' | 'seo_title_zh' | 'seo_description_zh', string>

export function spotContentChineseSource(spot: Pick<SpotContentFields, 'experience_zh' | 'seo_title_zh' | 'seo_description_zh'>): SpotContentChineseSource {
  return {
    experience_zh: String(spot.experience_zh || ''),
    seo_title_zh: String(spot.seo_title_zh || ''),
    seo_description_zh: String(spot.seo_description_zh || ''),
  }
}

export function imageTextKey(url: string) { return url.split('#')[0] }
export function spotImageText(spot: SpotContentFields & { name: string; name_cn?: string | null }, url: string, index: number, locale: 'zh' | 'en') {
  const text = spot.image_metadata?.[imageTextKey(url)]
  return {
    alt: (locale === 'en' ? text?.alt_en : text?.alt_zh)?.trim() || `${locale === 'zh' ? spot.name_cn || spot.name : spot.name} — ${locale === 'zh' ? '照片' : 'photo'} ${index + 1}`,
    caption: text?.caption?.trim() || '',
  }
}

export function spotSeo(spot: SpotContentFields & { name: string; name_cn?: string | null; title?: string; description?: string | null; review?: string | null }, locale: 'zh' | 'en') {
  const clean = (value?: string | null) => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  const name = locale === 'zh' ? spot.name_cn || spot.name : spot.title || spot.name
  return {
    title: clean(spot[`seo_title_${locale}`]) || `${name} | JnQ Journey`,
    description: (clean(spot[`seo_description_${locale}`]) || spotDescriptionExcerpt(spot.description || spot.review) || (locale === 'zh' ? `探索${name}：照片、地址和旅行资讯。JnQ Journey。` : `Explore ${name}: photos, address and travel information from JnQ Journey.`)).slice(0, 160),
  }
}
