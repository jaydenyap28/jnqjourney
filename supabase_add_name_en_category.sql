-- Add name_en and category columns to locations table
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS name_en TEXT,
ADD COLUMN IF NOT EXISTS category TEXT;

-- Comment on columns
COMMENT ON COLUMN locations.name_en IS 'English name of the location';
COMMENT ON COLUMN locations.category IS 'Category of the location (e.g., attraction, food)';
