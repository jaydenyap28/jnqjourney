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

async function findLargeFiles(bucketName, sizeLimitMB = 1, locations = []) {
  const sizeLimitBytes = sizeLimitMB * 1024 * 1024;
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`检查 bucket: ${bucketName} (查找 > ${sizeLimitMB}MB 的文件)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  
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
        console.error(`Error listing bucket ${bucketName}:`, error.message);
        break;
      }
      
      if (!data || data.length === 0) break;
      
      allFiles.push(...data);
      
      if (data.length < limit) break;
      
      offset += limit;
    }
    
    console.log(`找到 ${allFiles.length} 个文件`);
    
    const largeFiles = allFiles
      .filter(file => file.metadata && file.metadata.size > sizeLimitBytes)
      .sort((a, b) => b.metadata.size - a.metadata.size)
      .map(file => {
        const fileNameOnly = extractFileName(file.name);
        let matchedLocation = null;
        
        if (locations.length > 0) {
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
        }
        
        return {
          bucket: bucketName,
          name: file.name,
          fileNameOnly,
          sizeBytes: file.metadata.size,
          sizeMB: (file.metadata.size / (1024 * 1024)).toFixed(2),
          mimetype: file.metadata?.mimetype,
          location: matchedLocation
        };
      });

    if (largeFiles.length === 0) {
      console.log(`Bucket "${bucketName}" 中没有找到大于 ${sizeLimitMB}MB 的文件。`);
    } else {
      console.log(`\n找到 ${largeFiles.length} 个大文件:\n`);
      
      console.log('┌──────┬────────────┬────────────────────────────────────────┬────────────────────────────────────────┐');
      console.log('│ 排名 │ 大小 (MB)  │ 景点名称                                 │ 文件路径                               │');
      console.log('├──────┼────────────┼────────────────────────────────────────┼────────────────────────────────────────┤');
      
      largeFiles.slice(0, 20).forEach((f, i) => {
        const rank = (i + 1).toString().padStart(4);
        const size = f.sizeMB.padStart(10);
        const locName = f.location 
          ? (f.location.name_cn || f.location.name).substring(0, 30).padEnd(30)
          : '(未匹配)'.padEnd(30);
        const shortPath = f.name.length > 40 ? '...' + f.name.substring(f.name.length - 37) : f.name.padEnd(40);
        console.log(`│ ${rank} │ ${size} │ ${locName} │ ${shortPath} │`);
      });
      
      console.log('└──────┴────────────┴────────────────────────────────────────┴────────────────────────────────────────┘\n');
      
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('详细信息:');
      console.log('═══════════════════════════════════════════════════════════════\n');
      
      largeFiles.forEach((f, i) => {
        console.log(`${i + 1}. [${f.sizeMB} MB] ${f.bucket}/${f.name}`);
        if (f.location) {
          console.log(`   景点: ${f.location.name_cn || f.location.name} (ID: ${f.location.id})`);
        }
        console.log(`   类型: ${f.mimetype || 'unknown'}\n`);
      });
    }
  } catch (err) {
    console.error("Fatal error:", err);
  }
  
  return largeFiles;
}

async function run() {
  const locations = await getAllLocations();
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           查找大图片 + 关联景点信息工具                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  let allLargeFiles = [];
  
  allLargeFiles = allLargeFiles.concat(
    await findLargeFiles('cover', 0.5, locations)
  );
  allLargeFiles = allLargeFiles.concat(
    await findLargeFiles('places', 1, locations)
  );
  allLargeFiles = allLargeFiles.concat(
    await findLargeFiles('galleries', 1, locations)
  );
  
  if (allLargeFiles.length > 0) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TOP 20 最大图片汇总                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    const top20 = allLargeFiles.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 20);
    
    console.log('┌──────┬────────────┬────────────────────────────────────────┬────────────────────────────────────────┐');
    console.log('│ 排名 │ 大小 (MB)  │ 景点名称                                 │ 文件路径                               │');
    console.log('├──────┼────────────┼────────────────────────────────────────┼────────────────────────────────────────┤');
    
    top20.forEach((f, i) => {
      const rank = (i + 1).toString().padStart(4);
      const size = f.sizeMB.padStart(10);
      const locName = f.location 
        ? (f.location.name_cn || f.location.name).substring(0, 30).padEnd(30)
        : '(未匹配)'.padEnd(30);
      const shortPath = (f.bucket + '/' + f.name).length > 40 
        ? '...' + (f.bucket + '/' + f.name).substring((f.bucket + '/' + f.name).length - 37) 
        : (f.bucket + '/' + f.name).padEnd(40);
      console.log(`│ ${rank} │ ${size} │ ${locName} │ ${shortPath} │`);
    });
    
    console.log('└──────┴────────────┴────────────────────────────────────────┴────────────────────────────────────────┘\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`统计: 共找到 ${allLargeFiles.length} 个大文件`);
    const matchedCount = allLargeFiles.filter(f => f.location).length;
    console.log(`其中 ${matchedCount} 个已匹配到景点`);
    console.log('═══════════════════════════════════════════════════════════════');
  }
}

run();
