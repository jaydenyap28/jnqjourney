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
  console.log('Fetching database locations...')
  const { data: locations, error: dbErr } = await supabase.from('locations').select('id, image_url, images, name')
  if (dbErr) {
    console.error('DB Error:', dbErr)
    return
  }

  // Collect all known paths. We should extract the path relative to the bucket.
  const knownPaths = new Set()
  
  function addPathFromUrl(url) {
    if (!url || !url.includes(bucketName)) return
    try {
      url = url.split('#')[0] // remove hash
      // The public URL looks like: https://[domain]/storage/v1/object/public/location-images/path/to/file.jpg
      const searchStr = `/object/public/${bucketName}/`
      const idx = url.indexOf(searchStr)
      if (idx !== -1) {
        const filePath = url.slice(idx + searchStr.length)
        knownPaths.add(filePath)
      }
    } catch (_) {}
  }

  for (const loc of locations) {
    addPathFromUrl(loc.image_url)
    if (loc.images && Array.isArray(loc.images)) {
      loc.images.forEach(addPathFromUrl)
    }
  }

  console.log(`Found ${knownPaths.size} unique Supabase files referenced in DB`)

  console.log(`Listing files in bucket '${bucketName}', folder 'imported/facebook'...`)
  
  // Recursively fetch files from storage
  async function listAllFiles(folderPath) {
    let allFiles = []
    const { data: files, error } = await supabase.storage.from(bucketName).list(folderPath, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
       console.error(`Error listing ${folderPath}:`, error)
       return []
    }

    for (const item of files) {
      if (item.name === '.emptyFolderPlaceholder') continue
      // If it doesn't have metadata, it's a folder (in older supabase).
      // Or we can check if it has a file size / mimetype. Sometimes id is null for folders.
      if (!item.id || item.metadata === null) {
        const subFiles = await listAllFiles(folderPath ? `${folderPath}/${item.name}` : item.name)
        allFiles.push(...subFiles)
      } else {
        const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
        allFiles.push({ ...item, fullPath })
      }
    }
    return allFiles
  }

  const fbFiles = await listAllFiles('')
  console.log(`Found ${fbFiles.length} files in ALL folders`)

  const orphans = []
  let orphanSize = 0

  for (const f of fbFiles) {
    if (!knownPaths.has(f.fullPath)) {
      orphans.push(f)
      orphanSize += f.metadata?.size || 0
    }
  }

  // Sort orphans by size descending
  orphans.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0))

  console.log(`\n============================`)
  console.log(`Found ${orphans.length} orphan files!`)
  console.log(`Total size: ${(orphanSize / 1024 / 1024).toFixed(2)} MB`)
  
  if (orphans.length > 0) {
    console.log(`\nTop 10 largest orphan files:`)
    for (const o of orphans.slice(0, 10)) {
      console.log(` - ${o.fullPath} (${((o.metadata?.size || 0) / 1024 / 1024).toFixed(2)} MB)`)
    }
  }

  // Also check top-level large images that are orphans? Let's just limit to imported/facebook as requested first.

  fs.writeFileSync(path.join(cwd, 'scratch/orphan-facebook.json'), JSON.stringify(orphans, null, 2))
  console.log(`\nSaved full list of orphans to scratch/orphan-facebook.json`)
}

run()
