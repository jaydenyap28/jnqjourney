import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

const PACKAGE_SELECT = 'id,slug,title_zh,title_en,destination,region_id,duration,short_description,full_description,cover_image,hero_image,hero_image_mobile,hero_image_contains_text,gallery,video_url,highlights,suitable_for,itinerary_days,included_items,excluded_items,notes,price_display,price_note,whatsapp_message,source_code,status,featured,sort_order,seo_title,seo_description,canonical_url,related_location_ids,related_guide_slugs,related_note_slugs,affiliate_link_ids,created_at,updated_at,published_at'
const PACKAGE_OPTION_SELECT = 'id,package_id,slug,name_zh,name_en,duration,accommodation_name,accommodation_type,village_name,short_description,full_description,cover_image,hero_image,hero_image_mobile,hero_image_contains_text,highlights,suitable_for,itinerary_days,price_from,price_currency,price_unit,price_display,price_note,price_rows,included_items,excluded_items,notes,validity_label,valid_until,brochure_image,gallery,whatsapp_message,source_code,featured,sort_order,status,seo_title,seo_description,canonical_url,related_location_ids,created_at,updated_at'

export interface TravelPackageDay {
  title?: string
  summary?: string
  items?: string[]
}

export interface TravelPackageImage {
  url: string
  alt?: string
  caption?: string
  sort_order?: number
}

export type TravelPackageOptionStatus = 'active' | 'inactive' | 'archived'

export interface TravelPackageOption {
  id: number
  package_id: number
  slug: string
  name_zh: string
  name_en?: string | null
  duration?: string | null
  accommodation_name: string
  accommodation_type?: string | null
  village_name?: string | null
  short_description?: string | null
  full_description?: string | null
  cover_image?: string | null
  hero_image?: string | null
  hero_image_mobile?: string | null
  hero_image_contains_text?: boolean
  highlights?: string[] | null
  suitable_for?: string[] | null
  itinerary_days?: TravelPackageDay[] | null
  price_from?: number | null
  price_currency?: string | null
  price_unit: 'person' | 'room' | 'package' | 'group'
  price_display: string
  price_note?: string | null
  price_rows?: Array<{ label: string; price: string }> | null
  included_items?: string[] | null
  excluded_items?: string[] | null
  notes?: string[] | null
  validity_label?: string | null
  valid_until?: string | null
  brochure_image?: TravelPackageImage | null
  gallery?: TravelPackageImage[] | null
  whatsapp_message?: string | null
  source_code?: string | null
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  related_location_ids?: number[] | null
  featured?: boolean
  sort_order?: number
  status: TravelPackageOptionStatus
  created_at?: string
  updated_at?: string
}


export function packageFromOption(parent: TravelPackage, option: TravelPackageOption): TravelPackage {
  const optionGallery = option.gallery || []
  return {
    ...parent,
    slug: `${parent.slug}-${option.slug}`,
    title_zh: option.name_zh,
    title_en: option.name_en || null,
    duration: option.duration || parent.duration || null,
    short_description: option.short_description || parent.short_description || null,
    full_description: option.full_description || parent.full_description || null,
    cover_image: option.cover_image || optionGallery[0]?.url || parent.cover_image || null,
    hero_image: option.hero_image || parent.hero_image || null,
    hero_image_mobile: option.hero_image_mobile || parent.hero_image_mobile || null,
    hero_image_contains_text: Boolean(option.hero_image_contains_text || parent.hero_image_contains_text),
    gallery: optionGallery,
    highlights: option.highlights || [],
    suitable_for: option.suitable_for || [],
    itinerary_days: option.itinerary_days || [],
    included_items: option.included_items || [],
    excluded_items: option.excluded_items || [],
    notes: option.notes || [],
    price_display: option.price_display || parent.price_display || null,
    price_note: option.price_note || parent.price_note || null,
    whatsapp_message: option.whatsapp_message || parent.whatsapp_message || null,
    source_code: option.source_code || parent.source_code || null,
    seo_title: option.seo_title || null,
    seo_description: option.seo_description || null,
    canonical_url: option.canonical_url || `/packages/${parent.slug}/${option.slug}`,
    related_location_ids: option.related_location_ids?.length ? option.related_location_ids : parent.related_location_ids,
    sort_order: option.sort_order ?? parent.sort_order,
  }
}

export interface TravelPackage {
  id: number
  slug: string
  title_zh: string
  title_en?: string | null
  destination?: string | null
  region_id?: number | null
  duration?: string | null
  short_description?: string | null
  full_description?: string | null
  cover_image?: string | null
  hero_image?: string | null
  hero_image_mobile?: string | null
  hero_image_contains_text?: boolean
  gallery?: TravelPackageImage[] | null
  video_url?: string | null
  highlights?: string[] | null
  suitable_for?: string[] | null
  itinerary_days?: TravelPackageDay[] | null
  included_items?: string[] | null
  excluded_items?: string[] | null
  notes?: string[] | null
  price_display?: string | null
  price_note?: string | null
  whatsapp_message?: string | null
  source_code?: string | null
  status: 'draft' | 'published' | 'archived'
  featured?: boolean
  sort_order?: number
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  related_location_ids?: number[] | null
  related_guide_slugs?: string[] | null
  related_note_slugs?: string[] | null
  affiliate_link_ids?: number[] | null
  created_at?: string
  updated_at?: string
  published_at?: string | null
}

function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Pages Router build/ISR uses this query directly; App Router keeps the cache below.
export async function readPublishedPackagesUncached() {
  const supabase = createServerClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('travel_packages')
    .select(PACKAGE_SELECT)
    .eq('status', 'published')
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
  if (error) {
    if (!error.message.includes('travel_packages')) console.error('[travel-packages]', error.message)
    return []
  }
  return (data || []) as TravelPackage[]
}

export const readPublishedPackages = unstable_cache(readPublishedPackagesUncached, ['published-travel-packages'], {
  revalidate: 3600,
  tags: ['travel-packages'],
})

export async function readPublishedPackage(slug: string) {
  const supabase = createServerClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('travel_packages')
    .select(PACKAGE_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) {
    if (!error.message.includes('travel_packages')) console.error('[travel-package]', error.message)
    return null
  }
  return data as TravelPackage | null
}

export async function readPublishedPackageOptions(packageId: number) {
  const supabase = createServerClient()
  if (!supabase || !Number.isInteger(packageId) || packageId <= 0) return []
  const { data, error } = await supabase
    .from('travel_package_options')
    .select(PACKAGE_OPTION_SELECT)
    .eq('package_id', packageId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
  if (error) {
    if (!error.message.includes('travel_package_options')) console.error('[travel-package-options]', error.message)
    return []
  }
  return (data || []) as TravelPackageOption[]
}


export async function readPublishedPackageOption(packageId: number, optionSlug: string) {
  const supabase = createServerClient()
  if (!supabase || !Number.isInteger(packageId) || packageId <= 0 || !optionSlug) return null
  const { data, error } = await supabase
    .from('travel_package_options')
    .select(PACKAGE_OPTION_SELECT)
    .eq('package_id', packageId)
    .eq('slug', optionSlug)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    if (!error.message.includes('travel_package_options')) console.error('[travel-package-option]', error.message)
    return null
  }
  return data as TravelPackageOption | null
}
