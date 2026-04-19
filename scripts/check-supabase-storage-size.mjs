import { createClient } from '@supabase/supabase-js'

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supaUrl, supaKey)

async function queryStorageObjects() {
  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('id, bucket_id, metadata')

  if (error) {
    console.error('Failed to query storage.objects:', error.message)
    return
  }

  if (data) {
    let totalBytes = 0
    let count = 0
    const bucketStats = {}

    for (const row of data) {
      if (!row.bucket_id) continue
      
      count++
      const size = row.metadata?.size || 0
      totalBytes += size

      if (!bucketStats[row.bucket_id]) {
        bucketStats[row.bucket_id] = { count: 0, size: 0 }
      }
      bucketStats[row.bucket_id].count++
      bucketStats[row.bucket_id].size += size
    }

    console.log(`Total Objects: ${count}`)
    console.log(`Total Size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${totalBytes} Bytes)`)
    
    console.log('\n--- By Bucket ---')
    for (const [bucket, stats] of Object.entries(bucketStats)) {
       console.log(`Bucket [${bucket}]: ${stats.count} files, ${(stats.size / (1024 * 1024)).toFixed(2)} MB`)
    }
  }
}

queryStorageObjects()
