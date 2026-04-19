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
  
  let repairedCount = 0;
  let unrepairableCount = 0;

  for (const loc of locations) {
    if (!loc.image_url || !loc.image_url.includes('/cover/')) continue;
    
    // Parse the path after "public/location-images/"
    const match = loc.image_url.match(/public\/location-images\/(cover\/.*)$/);
    if (!match) continue;
    
    // It's like "cover/2026-04-02/filename.webp"
    const fullPath = match[1].split('#')[0]; // remove #focus
    const parts = fullPath.split('/');
    const folderPath = parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];

    // Check directly in bucket bypasses CDN
    const { data: files, error: listErr } = await supabase.storage.from('location-images').list(folderPath, {
      search: fileName
    });
    
    const exists = files && files.some(f => f.name === fileName);
    
    if (!exists) {
      console.log(`❌ 发现丢失封面: ${loc.name} -> ${fileName}`);
      
      const hasGallery = loc.images && Array.isArray(loc.images) && loc.images.length > 0;
      if (hasGallery) {
         let firstValidImage = loc.images[0];
         const newImageUrl = firstValidImage.includes('#focus=') ? firstValidImage : `${firstValidImage}#focus=50,50`;
         
         const { error: updateErr } = await supabase.from('locations').update({ image_url: newImageUrl }).eq('id', loc.id);
         if (updateErr) {
           console.log(`   ⚠️ 更新失败: ${updateErr.message}`);
         } else {
           console.log(`   ✅ 修复成功 -> (使用图集第1张补救)`);
           repairedCount++;
         }
      } else {
         console.log(`   🚨 无法修复 (该景点没有图集)`);
         unrepairableCount++;
      }
    }
  }
  
  console.log(`\n=================== 修复完成 ===================`);
  console.log(`✅ 成功用图集兜底替换失效封面: ${repairedCount} 个`);
  console.log(`🚨 彻底无图无法自动修复: ${unrepairableCount} 个`);
}

main().catch(console.error);
