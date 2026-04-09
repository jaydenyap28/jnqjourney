-- Rename name_en to name_cn
ALTER TABLE locations
RENAME COLUMN name_en TO name_cn;

-- Update comments
COMMENT ON COLUMN locations.name_cn IS 'Chinese name of the location (Optional)';
COMMENT ON COLUMN locations.name IS 'Primary name (English)';
