-- Update 'locations' table with all necessary columns

-- Add video_url column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS video_url text;

-- Add image_url column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_url text;

-- Add tags column (as an array of text)
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tags text[];

-- Add review_jayden column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS review_jayden text;

-- Add review_qing column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS review_qing text;

-- Add visit_date column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS visit_date date;

-- Add comments for clarity
COMMENT ON COLUMN locations.video_url IS 'YouTube video URL for the location';
COMMENT ON COLUMN locations.image_url IS 'Cover image URL for the location';
COMMENT ON COLUMN locations.tags IS 'Array of tags for the location';
COMMENT ON COLUMN locations.review_jayden IS 'Review from Jayden';
COMMENT ON COLUMN locations.review_qing IS 'Review from Qing';
COMMENT ON COLUMN locations.visit_date IS 'Date of visit';
