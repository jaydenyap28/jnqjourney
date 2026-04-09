-- SQL script to insert Kelantan spots
-- Handles region creation and spot insertion

-- 0. Ensure required columns exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'google_maps_url') THEN
        ALTER TABLE locations ADD COLUMN google_maps_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'opening_hours') THEN
        ALTER TABLE locations ADD COLUMN opening_hours jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'slug') THEN
        ALTER TABLE regions ADD COLUMN slug TEXT;
    END IF;
END $$;

DO $$
DECLARE
    v_kelantan_id bigint;
    v_kota_bharu_id bigint;
    v_tumpat_id bigint;
    v_pasir_mas_id bigint;
    v_bachok_id bigint;
    v_gua_musang_id bigint;
    v_tanah_merah_id bigint;
    v_pasir_puteh_id bigint;
BEGIN
    -- 1. Get or Create Kelantan State Region
    SELECT id INTO v_kelantan_id FROM regions WHERE name = 'Kelantan' AND parent_id IS NULL;
    
    IF v_kelantan_id IS NULL THEN
        INSERT INTO regions (name, name_cn, is_state, slug, image_url)
        VALUES ('Kelantan', '吉兰丹', true, 'kelantan', 'https://images.unsplash.com/photo-1627993309653-e574695b2259?q=80&w=2000&auto=format&fit=crop')
        RETURNING id INTO v_kelantan_id;
        RAISE NOTICE 'Created new state region: Kelantan (%)', v_kelantan_id;
    ELSE
        RAISE NOTICE 'Found existing state region: Kelantan (%)', v_kelantan_id;
    END IF;

    -- 2. Get or Create Districts
    
    -- Kota Bharu
    SELECT id INTO v_kota_bharu_id FROM regions WHERE name = 'Kota Bharu' AND parent_id = v_kelantan_id;
    IF v_kota_bharu_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Kota Bharu', '哥打巴鲁', v_kelantan_id, 'kota-bharu')
        RETURNING id INTO v_kota_bharu_id;
        RAISE NOTICE 'Created new district: Kota Bharu (%)', v_kota_bharu_id;
    ELSE
        RAISE NOTICE 'Found existing district: Kota Bharu (%)', v_kota_bharu_id;
    END IF;

    -- Tumpat
    SELECT id INTO v_tumpat_id FROM regions WHERE name = 'Tumpat' AND parent_id = v_kelantan_id;
    IF v_tumpat_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Tumpat', '道北', v_kelantan_id, 'tumpat')
        RETURNING id INTO v_tumpat_id;
        RAISE NOTICE 'Created new district: Tumpat (%)', v_tumpat_id;
    ELSE
        RAISE NOTICE 'Found existing district: Tumpat (%)', v_tumpat_id;
    END IF;

    -- Pasir Mas
    SELECT id INTO v_pasir_mas_id FROM regions WHERE name = 'Pasir Mas' AND parent_id = v_kelantan_id;
    IF v_pasir_mas_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Pasir Mas', '巴西马', v_kelantan_id, 'pasir-mas')
        RETURNING id INTO v_pasir_mas_id;
        RAISE NOTICE 'Created new district: Pasir Mas (%)', v_pasir_mas_id;
    ELSE
        RAISE NOTICE 'Found existing district: Pasir Mas (%)', v_pasir_mas_id;
    END IF;

    -- Bachok
    SELECT id INTO v_bachok_id FROM regions WHERE name = 'Bachok' AND parent_id = v_kelantan_id;
    IF v_bachok_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Bachok', '万捷', v_kelantan_id, 'bachok')
        RETURNING id INTO v_bachok_id;
        RAISE NOTICE 'Created new district: Bachok (%)', v_bachok_id;
    ELSE
        RAISE NOTICE 'Found existing district: Bachok (%)', v_bachok_id;
    END IF;

    -- Gua Musang
    SELECT id INTO v_gua_musang_id FROM regions WHERE name = 'Gua Musang' AND parent_id = v_kelantan_id;
    IF v_gua_musang_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Gua Musang', '话望生', v_kelantan_id, 'gua-musang')
        RETURNING id INTO v_gua_musang_id;
        RAISE NOTICE 'Created new district: Gua Musang (%)', v_gua_musang_id;
    ELSE
        RAISE NOTICE 'Found existing district: Gua Musang (%)', v_gua_musang_id;
    END IF;

    -- Tanah Merah
    SELECT id INTO v_tanah_merah_id FROM regions WHERE name = 'Tanah Merah' AND parent_id = v_kelantan_id;
    IF v_tanah_merah_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Tanah Merah', '丹那美拉', v_kelantan_id, 'tanah-merah')
        RETURNING id INTO v_tanah_merah_id;
        RAISE NOTICE 'Created new district: Tanah Merah (%)', v_tanah_merah_id;
    ELSE
        RAISE NOTICE 'Found existing district: Tanah Merah (%)', v_tanah_merah_id;
    END IF;

    -- Pasir Puteh
    SELECT id INTO v_pasir_puteh_id FROM regions WHERE name = 'Pasir Puteh' AND parent_id = v_kelantan_id;
    IF v_pasir_puteh_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Pasir Puteh', '巴西富地', v_kelantan_id, 'pasir-puteh')
        RETURNING id INTO v_pasir_puteh_id;
        RAISE NOTICE 'Created new district: Pasir Puteh (%)', v_pasir_puteh_id;
    ELSE
        RAISE NOTICE 'Found existing district: Pasir Puteh (%)', v_pasir_puteh_id;
    END IF;


    -- 3. Add Kelantan Spots

    -- === KOTA BHARU ===

    -- Renai Hotel Kota Bharu
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Renai Hotel Kota Bharu',
        '哥打巴鲁瑞奈酒店',
        'A premier hotel in Kota Bharu offering luxurious accommodation and easy access to the city center and cultural attractions.',
        'Kota Sri Mutiara, Jalan Sultan Yahya Petra, 15150 Kota Bharu, Kelantan',
        'https://maps.app.goo.gl/MC47tAeHc7wSkkuE8',
        6.1170, 102.2530,
        v_kota_bharu_id,
        'Accommodation',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Hattori Coffee
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Hattori Coffee',
        'Hattori 咖啡',
        'Popular cafe in Kota Bharu known for its specialty coffee and cozy ambiance.',
        'Kota Bharu, Kelantan',
        'https://maps.app.goo.gl/wANBCd3YMJxJ7cai6',
        6.1200, 102.2400,
        v_kota_bharu_id,
        'Food',
        '{"monday": "10:00-22:00", "tuesday": "10:00-22:00", "wednesday": "10:00-22:00", "thursday": "10:00-22:00", "friday": "10:00-22:00", "saturday": "10:00-22:00", "sunday": "10:00-22:00"}',
        'open'
    );

    -- Pantai Mek Mas
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Mek Mas',
        'Mek Mas Beach',
        'Scenic beach located at the river mouth (Kuala Besar), known for its sandy dunes and peaceful environment.',
        'Kuala Besar, 15350 Kota Bharu, Kelantan',
        'https://maps.app.goo.gl/RirC8jQRhv5j8Nai9',
        6.2300, 102.2300,
        v_kota_bharu_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Dataran Cheng Ho
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Dataran Cheng Ho',
        '郑和广场',
        'Cultural square featuring Islamic architecture and monuments dedicated to Admiral Cheng Ho. A symbol of cultural harmony.',
        'Jalan Kebun Sultan, 15300 Kota Bharu, Kelantan',
        'https://maps.app.goo.gl/p9ChnccR3xESwx2J6',
        6.1300, 102.2400,
        v_kota_bharu_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Siti Khadijah Market
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Siti Khadijah Market',
        '西蒂卡迪嘉大巴刹',
        'Famous central market in Kota Bharu, known for its vibrant atmosphere and local women traders selling produce and crafts.',
        'Jalan Buluh Kubu, 15000 Kota Bharu, Kelantan',
        'https://maps.app.goo.gl/KNZA4RyKY7RC8Bek9',
        6.1300, 102.2380,
        v_kota_bharu_id,
        'Shopping',
        '{"monday": "07:00-18:00", "tuesday": "07:00-18:00", "wednesday": "07:00-18:00", "thursday": "07:00-18:00", "friday": "07:00-18:00", "saturday": "07:00-18:00", "sunday": "07:00-18:00"}',
        'open'
    );

    -- Street Art Kota Bharu
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Street Art Kota Bharu',
        '哥打巴鲁街头艺术',
        'Colorful street art murals depicting Kelantan''s culture and heritage, located in the alleys of Kota Bharu.',
        'Jalan Dato Pati, 15000 Kota Bharu, Kelantan',
        'https://maps.app.goo.gl/Hq2Gas7ALXXT6sJk6',
        6.1310, 102.2390,
        v_kota_bharu_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- === TUMPAT ===

    -- Wat Phothivihan (Sleeping Buddha)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Wat Phothivihan',
        '卧佛寺 (Wat Phothivihan)',
        'Famous Buddhist temple housing one of the longest reclining Buddha statues in Southeast Asia (40 meters).',
        'Kampung Jambu, 16200 Tumpat, Kelantan',
        'https://maps.app.goo.gl/7WwuvwwM8v8qhvpK7',
        6.1950, 102.1600,
        v_tumpat_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- Wat Machimmaram (Sitting Buddha)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Wat Machimmaram',
        '坐佛寺 (Wat Machimmaram)',
        'Temple featuring a massive sitting Buddha statue, visible from afar. A serene place for worship and photography.',
        'Kampung Jubakar, 16210 Tumpat, Kelantan',
        'https://maps.app.goo.gl/5eCtZwQd46kXYr3KA',
        6.2000, 102.1700,
        v_tumpat_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- Wat Phikulthong (Standing Buddha)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Wat Phikulthong',
        '立佛寺 (Wat Phikulthong)',
        'Buddhist temple known for its tall standing Buddha statue. Intricate architecture and peaceful surroundings.',
        'Kampung Terbak, 16200 Tumpat, Kelantan',
        'https://maps.app.goo.gl/XAT3RwpCthHCN28X7',
        6.1900, 102.1500,
        v_tumpat_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- Wat MaiSuwanKiri (Dragon Boat Temple)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Wat MaiSuwanKiri',
        '龙船寺 (Wat Mai Suwan Kiri)',
        'Unique temple with a Dragon Boat design. Features elaborate Thai architectural details.',
        'Kampung Bukit Tanah, 16200 Tumpat, Kelantan',
        'https://maps.app.goo.gl/cwNEZRkH3Neu4uva8',
        6.1850, 102.1550,
        v_tumpat_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- === PASIR MAS ===

    -- Masjid Beijing Rantau Panjang
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Masjid Beijing Rantau Panjang',
        '北京清真寺 (Beijing Mosque)',
        'Unique Chinese-style mosque with a silver dome and pagoda-like architecture. Located near the Thai border.',
        'Rantau Panjang, 17200 Pasir Mas, Kelantan',
        'https://maps.app.goo.gl/6hfWPMLaCGAwhtkEA',
        6.0200, 101.9700,
        v_pasir_mas_id,
        'Culture',
        '{"monday": "05:00-22:00", "tuesday": "05:00-22:00", "wednesday": "05:00-22:00", "thursday": "05:00-22:00", "friday": "05:00-22:00", "saturday": "05:00-22:00", "sunday": "05:00-22:00"}',
        'open'
    );

    -- Wat Uttamaram
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Wat Uttamaram',
        'Wat Uttamaram',
        'Thai Buddhist temple famous for its abbot and beautiful architecture. A spiritual center in Pasir Mas.',
        'Kampung Teresek, 17000 Pasir Mas, Kelantan',
        'https://maps.app.goo.gl/LXcq61sJY6Tq7CsA9',
        6.0100, 102.0500,
        v_pasir_mas_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- === BACHOK ===

    -- Senok Beach
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Senok Beach',
        'Senok Beach (Pantai Senok)',
        'Often called the "Nami Island of Malaysia" due to its rows of pine trees. Beautiful spot for photography and picnics.',
        'Pantai Senok, 16300 Bachok, Kelantan',
        'https://maps.app.goo.gl/Fb5Yi14qcM3vteQp8',
        6.1500, 102.3500,
        v_bachok_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Wat Phothikyan Phutthaktham
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Wat Phothikyan Phutthaktham',
        '双龙寺 (Wat Phothikyan)',
        'Temple featuring a large standing Buddha and a pair of dragons. Known for its intricate details and serene atmosphere.',
        'Kampung Balai, 16300 Bachok, Kelantan',
        'https://maps.app.goo.gl/nv8G8psJg61CXvsJ7',
        6.0800, 102.3800,
        v_bachok_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- === GUA MUSANG ===

    -- Kelantan Nan Hai Guan Yin Temple
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Kelantan Nan Hai Guan Yin Temple',
        '吉兰丹南海观音庙',
        'Located in Pulai, this temple is set against a limestone hill backdrop. A significant religious site with a large Guan Yin statue.',
        'Kampung Pulai, 18300 Gua Musang, Kelantan',
        'https://maps.app.goo.gl/JAU2hLALd3WouCYPA',
        4.8800, 101.9600,
        v_gua_musang_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- === TANAH MERAH ===

    -- KTMB Guillemard Bridge
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'KTMB Guillemard Bridge',
        'Guillemard Bridge',
        'Historical railway bridge built in 1924, spanning the Kelantan River. The longest railway bridge in Malaysia.',
        'Kusial Bharu, 17500 Tanah Merah, Kelantan',
        'https://maps.app.goo.gl/HRQkqnLMQfEUBxQ37',
        5.8000, 102.1500,
        v_tanah_merah_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Selera Tepi Sungai
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Selera Tepi Sungai',
        'Selera Tepi Sungai',
        'Riverside dining spot offering local Malay cuisine with a view of the Kelantan River. Relaxing atmosphere.',
        'Tanah Merah, Kelantan',
        'https://maps.app.goo.gl/yPmW8bGyxB4UXrfz8',
        5.8100, 102.1400,
        v_tanah_merah_id,
        'Food',
        '{"monday": "16:00-00:00", "tuesday": "16:00-00:00", "wednesday": "16:00-00:00", "thursday": "16:00-00:00", "friday": "16:00-00:00", "saturday": "16:00-00:00", "sunday": "16:00-00:00"}',
        'open'
    );

    -- === PASIR PUTEH ===

    -- SRZ Ternak (Ladang Tenusu Jeram Mengaji)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'SRZ Ternak (Ladang Tenusu Jeram Mengaji)',
        'SRZ Ternak Dairy Farm',
        'Dairy farm offering fresh milk and educational tours. Located near the Jeram Mengaji nature area.',
        'Lot 972, Kg. Sungai Durian, Mukim Banggol Setol, Pasir Puteh, Kelantan',
        'https://maps.app.goo.gl/wBZ9Tp9uc3NqSMKH9',
        5.8500, 102.3000,
        v_pasir_puteh_id,
        'Sightseeing',
        '{"monday": "09:00-18:00", "tuesday": "09:00-18:00", "wednesday": "09:00-18:00", "thursday": "09:00-18:00", "friday": "09:00-18:00", "saturday": "09:00-18:00", "sunday": "09:00-18:00"}',
        'open'
    );

    -- Jeram Mengaji
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Jeram Mengaji',
        'Jeram Mengaji',
        'Popular recreational spot with a waterfall and river. Ideal for picnics and swimming.',
        'Jeram Mengaji Agro Resort, Pasir Puteh, Kelantan',
        'https://maps.app.goo.gl/angqbTogwBpm96Fa9',
        5.8550, 102.3050,
        v_pasir_puteh_id,
        'Nature',
        '{"monday": "08:00-18:00", "tuesday": "08:00-18:00", "wednesday": "08:00-18:00", "thursday": "08:00-18:00", "friday": "08:00-18:00", "saturday": "08:00-18:00", "sunday": "08:00-18:00"}',
        'open'
    );

END $$;
