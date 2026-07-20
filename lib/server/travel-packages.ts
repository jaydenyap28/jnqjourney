import { createClient } from '@supabase/supabase-js'

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

export async function readPublishedPackages() {
  const supabase = createServerClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('travel_packages')
    .select('*')
    .eq('status', 'published')
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
  if (error) {
    if (!error.message.includes('travel_packages')) console.error('[travel-packages]', error.message)
    return []
  }
  return (data || []) as TravelPackage[]
}

export async function readPublishedPackage(slug: string) {
  const supabase = createServerClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('travel_packages')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) {
    if (!error.message.includes('travel_packages')) console.error('[travel-package]', error.message)
    return null
  }
  return data as TravelPackage | null
}
