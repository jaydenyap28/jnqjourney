-- Update visit_date for all spots in Mersing region to 2025-03-04 (4th March 2025)
DO $$
DECLARE
    mersing_region_id INT;
    affected_count INT;
BEGIN
    -- 1. Find the region ID for 'Mersing'
    SELECT id INTO mersing_region_id 
    FROM regions 
    WHERE name ILIKE 'Mersing' 
    LIMIT 1;

    -- 2. If Mersing region exists, update the locations
    IF mersing_region_id IS NOT NULL THEN
        
        -- Update locations that belong to Mersing region
        UPDATE locations 
        SET visit_date = '2025-03-04' 
        WHERE region_id = mersing_region_id;
        
        GET DIAGNOSTICS affected_count = ROW_COUNT;
        RAISE NOTICE 'Updated % locations in Mersing (ID: %) with visit_date = 2025-03-04', affected_count, mersing_region_id;
        
    ELSE
        RAISE NOTICE 'Region "Mersing" not found. No updates performed.';
    END IF;

END $$;
