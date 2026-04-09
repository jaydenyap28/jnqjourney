-- Add country column to regions table
ALTER TABLE regions ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Malaysia';

-- Update existing records to have 'Malaysia' as country if they are null
UPDATE regions SET country = 'Malaysia' WHERE country IS NULL;

-- Comment on column
COMMENT ON COLUMN regions.country IS 'Country of the region (e.g. Malaysia, China, Japan)';
