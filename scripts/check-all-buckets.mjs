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

async function getAllFilesFromBucket(bucketName) {
  let allFiles = [];
  let offset = 0;
  const limit = 1000;
  
  try {
    while (true) {
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .list('', {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        if (error.message.includes('not found')) {
          return [];
        }
        console.error(`Error listing bucket ${bucketName}:`, error.message);
        return [];
      }
      
      if (!data || data.length === 0) break;
      
      allFiles.push(...data);
      
      if (data.length < limit) break;
      
      offset += limit;
    }
  } catch (err) {
    console.error(`Error with bucket ${bucketName}:`, err);
    return [];
  }
  
  return allFiles;
}

async function main() {
  console.log('正在检查所有 Storage bucket...\n');
  
  const bucketsToCheck = [
    'cover', 'places', 'galleries', 'location-images', 
    'location_images', 'public', 'assets', 'images'
  ];
  
  let allFiles = [];
  
  for (const bucketName of bucketsToCheck) {
    console.log(`检查 bucket: ${bucketName}...`);
    const files = await getAllFilesFromBucket(bucketName);
    if (files.length > 0) {
      console.log(`  找到 ${files.length} 个文件`);
      allFiles = allFiles.concat(
        files.map(f => ({ ...f, bucket: bucketName }))
      );
    }
  }
  
  console.log(`\n总计找到 ${allFiles.length} 个文件\n`);
  
  const imageFiles = allFiles.filter(f => {
    if (!f.metadata) return false;
    return f.metadata.mimetype?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$/i.test(f.name);
  });
  
  console.log(`其中 ${imageFiles.length} 个是图片文件\n`);
  
  const totalSizeBytes = imageFiles.reduce((sum, f) => sum + (f.metadata?.size || 0), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`图片总大小: ${totalSizeMB} MB`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const largeImages = imageFiles
    .filter(f => f.metadata && f.metadata.size > 100 * 1024) // > 100KB
    .map(f => ({
      bucket: f.bucket,
      name: f.name,
      sizeBytes: f.metadata.size,
      sizeMB: (f.metadata.size / (1024 * 1024)).toFixed(2),
      mimetype: f.metadata.mimetype
    }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TOP 50 大图片');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  largeImages.slice(0, 50).forEach((img, i) => {
    console.log(`${i + 1}. [${img.sizeMB} MB] ${img.bucket}/${img.name}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`共 ${largeImages.length} 张图片 >100KB`);
}

main().catch(console.error);
