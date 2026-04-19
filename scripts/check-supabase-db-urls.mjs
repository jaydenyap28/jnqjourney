import { createClient } from '@supabase/supabase-js'

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supaUrl, supaKey)

async function run() {
  const { data, error } = await supabase.from('locations').select('image_url, images')
  if (error) throw error

  const supabaseUrls = []

  for (const row of data) {
    if (row.image_url && row.image_url.includes('supabase.co')) {
      supabaseUrls.push(row.image_url)
    }
    if (row.images && Array.isArray(row.images)) {
      for (const url of row.images) {
        if (url.includes('supabase.co')) {
          supabaseUrls.push(url)
        }
      }
    }
  }

  console.log(`Found ${supabaseUrls.length} Supabase URLs`)
  if (supabaseUrls.length > 0) {
    console.log('Sample URLs:')
    supabaseUrls.slice(0, 5).forEach(u => console.log(' - ' + u))
  }
}
run()
