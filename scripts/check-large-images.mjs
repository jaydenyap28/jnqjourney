import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing Supabase URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function findLargeFiles(bucketName, sizeLimitMB = 1) {
  const sizeLimitBytes = sizeLimitMB * 1024 * 1024;
  console.log(`\nChecking bucket: ${bucketName} for files > ${sizeLimitMB}MB...`);
  
  let allFiles = [];
  let nextToken = null;
  
  try {
    do {
      const { data, error, nextCursor } = await supabase
        .storage
        .from(bucketName)
        .list('', {
          limit: 100,
          offset: nextToken ? parseInt(nextToken) : 0,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        console.error(`Error listing bucket ${bucketName}:`, error.message);
        break;
      }
      
      if (!data || data.length === 0) break;
      
      allFiles.push(...data);
      
      // Basic pagination logic if data returned is exactly the limit
      if (data.length === 100) {
        nextToken = (nextToken ? parseInt(nextToken) : 0) + 100;
      } else {
        nextToken = null;
      }
    } while (nextToken);
    
    // Filter large files
    const largeFiles = allFiles
      .filter(file => file.metadata && file.metadata.size > sizeLimitBytes)
      .sort((a, b) => b.metadata.size - a.metadata.size)
      .map(file => ({
        name: file.name,
        sizeMB: (file.metadata.size / (1024 * 1024)).toFixed(2),
        mimetype: file.metadata?.mimetype
      }));

    if (largeFiles.length === 0) {
      console.log(`No files larger than ${sizeLimitMB}MB found in ${bucketName}.`);
    } else {
      console.log(`Found ${largeFiles.length} large files:`);
      largeFiles.forEach(f => console.log(`- ${f.name} (${f.sizeMB} MB) [${f.mimetype}]`));
    }
  } catch (err) {
    console.error("Fatal error:", err);
  }
}

async function run() {
  await findLargeFiles('cover', 0.5); // Check cover files > 0.5MB
  await findLargeFiles('places', 1);  // Check places files > 1MB
  await findLargeFiles('galleries', 1);
}

run();
