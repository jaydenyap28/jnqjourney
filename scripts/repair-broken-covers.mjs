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

async function checkUrlAccessible(urlStr) {
  if (!urlStr || !urlStr.startsWith('http')) return false;
  if (!urlStr.includes('.supabase.co')) return true; 
  
  const cleanUrl = urlStr.split('#')[0];
  try {
    const res = await fetch(cleanUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
    // If it's 404, 400, etc, it will be !ok.
    // Sometimes object not found returns 200? Let's check headers.
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) return false;
    if (contentType.includes('application/json')) return false; // usually error JSON
    if (contentType.includes('text/html')) return false; // usually error page
    return true;
  } catch (err) {
    return false;
  }
}

async function processBatch(locations, supabase) {
  const promises = locations.map(async (loc) => {
    if (!loc.image_url || !loc.image_url.includes('.supabase.co')) return null;
    
    // Check if it's actually broken
    const isOk = await checkUrlAccessible(loc.image_url);
    if (!isOk) {
       console.log(`❌ 检测到失效封面: ${loc.name} -> ${loc.image_url}`);
       const hasGallery = loc.images && Array.isArray(loc.images) && loc.images.length > 0;
       
       if (hasGallery) {
         let firstValidImage = loc.images[0];
         const newImageUrl = firstValidImage.includes('#focus=') ? firstValidImage : `${firstValidImage}#focus=50,50`;
         
         const { error: updateErr } = await supabase
           .from('locations')
           .update({ image_url: newImageUrl })
           .eq('id', loc.id);
           
         if (updateErr) {
           console.log(`   ⚠️ 更新失败: ${updateErr.message}`);
           return { type: 'failed_update', loc };
         } else {
           console.log(`   ✅ 修复成功 -> ${newImageUrl}`);
           return { type: 'repaired', loc };
         }
       } else {
         console.log(`   🚨 无法修复 (无图集): ${loc.name}`);
         return { type: 'unrepairable', loc };
       }
    }
    return null;
  });
  
  const results = await Promise.allSettled(promises);
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

async function main() {
  const cwd = process.cwd()
  loadEnvLocal(path.join(cwd, '.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) throw new Error('缺少环境变量');

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  console.log('正在获取景点数据...');
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, image_url, images')
    .order('id', { ascending: false });

  if (error) {
    console.error('获取失败', error);
    return;
  }

  console.log(`共获取到 ${locations.length} 个景点，开始排查失效封面 (使用GET和MIME校验)...`);
  
  let repairedCount = 0;
  let unrepairableCount = 0;
  const unrepairableNames = [];
  
  for (let i = 0; i < locations.length; i += 20) {
    const batch = locations.slice(i, i + 20);
    const results = await processBatch(batch, supabase);
    for (const r of results) {
      if (r.type === 'repaired') repairedCount++;
      if (r.type === 'unrepairable') {
        unrepairableCount++;
        unrepairableNames.push(r.loc);
      }
    }
  }

  console.log(`\n=================== 排查与修复完成 ===================`);
  console.log(`✅ 自动匹配图集修复成功: ${repairedCount} 个景点`);
  console.log(`🚨 彻底无图无法自动修复: ${unrepairableCount} 个景点`);
  
  if (unrepairableNames.length > 0) {
    console.log(`\n请后续手动去后台帮以下景点上传图片：`);
    unrepairableNames.forEach(item => {
      console.log(` - ID: ${item.id} | ${item.name}`);
    });
  }
}

main().catch(console.error);
