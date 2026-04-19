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

  const { data: restaurants, error } = await supabase.from('restaurants').select('id, name, image_url').order('id', { ascending: false })
  if (error) {
    console.log("No restaurants table?", error);
    return;
  }
  
  let validCount = 0;
  let brokenCount = 0;
  
  for (const r of restaurants) {
    if (!r.image_url) {
      brokenCount++;
      console.log(`❌ 餐厅: ${r.name} -> URL为空/NULL`);
    } else {
      validCount++;
    }
  }
  
  console.log(`Restaurants Total: ${restaurants.length}`);
  console.log(`Valid covers: ${validCount}`);
  console.log(`Broken/Missing covers: ${brokenCount}`);
}

main().catch(console.error);
