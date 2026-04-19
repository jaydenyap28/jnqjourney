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
    console.log('Could not load .env.local, using existing env vars');
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing Supabase URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function getAllFilesInBucket(bucketName) {
  let allFiles = [];
  let offset = 0;
  const limit = 1000;
  
  console.log(`正在扫描 bucket: ${bucketName}...`);
  
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
        console.error(`扫描 bucket ${bucketName} 出错:`, error.message);
        break;
      }
      
      if (!data || data.length === 0) break;
      
      allFiles.push(...data);
      
      if (data.length < limit) break;
      
      offset += limit;
    }
  } catch (err) {
    console.error("致命错误:", err);
  }
  
  return allFiles;
}

async function getAllLocations() {
  console.log('正在获取所有景点信息...');
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, name_cn, image_url, images');
  
  if (error) {
    console.error('获取 locations 出错:', error.message);
    return [];
  }
  
  return data || [];
}

function extractFileName(path) {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1].split('#')[0].split('?')[0];
}

async function findLargeImagesWithLocations() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           查找大图片 + 关联景点信息工具                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const [locationFiles, locations] = await Promise.all([
    getAllFilesInBucket('location-images'),
    getAllLocations()
  ]);
  
  console.log(`找到 ${locationFiles.length} 个存储文件`);
  console.log(`找到 ${locations.length} 个景点`);
  console.log('');
  
  const imageFiles = locationFiles
    .filter(file => {
      if (!file.metadata) return false;
      const isImage = file.metadata.mimetype?.startsWith('image/') || 
        /\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$/i.test(file.name);
      return isImage;
    });
  
  console.log(`其中 ${imageFiles.length} 个是图片文件`);
  console.log('');
  
  const imagesWithDetails = imageFiles
    .filter(file => file.metadata && file.metadata.size > 500 * 1024) // > 500KB
    .map(file => {
      const fileNameOnly = extractFileName(file.name);
      
      let matchedLocation = null;
      for (const loc of locations) {
        if (loc.image_url) {
          if (loc.image_url.includes(file.name) || loc.image_url.includes(fileNameOnly)) {
            matchedLocation = loc;
            break;
          }
        }
        if (loc.images && Array.isArray(loc.images)) {
          for (const img of loc.images) {
            if (img && (img.includes(file.name) || img.includes(fileNameOnly))) {
              matchedLocation = loc;
              break;
            }
          }
          if (matchedLocation) break;
        }
      }
      
      return {
        bucket: 'location-images',
        fullPath: `location-images/${file.name}`,
        name: file.name,
        fileNameOnly,
        sizeBytes: file.metadata.size,
        sizeMB: (file.metadata.size / (1024 * 1024)).toFixed(2),
        mimetype: file.metadata.mimetype,
        location: matchedLocation
      };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
  
  console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                        TOP 30 大图片列表                                            ║');
  console.log('╠══════╤════════════╤════════════════════════════════════════╤════════════════════════════════════════╣');
  console.log('║ 排名 │ 大小 (MB)  │ 景点名称                                 │ 文件路径                               ║');
  console.log('╠══════╪════════════╪════════════════════════════════════════╪════════════════════════════════════════╣');
  
  imagesWithDetails.slice(0, 30).forEach((img, index) => {
    const rank = (index + 1).toString().padStart(4);
    const sizeMB = img.sizeMB.padStart(10);
    const locName = img.location 
      ? (img.location.name_cn || img.location.name).substring(0, 30).padEnd(30)
      : '(未匹配)'.padEnd(30);
    const shortPath = img.name.length > 40 ? '...' + img.name.substring(img.name.length - 37) : img.name.padEnd(40);
    
    console.log(`║ ${rank} │ ${sizeMB} │ ${locName} │ ${shortPath} ║`);
  });
  
  console.log('╚══════╧════════════╧════════════════════════════════════════╧════════════════════════════════════════╝');
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('详细信息:');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  imagesWithDetails.slice(0, 30).forEach((img, index) => {
    console.log(`\n${index + 1}. [${img.sizeMB} MB] ${img.fullPath}`);
    if (img.location) {
      console.log(`   景点: ${img.location.name_cn || img.location.name} (ID: ${img.location.id})`);
      if (img.location.name && img.location.name_cn) {
        console.log(`   英文: ${img.location.name}`);
      }
    } else {
      console.log('   景点: (未匹配)');
    }
    console.log(`   类型: ${img.mimetype}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(`统计: 共找到 ${imagesWithDetails.length} 张 >500KB 的图片`);
  const matchedCount = imagesWithDetails.filter(img => img.location).length;
  console.log(`其中 ${matchedCount} 张已匹配到景点`);
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  
  return imagesWithDetails;
}

findLargeImagesWithLocations();
