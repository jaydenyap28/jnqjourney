import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("错误：缺少 NEXT_PUBLIC_SUPABASE_URL 环境变量");
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

async function findLargestImages(buckets = ['cover', 'places', 'galleries'], limit = 20) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Supabase Storage 最大图片查询工具                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  let allFiles = [];
  
  for (const bucket of buckets) {
    const files = await getAllFilesInBucket(bucket);
    console.log(`Bucket "${bucket}": 找到 ${files.length} 个文件`);
    
    for (const file of files) {
      if (file.metadata) {
        allFiles.push({
          bucket,
          name: file.name,
          path: `${bucket}/${file.name}`,
          sizeBytes: file.metadata.size,
          sizeMB: (file.metadata.size / (1024 * 1024)).toFixed(2),
          mimetype: file.metadata.mimetype || 'unknown',
          lastModified: file.metadata.lastModified
        });
      }
    }
  }
  
  console.log(`\n总共找到 ${allFiles.length} 个带有元数据的文件`);
  
  const imageFiles = allFiles.filter(file => 
    file.mimetype.startsWith('image/') || 
    /\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$/i.test(file.name)
  );
  
  console.log(`其中图片文件: ${imageFiles.length} 个`);
  console.log('');
  
  const largestImages = imageFiles
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, limit);
  
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║                            TOP ${limit} 最大图片                                    ║`);
  console.log('╠══════╤════════════╤═══════════╤════════════════════════════════════════════════╣');
  console.log('║ 排名 │ 大小 (MB)  │ Bucket    │ 完整路径                                           ║');
  console.log('╠══════╪════════════╪═══════════╪════════════════════════════════════════════════╣');
  
  largestImages.forEach((file, index) => {
    const rank = (index + 1).toString().padStart(4);
    const sizeMB = file.sizeMB.padStart(10);
    const bucket = file.bucket.padEnd(9);
    console.log(`║ ${rank} │ ${sizeMB} │ ${bucket} │ ${file.path.padEnd(50)} ║`);
  });
  
  console.log('╚══════╧════════════╧═══════════╧════════════════════════════════════════════════╝');
  console.log('');
  
  console.log('详细信息:');
  largestImages.forEach((file, index) => {
    console.log(`\n${index + 1}. ${file.path}`);
    console.log(`   大小: ${file.sizeMB} MB (${file.sizeBytes.toLocaleString()} 字节)`);
    console.log(`   类型: ${file.mimetype}`);
    if (file.lastModified) {
      console.log(`   修改时间: ${new Date(file.lastModified).toLocaleString()}`);
    }
  });
  
  console.log('\n提示: 你可以通过以下 URL 访问这些图片:');
  console.log(`${supabaseUrl}/storage/v1/object/public/{bucket}/{file_name}`);
  
  return largestImages;
}

findLargestImages(['cover', 'places', 'galleries'], 20);
