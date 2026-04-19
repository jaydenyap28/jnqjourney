import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env.local')
const raw = fs.readFileSync(envPath, 'utf8')
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  const key = trimmed.slice(0, eqIdx).trim()
  let value = trimmed.slice(eqIdx + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, serviceKey)

async function run() {
  const { data, error } = await supabase.from('locations').select('id, name, image_url, images').not('images', 'is', null).limit(10)
  if (error) {
    console.error(error)
    return
  }
  console.log(JSON.stringify(data, null, 2))
}
run()
