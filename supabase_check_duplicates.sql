-- Check for duplicate locations based on name or Chinese name

DO $$
DECLARE
    dup_name RECORD;
    dup_cn RECORD;
    duplicate_found BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '--- Checking for Duplicates by English Name (name) ---';
    
    FOR dup_name IN 
        SELECT name, COUNT(*) as cnt
        FROM locations
        GROUP BY name
        HAVING COUNT(*) > 1
    LOOP
        duplicate_found := TRUE;
        RAISE NOTICE 'Duplicate found: "%" (Count: %)', dup_name.name, dup_name.cnt;
        
        -- Optional: List IDs for this duplicate
        -- FOR rec IN SELECT id, region_id FROM locations WHERE name = dup_name.name LOOP
        --     RAISE NOTICE '    -> ID: %, Region ID: %', rec.id, rec.region_id;
        -- END LOOP;
    END LOOP;

    IF NOT duplicate_found THEN
        RAISE NOTICE 'No duplicates found by English Name.';
    END IF;

    duplicate_found := FALSE; -- Reset flag
    RAISE NOTICE ' ';
    RAISE NOTICE '--- Checking for Duplicates by Chinese Name (name_cn) ---';

    FOR dup_cn IN 
        SELECT name_cn, COUNT(*) as cnt
        FROM locations
        WHERE name_cn IS NOT NULL AND name_cn <> ''
        GROUP BY name_cn
        HAVING COUNT(*) > 1
    LOOP
        duplicate_found := TRUE;
        RAISE NOTICE 'Duplicate found: "%" (Count: %)', dup_cn.name_cn, dup_cn.cnt;
    END LOOP;

    IF NOT duplicate_found THEN
        RAISE NOTICE 'No duplicates found by Chinese Name.';
    END IF;

END $$;

-- Query to view details of duplicates (for manual inspection)
SELECT 
    l.id, 
    l.name, 
    l.name_cn, 
    r.name as region_name, 
    l.created_at
FROM locations l
LEFT JOIN regions r ON l.region_id = r.id
WHERE l.name IN (
    SELECT name
    FROM locations
    GROUP BY name
    HAVING COUNT(*) > 1
)
OR l.name_cn IN (
    SELECT name_cn
    FROM locations
    WHERE name_cn IS NOT NULL AND name_cn <> ''
    GROUP BY name_cn
    HAVING COUNT(*) > 1
)
ORDER BY l.name, l.name_cn, l.id;
