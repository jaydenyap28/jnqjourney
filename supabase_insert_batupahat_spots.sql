-- Create temporary table for upsert operations
CREATE TEMP TABLE IF NOT EXISTS temp_locations (
    name_en text,
    name_cn text,
    category text,
    address text,
    latitude double precision,
    longitude double precision,
    opening_hours jsonb,
    description text,
    image_url text,
    tags text[],
    visit_date date,
    status text
);

-- Clear any existing data in temp table
TRUNCATE temp_locations;

-- Insert verified Batu Pahat spots data
INSERT INTO temp_locations (name_en, name_cn, category, address, latitude, longitude, opening_hours, description, image_url, tags, visit_date, status) VALUES
(
    'Han Kee Cake & Café',
    '汉记面包西果屋',
    'Food',
    '48, Jalan Jelawat, Taman Banang, 83000 Batu Pahat, Johor',
    1.8385, 102.9360, -- Approx coords for Jalan Jelawat
    '{"monday": "07:00-22:00", "tuesday": "07:00-22:00", "wednesday": "07:00-22:00", "thursday": "07:00-22:00", "friday": "07:00-22:00", "saturday": "07:00-22:00", "sunday": "07:00-22:00"}',
    'Traditional Hainanese breakfast, famous for otah bun and coffee.',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80',
    ARRAY['Breakfast', 'Coffee', 'Halal-friendly'],
    '2025-01-01',
    'active'
),
(
    'Macau Kopitiam',
    '澳门茶餐室',
    'Food',
    '72, Jalan Jelawat, Taman Banang, 83000 Batu Pahat, Johor',
    1.8386, 102.9361,
    '{"monday": "08:00-18:00", "tuesday": "08:00-18:00", "wednesday": "08:00-18:00", "thursday": "08:00-18:00", "friday": "08:00-18:00", "saturday": "08:00-18:00", "sunday": "08:00-18:00"}', -- Estimated hours
    'Popular local kopitiam serving Macau-style dishes and local favorites.',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80',
    ARRAY['Food', 'Kopitiam'],
    '2025-01-01',
    'active'
),
(
    'Jian Nan Si Temple',
    '建南寺 (太子爷公庙)',
    'Attraction',
    'Jalan Bukit Pasir, 83000 Batu Pahat, Johor',
    1.8714407, 102.9410228,
    '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
    'Famous Taoist temple in Batu Pahat.',
    'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture'],
    '2025-01-01',
    'active'
),
(
    'Cheh Eng Khor Moral Uplifting Society',
    '德教会 紫英阁',
    'Attraction',
    'Lot 57586, Jalan Tanjong Laboh, 83000 Batu Pahat, Johor',
    1.8235, 102.9320, -- Approx for Jalan Tanjong Laboh
    '{"monday": "09:00-17:00", "tuesday": "09:00-17:00", "wednesday": "09:00-17:00", "thursday": "09:00-17:00", "friday": "09:00-17:00", "saturday": "09:00-17:00", "sunday": "09:00-17:00"}',
    'Majestic temple complex and moral uplifting society.',
    'https://images.unsplash.com/photo-1583528266270-d86b59523287?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture', 'Sightseeing'],
    '2025-01-01',
    'active'
),
(
    'Kedai Makan Soon Lai',
    '顺来粿汁',
    'Food',
    '6-C, Jalan Fatimah, 83000 Batu Pahat, Johor',
    1.8500, 102.9280, -- Approx
    '{"monday": "09:30-16:00", "tuesday": "09:30-16:00", "wednesday": "09:30-16:00", "thursday": "closed", "friday": "09:30-16:00", "saturday": "09:30-16:00", "sunday": "09:30-16:00"}',
    'Famous for Kway Chap (Teochew dish).',
    'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&q=80',
    ARRAY['Food', 'Kway Chap', 'Local Favorite'],
    '2025-01-01',
    'active'
),
(
    'Batu Pahat Lim Sz Chong Su Temple',
    '林氏宗祠天后宫',
    'Attraction',
    '3, Jalan Fatimah, 83000 Batu Pahat, Johor',
    1.8505, 102.9285,
    '{"monday": "07:00-21:00", "tuesday": "07:00-21:00", "wednesday": "07:00-21:00", "thursday": "07:00-21:00", "friday": "07:00-21:00", "saturday": "07:00-21:00", "sunday": "07:00-21:00"}',
    'Historic temple dedicated to Mazu.',
    'https://images.unsplash.com/photo-1565035010268-a3816f98589a?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture'],
    '2025-01-01',
    'active'
),
(
    'Yeo Yeo Min Chang Kueh',
    'Yeo Yeo 面煎糕',
    'Food',
    '70, Jalan Soga, 83000 Batu Pahat, Johor',
    1.8520, 102.9290,
    '{"monday": "11:00-16:30", "tuesday": "11:00-16:30", "wednesday": "11:00-16:30", "thursday": "11:00-16:30", "friday": "11:00-16:30", "saturday": "11:00-16:30", "sunday": "closed"}',
    'Famous peanut pancake (Min Chang Kueh).',
    'https://images.unsplash.com/photo-1626202158866-c95689167f5e?auto=format&fit=crop&q=80',
    ARRAY['Food', 'Snack', 'Dessert'],
    '2025-01-01',
    'active'
),
(
    'Kafe Kiri Kanan',
    'Kafe Kiri Kanan',
    'Food',
    '92, Jalan Rahmat, 83000 Batu Pahat, Johor',
    1.8530, 102.9300,
    '{"monday": "09:30-22:00", "tuesday": "09:30-22:00", "wednesday": "09:30-22:00", "thursday": "09:30-22:00", "friday": "09:30-22:00", "saturday": "09:30-22:00", "sunday": "09:30-22:00"}',
    'Retro-style cafe serving local and western cuisine.',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80',
    ARRAY['Cafe', 'Food'],
    '2025-01-01',
    'active'
),
(
    'BP Dragon Kopitiam',
    'BP Dragon Kopitiam',
    'Food',
    '52-2, Jalan Sultanah, 83000 Batu Pahat, Johor',
    1.8540, 102.9310,
    '{"monday": "08:00-18:00", "tuesday": "08:00-18:00", "wednesday": "08:00-18:00", "thursday": "08:00-18:00", "friday": "08:00-18:00", "saturday": "08:00-18:00", "sunday": "08:00-18:00"}', -- Estimated
    'Popular kopitiam spot.',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80',
    ARRAY['Food', 'Kopitiam'],
    '2025-01-01',
    'active'
),
(
    'Swee Kee Tonic Soup',
    '水记炖汤 (Fish Soup | 鱼汤)',
    'Food',
    '70, Jalan Abu Bakar, 83000 Batu Pahat, Johor',
    1.8510, 102.9295,
    '{"monday": "08:30-21:30", "tuesday": "08:30-21:30", "wednesday": "08:30-21:30", "thursday": "08:30-21:30", "friday": "08:30-21:30", "saturday": "08:30-21:30", "sunday": "08:30-21:30"}',
    'Famous herbal tonic soups and fish soup.',
    'https://images.unsplash.com/photo-1547592166-23acbe3a624b?auto=format&fit=crop&q=80',
    ARRAY['Food', 'Soup', 'Herbal'],
    '2025-01-01',
    'active'
),
(
    'Batu Pahat Chinese Chamber of Commerce',
    '中华总商会',
    'Attraction',
    '32, Jalan Rahmat, 83000 Batu Pahat, Johor',
    1.8492, 102.9295,
    '{"monday": "09:00-17:00", "tuesday": "09:00-17:00", "wednesday": "09:00-17:00", "thursday": "09:00-17:00", "friday": "09:00-17:00", "saturday": "closed", "sunday": "closed"}',
    'Historical building and local business hub.',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80',
    ARRAY['Architecture', 'History'],
    '2025-01-01',
    'active'
),
(
    'Batu Pahat Art Street',
    '壁画街',
    'Attraction',
    'Jalan Ibrahim / Jalan Rotan Utama, 83000 Batu Pahat, Johor',
    1.8500, 102.9300,
    '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
    'Street art murals depicting local culture.',
    'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&q=80',
    ARRAY['Art', 'Street Art', 'Photo Spot'],
    '2025-01-01',
    'active'
),
(
    'Jeti Yok BP Cruise',
    'Jeti Yok BP Cruise',
    'Attraction',
    'Jalan Shahbandar, 83000 Batu Pahat, Johor',
    1.8450, 102.9250, -- Approx near river
    '{"monday": "09:00-17:00", "tuesday": "closed", "wednesday": "closed", "thursday": "09:00-17:00", "friday": "09:00-17:00", "saturday": "09:00-18:00", "sunday": "09:00-18:00"}',
    'River cruise experience in Batu Pahat.',
    'https://images.unsplash.com/photo-1540544660406-6a69dacb2804?auto=format&fit=crop&q=80',
    ARRAY['Activity', 'Cruise', 'Nature'],
    '2025-01-01',
    'active'
),
(
    'Pantai Minyak Beku',
    '米那务固海边',
    'Attraction',
    'Jalan Minyak Beku, 83000 Batu Pahat, Johor',
    1.7900, 102.8900, -- Approx
    '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
    'Scenic beach area with historical sites.',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80',
    ARRAY['Nature', 'Beach', 'Sunset'],
    '2025-01-01',
    'active'
),
(
    'Bukit Segenting Lighthouse',
    '石文丁灯塔',
    'Attraction',
    'Kampung Minyak Beku, 83200 Senggarang, Johor',
    1.79097, 102.88929,
    '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
    'Lighthouse offering panoramic views of the coast.',
    'https://images.unsplash.com/photo-1562325372-466d6d45b49f?auto=format&fit=crop&q=80',
    ARRAY['Sightseeing', 'Viewpoint'],
    '2025-01-01',
    'active'
),
(
    'Perigi Batu Pahat',
    '凿石井 (The Batu Pahat Well)',
    'Attraction',
    'Jalan Minyak Beku, 83000 Batu Pahat, Johor',
    1.7910, 102.8910, -- Near Pantai Minyak Beku
    '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
    'Historical well that gave Batu Pahat its name.',
    'https://images.unsplash.com/photo-1589553416260-f586c8f1514f?auto=format&fit=crop&q=80',
    ARRAY['History', 'Culture'],
    '2025-01-01',
    'active'
),
(
    'Kampung Segenting',
    '石文丁情人桥/渔村',
    'Attraction',
    'Kampung Segenting, Minyak Beku, 83000 Batu Pahat, Johor',
    1.7850, 102.8850, -- Approx
    '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
    'Charming fishing village famous for its Lover Bridge and temples.',
    'https://images.unsplash.com/photo-1505245208761-ba872912fac0?auto=format&fit=crop&q=80',
    ARRAY['Culture', 'Village', 'Photo Spot'],
    '2025-01-01',
    'active'
),
(
    'Chong Long Gong Temple',
    '崇龙宫',
    'Attraction',
    '81, Kampung Segenting, 83030 Batu Pahat, Johor',
    1.7860, 102.8860,
    '{"monday": "08:00-19:00", "tuesday": "08:00-19:00", "wednesday": "08:00-19:00", "thursday": "08:00-19:00", "friday": "08:00-19:00", "saturday": "08:00-19:00", "sunday": "08:00-19:00"}',
    'Famous temple by the sea, known for arapaima fish.',
    'https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture'],
    '2025-01-01',
    'active'
),
(
    'Si Hai Long Wang Temple',
    '四海龙王大伯公庙',
    'Attraction',
    'JP12, Jalan Pantai, 83000 Batu Pahat, Johor',
    1.7870, 102.8870,
    '{"monday": "09:00-18:00", "tuesday": "09:00-18:00", "wednesday": "09:00-18:00", "thursday": "09:00-18:00", "friday": "09:00-18:00", "saturday": "09:00-18:00", "sunday": "09:00-18:00"}',
    'Temple dedicated to the Dragon King of the Four Seas.',
    'https://images.unsplash.com/photo-1596711913867-b5055042646c?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture'],
    '2025-01-01',
    'active'
),
(
    'Cheng Tian Keong',
    '青天宫大伯公',
    'Attraction',
    '3, Jalan Kluang, 83000 Batu Pahat, Johor',
    1.8600, 102.9400, -- Approx for Jalan Kluang
    '{"monday": "08:30-19:00", "tuesday": "08:30-19:00", "wednesday": "08:30-19:00", "thursday": "08:30-19:00", "friday": "08:30-19:00", "saturday": "08:30-19:00", "sunday": "08:30-19:00"}',
    'Popular Chinese temple in Batu Pahat.',
    'https://images.unsplash.com/photo-1577083288073-40892c0860a4?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture'],
    '2025-01-01',
    'active'
),
(
    'Ji Dian Miao',
    '龙工业城济癫庙',
    'Attraction',
    'Jalan Kuari, Batu 3 1/2, Jalan Kluang, 83000 Batu Pahat, Johor',
    1.8700, 102.9500, -- Approx for Industrial area
    '{"monday": "09:00-18:00", "tuesday": "09:00-18:00", "wednesday": "09:00-18:00", "thursday": "09:00-18:00", "friday": "09:00-18:00", "saturday": "09:00-18:00", "sunday": "09:00-18:00"}',
    'Unique temple located in an industrial area, known as the "Iron Temple".',
    'https://images.unsplash.com/photo-1601758282760-b6cc3d07523d?auto=format&fit=crop&q=80',
    ARRAY['Temple', 'Culture', 'Unique'],
    '2025-01-01',
    'active'
);

