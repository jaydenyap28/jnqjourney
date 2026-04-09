DO $$
DECLARE
    pontian_id BIGINT;
BEGIN
    -- Get Pontian ID
    SELECT id INTO pontian_id FROM regions WHERE name = 'Pontian';
    
    -- Update locations if Pontian region exists
    IF pontian_id IS NOT NULL THEN
        UPDATE locations
        SET visit_date = '2025-02-24'
        WHERE region_id = pontian_id;
        
        RAISE NOTICE 'Updated Pontian locations with date 2025-02-24';
    ELSE
        RAISE NOTICE 'Pontian region not found';
    END IF;
END $$;
