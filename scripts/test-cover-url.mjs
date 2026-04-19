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

  const { data: locations, error } = await supabase.from('locations').select('id, name, image_url')
  if (error) throw error;
  
  const covers = locations.filter(l => l.image_url && l.image_url.includes('/cover/'));
  console.log(`There are ${covers.length} cover/ URLs in DB.`);
  
  if (covers.length > 0) {
    const testUrl = covers[0].image_url.split('#')[0];
    console.log(`Testing URL: ${testUrl}`);
    const res = await fetch(testUrl);
    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    const text = await res.text();
    console.log(`Body preview: ${text.slice(0, 100)}`);
  }
}

main().catch(console.error);
