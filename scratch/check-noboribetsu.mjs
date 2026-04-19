import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal(envPath) {
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, image_url, images')
    .ilike('name', '%Noboribetsu Jigokudani%')

  if (error) throw error;
  
  console.log(`Found ${locations.length} matching locations.`);
  for (const loc of locations) {
    console.log(`\nLocation: ${loc.name} (ID: ${loc.id})`)
    console.log(`Cover URL: ${loc.image_url}`)
    console.log(`Gallery Images (${loc.images?.length || 0}):`)
    if (loc.images) {
      loc.images.forEach((img, i) => console.log(`  [${i}]: ${img}`))
      
      // Test the first gallery image
      if (loc.images.length > 0) {
        console.log(`Testing first image URL...`)
        try {
          const res = await fetch(loc.images[0].split('#')[0])
          console.log(`  Status: ${res.status}`)
        } catch (err) {
          console.log(`  Fetch error: ${err.message}`)
        }
      }
    }
  }
}

main().catch(console.error);
