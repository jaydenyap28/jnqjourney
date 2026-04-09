
-- Migration to add 'images' array column for multiple image support
-- Run this in Supabase SQL Editor

ALTER TABLE locations ADD COLUMN IF NOT EXISTS images text[];

-- Optional: Migrate existing single image_url to the new images array
-- UPDATE locations SET images = ARRAY[image_url] WHERE image_url IS NOT NULL AND images IS NULL;
