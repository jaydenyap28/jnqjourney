import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const cwd = process.cwd()

// Load env variables manually from .env.local
const envPath = path.join(cwd, '.env.local')
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, serviceKey)
const bucketName = 'location-images'

async function run() {
  const jsonPath = path.join(cwd, 'scratch/orphan-facebook.json')
  if (!fs.existsSync(jsonPath)) {
    console.error('Cannot find scratch/orphan-facebook.json. Please run the scan script first.')
    process.exit(1)
  }

  const orphans = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  if (!orphans || !orphans.length) {
    console.log('No orphans found in the json file.')
    return
  }

  const totalFiles = orphans.length
  console.log(`Ready to delete ${totalFiles} orphan images from bucket '${bucketName}'...`)

  const BATCH_SIZE = 50
  let totalDeleted = 0
  let errors = []

  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = orphans.slice(i, i + BATCH_SIZE).map(o => o.fullPath)
    
    console.log(`Deleting batch ${i/BATCH_SIZE + 1} (${batch.length} files)...`)
    
    const { data, error } = await supabase.storage.from(bucketName).remove(batch)
    
    if (error) {
      console.error(`Error deleting batch:`, error)
      errors.push(error)
    } else {
      totalDeleted += data.length
    }
  }

  console.log(`\n============================`)
  console.log(`Cleanup complete!`)
  console.log(`Successfully deleted ${totalDeleted} out of ${totalFiles} target files.`)
  if (errors.length > 0) {
    console.log(`Encountered ${errors.length} batch errors. See logs above.`)
  }
}

run()
