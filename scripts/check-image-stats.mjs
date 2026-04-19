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

  const { data: locations, error } = await supabase.from('locations').select('id, name, image_url, images')
  if (error) throw error;
  
  let nullCovers = 0;
  let emptyCovers = 0;
  let ibbCovers = 0;
  let supabaseCovers = 0;
  let fbCovers = 0;
  let otherCovers = 0;

  for (const loc of locations) {
    if (loc.image_url === null) { nullCovers++; continue; }
    if (loc.image_url.trim() === '') { emptyCovers++; continue; }
    if (loc.image_url.includes('ibb.co')) ibbCovers++;
    else if (loc.image_url.includes('.supabase.co')) supabaseCovers++;
    else if (loc.image_url.includes('fbcdn.net')) fbCovers++;
    else otherCovers++;
  }

  console.log(`Total: ${locations.length}`);
  console.log(`Null: ${nullCovers}, Empty: ${emptyCovers}`);
  console.log(`Supabase: ${supabaseCovers}`);
  console.log(`ImgBB: ${ibbCovers}`);
  console.log(`FB: ${fbCovers}`);
  console.log(`Other: ${otherCovers}`);
  
  // Also check broken IBB links (HTML page instead of image)
  const ibbUrls = locations.filter(l => l.image_url && l.image_url.includes('ibb.co') && !l.image_url.includes('i.ibb.co'));
  console.log(`\nIBB non-direct links: ${ibbUrls.length}`);
  if (ibbUrls.length > 0) {
    console.log(`Sample: ${ibbUrls[0].image_url}`);
  }
}

main().catch(console.error);
