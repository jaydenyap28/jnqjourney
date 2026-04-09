-- Deduplicate locations: Keep the oldest record (based on created_at), delete newer duplicates
-- Strategy:
-- 1. Identify duplicates by name (English)
-- 2. Identify duplicates by name_cn (Chinese) - handled together with English name check if possible or separately
-- 3. For each group of duplicates, find the one with the MIN(created_at) (oldest) to KEEP
-- 4. DELETE all other IDs in that group

DO $$
DECLARE
    deleted_count INT := 0;
BEGIN
    -- Temporary table to store IDs to delete
    CREATE TEMP TABLE IF NOT EXISTS locations_to_delete AS
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY name 
                ORDER BY created_at ASC, id ASC
            ) as rn
        FROM locations
    ) t
    WHERE rn > 1;

    -- Add IDs found by Chinese name duplicates (if any additional ones)
    INSERT INTO locations_to_delete (id)
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY name_cn 
                ORDER BY created_at ASC, id ASC
            ) as rn
        FROM locations
        WHERE name_cn IS NOT NULL AND name_cn <> ''
    ) t
    WHERE rn > 1
    ON CONFLICT DO NOTHING; -- Avoid duplicates in the delete list itself if ID already exists

    -- Perform Deletion
    WITH deleted_rows AS (
        DELETE FROM locations
        WHERE id IN (SELECT id FROM locations_to_delete)
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted_rows;

    RAISE NOTICE 'Deleted % duplicate locations.', deleted_count;

    -- Cleanup
    DROP TABLE locations_to_delete;
    
END $$;
