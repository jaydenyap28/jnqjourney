import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const content = readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value;
      }
    }
  } catch (e) {
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function main() {
  console.log('正在获取数据...');
  
  const [locationsResult, storageResult] = await Promise.all([
    supabase.from('locations').select('id, name, name_cn, image_url, images'),
    supabase.storage.from('location-images').list('', { limit: 1000 })
  ]);
  
  const locations = locationsResult.data || [];
  const files = storageResult.data || [];
  
  console.log(`找到 ${locations.length} 个景点，${files.length} 个存储文件\n`);
  
  const imageFiles = files.filter(f => {
    if (!f.metadata) return false;
    return f.metadata.mimetype?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name);
  });
  
  const largeImages = imageFiles
    .filter(f => f.metadata && f.metadata.size > 500 * 1024)
    .map(f => {
      const fileName = f.name.split('/').pop().split('#')[0].split('?')[0];
      let matchedLoc = null;
      
      for (const loc of locations) {
        if (loc.image_url && (loc.image_url.includes(f.name) || loc.image_url.includes(fileName))) {
          matchedLoc = loc;
          break;
        }
        if (loc.images && Array.isArray(loc.images)) {
          for (const img of loc.images) {
            if (img && (img.includes(f.name) || img.includes(fileName))) {
              matchedLoc = loc;
              break;
            }
          }
          if (matchedLoc) break;
        }
      }
      
      return {
        sizeMB: (f.metadata.size / (1024 * 1024)).toFixed(2),
        path: f.name,
        location: matchedLoc
      };
    })
    .sort((a, b) => parseFloat(b.sizeMB) - parseFloat(a.sizeMB));
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TOP 30 大图片列表');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  largeImages.slice(0, 30).forEach((img, i) => {
    console.log(`${i + 1}. [${img.sizeMB} MB]`);
    console.log(`   路径: ${img.path}`);
    if (img.location) {
      console.log(`   景点: ${img.location.name_cn || img.location.name} (ID: ${img.location.id})`);
    } else {
      console.log(`   景点: (未找到匹配)`);
    }
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`总计: ${largeImages.length} 张图片 >500KB`);
  console.log(`匹配到景点: ${largeImages.filter(i => i.location).length} 张`);
}

main().catch(console.error);
