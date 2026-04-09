-- SQL script to insert Terengganu spots (Kemaman, Dungun, Marang)
-- Handles region creation and spot insertion

-- 0. Ensure slug column exists in regions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'slug') THEN
        ALTER TABLE regions ADD COLUMN slug TEXT;
    END IF;
END $$;

DO $$
DECLARE
    v_terengganu_id bigint;
    v_kemaman_id bigint;
    v_dungun_id bigint;
    v_marang_id bigint;
    v_setiu_id bigint;
    v_besut_id bigint;
BEGIN
    -- 1. Get or Create Terengganu State
    SELECT id INTO v_terengganu_id FROM regions WHERE name = 'Terengganu' AND parent_id IS NULL;
    
    IF v_terengganu_id IS NULL THEN
        INSERT INTO regions (name, name_cn, is_state, slug, image_url)
        VALUES ('Terengganu', '登嘉楼', true, 'terengganu', 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?q=80&w=2000&auto=format&fit=crop')
        RETURNING id INTO v_terengganu_id;
        RAISE NOTICE 'Created new state region: Terengganu (%)', v_terengganu_id;
    ELSE
        RAISE NOTICE 'Found existing state region: Terengganu (%)', v_terengganu_id;
    END IF;

    -- 2. Get or Create Districts (Kemaman, Dungun, Marang)
    
    -- Kemaman
    SELECT id INTO v_kemaman_id FROM regions WHERE name = 'Kemaman' AND parent_id = v_terengganu_id;
    IF v_kemaman_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Kemaman', '甘马挽', v_terengganu_id, 'kemaman')
        RETURNING id INTO v_kemaman_id;
        RAISE NOTICE 'Created new district: Kemaman (%)', v_kemaman_id;
    ELSE
        RAISE NOTICE 'Found existing district: Kemaman (%)', v_kemaman_id;
    END IF;

    -- Dungun
    SELECT id INTO v_dungun_id FROM regions WHERE name = 'Dungun' AND parent_id = v_terengganu_id;
    IF v_dungun_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Dungun', '龙运', v_terengganu_id, 'dungun')
        RETURNING id INTO v_dungun_id;
        RAISE NOTICE 'Created new district: Dungun (%)', v_dungun_id;
    ELSE
        RAISE NOTICE 'Found existing district: Dungun (%)', v_dungun_id;
    END IF;

    -- Marang
    SELECT id INTO v_marang_id FROM regions WHERE name = 'Marang' AND parent_id = v_terengganu_id;
    IF v_marang_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Marang', '马江', v_terengganu_id, 'marang')
        RETURNING id INTO v_marang_id;
        RAISE NOTICE 'Created new district: Marang (%)', v_marang_id;
    ELSE
        RAISE NOTICE 'Found existing district: Marang (%)', v_marang_id;
    END IF;

    -- 3. Insert Spots

    -- === KEMAMAN SPOTS ===

    -- Riverine Garden Hotel
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Riverine Garden Hotel',
        'Riverine Garden 酒店',
        'Comfortable hotel located in Chukai, offering river views and easy access to local attractions. Near Kemaman District Museum.',
        'K-114, Jalan Sulaimani, Chukai, 24000 Kemaman, Terengganu',
        'https://maps.google.com/?q=4.234,103.425',
        4.2340, 103.4250,
        v_kemaman_id,
        'Accommodation',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Teluk Mak Nik (Monica Bay)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Teluk Mak Nik (Monica Bay)',
        'Monica Bay (Teluk Mak Nik)',
        'Famous beach for turtle watching and pine trees. A serene spot for evening walks. Turtle watching season is typically May-October.',
        'Jalan Paksu, Kampung Geliga Besar, 24000 Chukai, Terengganu',
        'https://maps.google.com/?q=4.2450,103.4350',
        4.2450, 103.4350,
        v_kemaman_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Steven''s Coffee House
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Steven''s Coffee House',
        'Steven''s Coffee House',
        'Popular local kopitiam serving a mix of Western and Malaysian cuisine. Known for its relaxed ambience and variety of chops/steaks.',
        'K-11298, Taman Cukai Utama, Kemaman, 24000, Cukai, Terengganu',
        'https://maps.google.com/?q=4.2200,103.4200',
        4.2200, 103.4200,
        v_kemaman_id,
        'Food',
        '{"monday": "11:00-15:00, 18:00-23:00", "tuesday": "11:00-15:00, 18:00-23:00", "wednesday": "11:00-15:00, 18:00-23:00", "thursday": "11:00-15:00, 18:00-23:00", "friday": "11:00-15:00, 18:00-23:00", "saturday": "11:00-15:00, 18:00-23:00", "sunday": "11:00-15:00, 18:00-23:00"}',
        'open'
    );

    -- Pantai Teluk Kalong
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Teluk Kalong',
        'Teluk Kalong Beach',
        'Quiet beach with industrial backdrop nearby, popular for fishing and picnics. Offers a retreat-like atmosphere.',
        'Teluk Kalong, 24100 Kijal, Terengganu',
        'https://maps.google.com/?q=4.2667,103.4667',
        4.2667, 103.4667,
        v_kemaman_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Penunjuk
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Penunjuk',
        'Penunjuk Beach',
        'Scenic beach in Kijal with rock formations and a relaxing atmosphere. Good for camping and enjoying the sea breeze.',
        'Kampung Pantai Penunjuk, 24100 Kijal, Terengganu',
        'https://maps.google.com/?q=4.3500,103.4833',
        4.3500, 103.4833,
        v_kemaman_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Old Cruise Ship Jetty Kijal (Old Iron Ore Jetty)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Old Cruise Ship Jetty Kijal',
        'Kijal Old Jetty Ruins',
        'Historical iron ore loading jetty ruins that offer a unique photography spot, especially at sunrise. Often referred to as "Iron Ore Loading Jetty".',
        '24210 Kijal, Terengganu',
        'https://maps.google.com/?q=4.3333,103.4833',
        4.3333, 103.4833,
        v_kemaman_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Kemasik
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Kemasik',
        'Kemasik Beach',
        'Iconic beach featuring a twin rock formation and a lagoon. One of the most photographed beaches in Terengganu. Clean water and golden sand.',
        'Kemasik, 24200 Kemaman, Terengganu',
        'https://maps.google.com/?q=4.4167,103.4500',
        4.4167, 103.4500,
        v_kemaman_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Restoran Tong Juan (Stuffed Crab)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Restoran Tong Juan (Stuffed Crab)',
        '东源酿蟹餐室',
        'Legendary restaurant famous for its Stuffed Crab (Ketam Sumbat). A must-visit for seafood lovers in Kemaman.',
        'K-117, Jalan Sulaimani, Chukai, 24000 Kemaman, Terengganu',
        'https://maps.google.com/?q=4.2350,103.4260',
        4.2350, 103.4260,
        v_kemaman_id,
        'Food',
        '{"monday": "11:30-15:30, 18:00-22:00", "tuesday": "11:30-15:30, 18:00-22:00", "wednesday": "11:30-15:30, 18:00-22:00", "thursday": "11:30-15:30, 18:00-22:00", "friday": "closed", "saturday": "11:30-15:30, 18:00-22:00", "sunday": "11:30-15:30, 18:00-22:00"}',
        'open'
    );

    -- Hai Peng Kopitiam
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Hai Peng Kopitiam',
        '海滨咖啡店',
        'Established in 1940, this authentic kopitiam is famous for its charcoal-roasted coffee, nasi dagang, and toast. A nostalgic stop.',
        '3753, Jalan Sulaimani, Chukai, 24000 Kemaman, Terengganu',
        'https://maps.google.com/?q=4.2345,103.4255',
        4.2345, 103.4255,
        v_kemaman_id,
        'Food',
        '{"monday": "06:30-18:00", "tuesday": "06:30-18:00", "wednesday": "06:30-18:00", "thursday": "06:30-18:00", "friday": "closed", "saturday": "06:30-18:00", "sunday": "06:30-18:00"}',
        'open'
    );

    -- Warung Aziz Satar
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Warung Aziz Satar',
        'Aziz Satar',
        'The best place to try Satar, a local delicacy of spiced fish paste wrapped in banana leaves and grilled.',
        'Jalan Kuala Kemaman, 24000 Chukai, Terengganu',
        'https://maps.google.com/?q=4.2100,103.4400',
        4.2100, 103.4400,
        v_kemaman_id,
        'Food',
        '{"monday": "09:00-19:00", "tuesday": "09:00-19:00", "wednesday": "09:00-19:00", "thursday": "09:00-19:00", "friday": "09:00-19:00", "saturday": "09:00-19:00", "sunday": "09:00-19:00"}',
        'open'
    );

    -- === DUNGUN SPOTS ===

    -- Terowong Bukit Tebuk
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Terowong Bukit Tebuk',
        '铁山隧道 (Bukit Tebuk Tunnel)',
        'Historic railway tunnel built in 1936 by Nippon Mining Company. A unique landmark in Dungun showcasing the iron ore mining history.',
        'Jalan Bukit Tebuk, Kampung Nibong, 23000 Kuala Dungun, Terengganu',
        'https://maps.google.com/?q=4.7740,103.4030',
        4.7740, 103.4030,
        v_dungun_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Teluk Bidara
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Teluk Bidara',
        '碧达拉湾海滩',
        'Beautiful bay with calm waters, swings, and a recreational park. Great for families and picnics. Located near Tanjung Jara Resort.',
        'Jalan Teluk Bidara, 23050 Kuala Dungun, Terengganu',
        'https://maps.google.com/?q=4.8150,103.4220',
        4.8150, 103.4220,
        v_dungun_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Batu Pelanduk
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Batu Pelanduk',
        '鼠鹿石海滩 (Pantai Batu Pelanduk)',
        'Scenic beach featuring unique rock formations resembling a mouse deer (pelanduk). Known for its white sands and calm atmosphere.',
        'Jalan Pantai Batu Pelanduk, 23000 Kuala Dungun, Terengganu',
        'https://maps.google.com/?q=4.8277,103.4167',
        4.8277, 103.4167,
        v_dungun_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Restoran C. B. Wee Sea Food
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Restoran C. B. Wee Sea Food',
        'C.B. Wee 海鲜餐馆',
        'Popular Chinese seafood restaurant near Tanjung Jara Resort. Known for fresh seafood and pork-free cooking.',
        'Jalan Dungun, 23000 Kuala Dungun, Terengganu',
        'https://maps.google.com/?q=4.8000,103.4200',
        4.8000, 103.4200,
        v_dungun_id,
        'Food',
        '{"monday": "11:00-15:00, 18:00-22:00", "tuesday": "11:00-15:00, 18:00-22:00", "wednesday": "11:00-15:00, 18:00-22:00", "thursday": "11:00-15:00, 18:00-22:00", "friday": "11:00-15:00, 18:00-22:00", "saturday": "11:00-15:00, 18:00-22:00", "sunday": "11:00-15:00, 18:00-22:00"}',
        'open'
    );

    -- === MARANG SPOTS ===

    -- Pantai Jambu Bongkok
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Jambu Bongkok',
        '椰林海滩 (Pantai Jambu Bongkok)',
        'A hidden gem known for its rows of coconut trees (Nyor Pata) and pristine white sandy beach. Popular for photography and its peaceful village atmosphere.',
        'Kampung Jambu Bongkok, 21610 Marang, Terengganu',
        'https://maps.google.com/?q=4.9500,103.3500',
        4.9500, 103.3500,
        v_marang_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Jeti Marang (Marang Jetty)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Jeti Marang (Marang Jetty)',
        '马江码头',
        'Main gateway to Pulau Kapas and Pulau Gemia. A bustling jetty area with boat services, local food stalls, and scenic river views.',
        'Marang Tourist Jetty, 21600 Marang, Terengganu',
        'https://maps.google.com/?q=5.2071,103.2053',
        5.2071, 103.2053,
        v_marang_id,
        'Sightseeing',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- Pulau Kapas
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pulau Kapas',
        '棉花岛 (Pulau Kapas)',
        'Idyllic island famous for its soft white sands (like cotton) and crystal-clear turquoise waters. Excellent for snorkeling and diving.',
        'Pulau Kapas, Marang, Terengganu',
        'https://maps.google.com/?q=5.2167,103.2667',
        5.2167, 103.2667,
        v_marang_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Taman Rekreasi Pulau Kekabu / Wave Breaker
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Taman Rekreasi Pulau Kekabu',
        '克卡布岛休闲公园 (Pulau Kekabu Park)',
        'A recreational park featuring a breakwater (Wave Breaker) where the river meets the sea. A popular spot for fishing, family outings, and sunrise views.',
        'Pulau Kekabu, 21600 Marang, Terengganu',
        'https://maps.google.com/?q=5.1950,103.2050',
        5.1950, 103.2050,
        v_marang_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- === SETIU SPOTS ===

    -- Region Creation for Setiu
    SELECT id INTO v_setiu_id FROM regions WHERE name = 'Setiu' AND parent_id = v_terengganu_id;
    IF v_setiu_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Setiu', '士兆', v_terengganu_id, 'setiu')
        RETURNING id INTO v_setiu_id;
        RAISE NOTICE 'Created new district: Setiu (%)', v_setiu_id;
    ELSE
        RAISE NOTICE 'Found existing district: Setiu (%)', v_setiu_id;
    END IF;

    -- Pantai Rhu Sepuluh
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Rhu Sepuluh',
        '鲁十海滩 (Pantai Rhu Sepuluh)',
        'Known for its rows of Casuarina (Rhu) trees and pristine white sands. A popular stop near Penarik for "celup tepung" (deep-fried seafood).',
        'Pantai Rhu Sepuluh, 22120 Setiu, Terengganu',
        'https://maps.app.goo.gl/aAgAMCpKq66ZpUDY6',
        5.5946, 102.8335,
        v_setiu_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- === BESUT SPOTS ===

    -- Region Creation for Besut
    SELECT id INTO v_besut_id FROM regions WHERE name = 'Besut' AND parent_id = v_terengganu_id;
    IF v_besut_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id, slug)
        VALUES ('Besut', '勿述', v_terengganu_id, 'besut')
        RETURNING id INTO v_besut_id;
        RAISE NOTICE 'Created new district: Besut (%)', v_besut_id;
    ELSE
        RAISE NOTICE 'Found existing district: Besut (%)', v_besut_id;
    END IF;

    -- Masjid Lapan Kubah
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Masjid Lapan Kubah',
        '八顶清真寺 (Masjid Lapan Kubah)',
        'Unique mosque featuring 8 colorful domes, resembling St. Basil''s Cathedral in Russia. A stunning architectural landmark in the middle of paddy fields.',
        'Kampung Lapan Kotak, 22000 Jerteh, Besut, Terengganu',
        'https://maps.app.goo.gl/WWHLQXmJ8CcKxDqN9',
        5.6950, 102.5020,
        v_besut_id,
        'Culture',
        '{"monday": "05:00-22:00", "tuesday": "05:00-22:00", "wednesday": "05:00-22:00", "thursday": "05:00-22:00", "friday": "05:00-22:00", "saturday": "05:00-22:00", "sunday": "05:00-22:00"}',
        'open'
    );

END $$;