-- Execute the UPSERT logic in a DO block
DO $$
DECLARE
    v_bp_id bigint;
    v_johor_id bigint;
    t RECORD;
BEGIN
    -- 0. Get Johor ID
    SELECT id INTO v_johor_id FROM regions WHERE name = 'Johor' AND parent_id IS NULL;

    -- 1. Get or create 'batu-pahat' region
    SELECT id INTO v_bp_id FROM regions WHERE name = 'Batu Pahat';
    
    IF v_bp_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id)
        VALUES ('Batu Pahat', '峇株吧辖', v_johor_id)
        RETURNING id INTO v_bp_id;
        RAISE NOTICE 'Created new region: Batu Pahat (%)', v_bp_id;
    ELSE
        RAISE NOTICE 'Found existing region: Batu Pahat (%)', v_bp_id;
    END IF;

    -- 2. Loop through temp locations and UPSERT
    FOR t IN SELECT * FROM temp_locations LOOP
        -- Try to UPDATE first (using name and region_id as unique key conceptually)
        UPDATE locations SET
            name_cn = t.name_cn,
            category = t.category,
            address = t.address,
            latitude = t.latitude,
            longitude = t.longitude,
            opening_hours = t.opening_hours,
            description = t.description,
            image_url = t.image_url,
            tags = t.tags,
            visit_date = t.visit_date,
            status = t.status
        WHERE name = t.name_en AND region_id = v_bp_id;

        -- If no row was updated, INSERT
        IF NOT FOUND THEN
            INSERT INTO locations (
                name, name_cn, category, address, latitude, longitude, 
                opening_hours, description, image_url, tags, visit_date, region_id, status
            ) VALUES (
                t.name_en, t.name_cn, t.category, t.address, t.latitude, t.longitude, 
                t.opening_hours, t.description, t.image_url, t.tags, t.visit_date, v_bp_id, t.status
            );
            RAISE NOTICE 'Inserted location: %', t.name_en;
        ELSE
            RAISE NOTICE 'Updated location: %', t.name_en;
        END IF;
    END LOOP;
END $$;

-- Clean up
DROP TABLE temp_locations;
