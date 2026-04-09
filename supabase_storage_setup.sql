-- Run this once in the Supabase SQL editor before using the admin image uploader.
-- It creates a public-read bucket for location images.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'location-images',
  'location-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view location images" ON storage.objects;

CREATE POLICY "Public can view location images"
ON storage.objects FOR SELECT
USING (bucket_id = 'location-images');
