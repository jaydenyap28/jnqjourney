-- Add China spots (Harbin)
-- This script adds regions and spots for Harbin, China.

DO $$
DECLARE
    v_heilongjiang_id INTEGER;
    v_harbin_id INTEGER;
BEGIN
    -- ==========================================
    -- CHINA - Harbin
    -- ==========================================

    -- Heilongjiang (Province)
    SELECT id INTO v_heilongjiang_id FROM regions WHERE name = 'Heilongjiang' AND country = 'China';
    IF v_heilongjiang_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Heilongjiang', 
            '黑龙江省', 
            'The northernmost province of China, known for its cold winters and ice festivals.', 
            NULL, 
            'HLJ', 
            'China', 
            NULL,
            'heilongjiang'
        ) RETURNING id INTO v_heilongjiang_id;
    END IF;

    -- Harbin (City)
    SELECT id INTO v_harbin_id FROM regions WHERE name = 'Harbin' AND parent_id = v_heilongjiang_id;
    IF v_harbin_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Harbin', 
            '哈尔滨市', 
            'Capital of Heilongjiang, famous for the annual Ice and Snow Sculpture Festival.', 
            NULL, 
            'HRB', 
            'China', 
            v_heilongjiang_id,
            'harbin'
        ) RETURNING id INTO v_harbin_id;
    END IF;

    -- Spot: Harbin Ice and Snow World
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Harbin Ice and Snow World') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Harbin Ice and Snow World',
            '哈尔滨冰雪大世界',
            'The world''s largest ice and snow theme park, featuring massive illuminated ice sculptures.',
            'Songbei District, Harbin, Heilongjiang, China',
            45.7791, 126.5669,
            'entertainment',
            'https://maps.app.goo.gl/example',
            v_harbin_id,
            'active'
        );
    END IF;

END $$;
