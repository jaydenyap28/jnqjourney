import { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images'

export function getStorageBucketName() {
  return DEFAULT_BUCKET
}

export async function ensureStorageBucket(supabase: SupabaseClient, bucketName = DEFAULT_BUCKET) {
  const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(bucketName)

  if (!getBucketError && bucket) {
    return bucketName
  }

  const { error: createBucketError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  })

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw new Error(`Storage bucket 初始化失败: ${createBucketError.message}`)
  }

  return bucketName
}
