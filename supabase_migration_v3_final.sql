-- MIGRATION V3: Unified Review System & Schema Cleanup

-- 1. Add the new 'review' column if it doesn't exist
ALTER TABLE locations ADD COLUMN IF NOT EXISTS review text;

-- 2. Data Migration: Combine existing 'review_jayden' and 'review_qing' into 'review'
-- Only update rows where 'review' is currently NULL to avoid overwriting new data
UPDATE locations 
SET review = CONCAT(
  CASE WHEN review_jayden IS NOT NULL AND review_jayden != '' THEN 'Jayden: ' || review_jayden || E'\n' ELSE '' END,
  CASE WHEN review_qing IS NOT NULL AND review_qing != '' THEN 'Qing: ' || review_qing ELSE '' END
)
WHERE review IS NULL AND (review_jayden IS NOT NULL OR review_qing IS NOT NULL);

-- 3. (Optional) We KEEP the old columns for now as a backup, 
-- or you can uncomment the lines below to drop them if you want a clean table.
-- ALTER TABLE locations DROP COLUMN IF EXISTS review_jayden;
-- ALTER TABLE locations DROP COLUMN IF EXISTS review_qing;

-- 4. Add comment
COMMENT ON COLUMN locations.review IS 'Unified review field for JnQ Journey';
