-- Add facebook_video_url column to locations table
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS facebook_video_url TEXT;

-- Comment on column
COMMENT ON COLUMN locations.facebook_video_url IS 'Facebook video URL for the location (short/spot video)';
