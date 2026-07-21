import { createClient } from '@supabase/supabase-js'

import HomePageClient from '@/components/HomePageClient'
import { readGuides } from '@/lib/server/guides-store'
import { readPublishedNotes } from '@/lib/server/notes-store'
import { readPublishedPackages } from '@/lib/server/travel-packages'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function createPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) return null

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function fetchHomeData() {
  const supabase = createPublicSupabaseClient()
  if (!supabase) {
    return { locations: [], regions: [], error: 'Public data configuration is unavailable.' }
  }

  const [locationsResult, regionsResult] = await Promise.all([
    supabase
      .from('locations')
      .select('*, regions:region_id(id,name,name_cn,country,description,image_url,code,parent_id)')
      .eq('status', 'active')
      .order('id', { ascending: false }),
    supabase
      .from('regions')
      .select('id, name, name_cn, country, description, image_url, code, parent_id')
      .order('id', { ascending: true }),
  ])

  const queryError = locationsResult.error?.message || regionsResult.error?.message || null
  if (queryError) console.error('[home-data]', queryError)

  return {
    locations: queryError ? [] : locationsResult.data || [],
    regions: queryError ? [] : regionsResult.data || [],
    error: queryError ? 'Unable to load travel spots right now.' : null,
  }
}

export default async function Home() {
  const [{ locations, regions, error }, guides, notes, packages] = await Promise.all([
    fetchHomeData(),
    readGuides(),
    readPublishedNotes(),
    readPublishedPackages(),
  ])

  return (
    <HomePageClient
      initialGuides={guides.slice(0, 6)}
      initialLocations={locations}
      initialNotes={notes}
      initialRegions={regions}
      initialLoadError={error}
      initialPackages={packages.slice(0, 3)}
    />
  )
}
