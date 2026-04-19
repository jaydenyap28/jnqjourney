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

  const { data: locations, error } = await supabase.from('locations').select('id, name, image_url, images').order('id', { ascending: false })
  if (error) throw error;
  
  let totalMissing = 0;

  // We check image_url first
  for (const loc of locations) {
    if (loc.image_url && loc.image_url.includes('.supabase.co/')) {
      const match = loc.image_url.match(/public\/location-images\/(.*)$/);
      if (match) {
        const fullPath = match[1].split('#')[0].split('?')[0]; 
        const parts = fullPath.split('/');
        const folderPath = parts.slice(0, -1).join('/');
        const fileName = parts[parts.length - 1];

        const { data: files } = await supabase.storage.from('location-images').list(folderPath, { search: fileName });
        const exists = files && files.some(f => f.name === fileName);
        
        if (!exists) {
          console.log(`❌ 发现丢失封面: ID=${loc.id} ${loc.name} -> ${fileName}`);
          totalMissing++;
        }
      }
    }
    
    // Check gallery files too
    if (loc.images && Array.isArray(loc.images)) {
      for (const imgUrl of loc.images) {
        if (imgUrl.includes('.supabase.co/')) {
          const match = imgUrl.match(/public\/location-images\/(.*)$/);
          if (match) {
            const fullPath = match[1].split('#')[0].split('?')[0]; 
            const parts = fullPath.split('/');
            const folderPath = parts.slice(0, -1).join('/');
            const fileName = parts[parts.length - 1];
    
            const { data: files } = await supabase.storage.from('location-images').list(folderPath, { search: fileName });
            const exists = files && files.some(f => f.name === fileName);
            if (!exists) {
              console.log(`❌ 发现丢失图集图片: ID=${loc.id} ${loc.name} -> ${fileName}`);
              totalMissing++;
            }
          }
        }
      }
    }
  }
  
  console.log(`\n=================== 扫描完成 ===================`);
  console.log(`总共发现丢失文件: ${totalMissing} 个`);
}

main().catch(console.error);
