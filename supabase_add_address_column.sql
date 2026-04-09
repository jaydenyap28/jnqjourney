-- Add address column to locations table
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS address TEXT;

-- Comment on column
COMMENT ON COLUMN locations.address IS 'Physical address of the location';
