-- Refactor 'locations' table for V2

-- 1. Add new 'review' column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS review text;

-- 2. Migrate existing data (Optional: Concatenate old reviews if needed, or just leave them)
-- For this refactor, we will just copy jayden's review if present, or qing's, or combine them.
-- Let's combine them for safety before dropping, or just leave it blank if new entry.
-- UPDATE locations SET review = CONCAT('Jayden: ', review_jayden, E'\n\n', 'Qing: ', review_qing) WHERE review IS NULL;

-- 3. Drop old columns (review_jayden, review_qing)
ALTER TABLE locations DROP COLUMN IF EXISTS review_jayden;
ALTER TABLE locations DROP COLUMN IF EXISTS review_qing;

-- 4. Add comment for the new column
COMMENT ON COLUMN locations.review IS 'Combined review/verdict from JnQ';
