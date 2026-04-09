-- Add missing columns to regions table
ALTER TABLE regions ADD COLUMN IF NOT EXISTS name_cn TEXT;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS bounds JSONB;

-- Comment on columns
COMMENT ON COLUMN regions.name_cn IS 'Chinese name of the region';
COMMENT ON COLUMN regions.description IS 'Description of the region';
COMMENT ON COLUMN regions.image_url IS 'Representative image URL for the region';
COMMENT ON COLUMN regions.bounds IS 'Map bounds [[minLng, minLat], [maxLng, maxLat]]';
