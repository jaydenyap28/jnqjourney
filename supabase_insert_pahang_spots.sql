-- SQL script to insert Pahang spots (Kuantan, Pekan, Rompin)
-- Handles region creation (Pahang state and districts) and spot insertion

-- 0. Ensure google_maps_url column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'google_maps_url') THEN
        ALTER TABLE locations ADD COLUMN google_maps_url TEXT;
    END IF;
END $$;

DO $$
DECLARE
    v_pahang_id bigint;
    v_kuantan_id bigint;
    v_pekan_id bigint;
    v_rompin_id bigint;
    v_spot_id bigint;
BEGIN
    -- 1. Get or Create 'Pahang' State Region
    SELECT id INTO v_pahang_id FROM regions WHERE name = 'Pahang' AND parent_id IS NULL;
    
    IF v_pahang_id IS NULL THEN
        INSERT INTO regions (name, name_cn, is_state)
        VALUES ('Pahang', '彭亨', true)
        RETURNING id INTO v_pahang_id;
        RAISE NOTICE 'Created new state region: Pahang (%)', v_pahang_id;
    ELSE
        RAISE NOTICE 'Found existing state region: Pahang (%)', v_pahang_id;
    END IF;

    -- 2. Get or Create Districts (Kuantan, Pekan, Rompin)
    
    -- Kuantan
    SELECT id INTO v_kuantan_id FROM regions WHERE name = 'Kuantan' AND parent_id = v_pahang_id;
    IF v_kuantan_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id)
        VALUES ('Kuantan', '关丹', v_pahang_id)
        RETURNING id INTO v_kuantan_id;
        RAISE NOTICE 'Created new district: Kuantan (%)', v_kuantan_id;
    ELSE
        RAISE NOTICE 'Found existing district: Kuantan (%)', v_kuantan_id;
    END IF;

    -- Pekan
    SELECT id INTO v_pekan_id FROM regions WHERE name = 'Pekan' AND parent_id = v_pahang_id;
    IF v_pekan_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id)
        VALUES ('Pekan', '北根', v_pahang_id)
        RETURNING id INTO v_pekan_id;
        RAISE NOTICE 'Created new district: Pekan (%)', v_pekan_id;
    ELSE
        RAISE NOTICE 'Found existing district: Pekan (%)', v_pekan_id;
    END IF;

    -- Rompin
    SELECT id INTO v_rompin_id FROM regions WHERE name = 'Rompin' AND parent_id = v_pahang_id;
    IF v_rompin_id IS NULL THEN
        INSERT INTO regions (name, name_cn, parent_id)
        VALUES ('Rompin', '云冰', v_pahang_id)
        RETURNING id INTO v_rompin_id;
        RAISE NOTICE 'Created new district: Rompin (%)', v_rompin_id;
    ELSE
        RAISE NOTICE 'Found existing district: Rompin (%)', v_rompin_id;
    END IF;

    -- 3. Insert Spots
    -- Note: Using correct region_id for each spot (Kuantan, Pekan, or Rompin)
    -- categories: 'Food', 'Nature', 'Sightseeing', 'Culture', 'Accommodation', 'Shopping'

    -- === ROMPIN SPOTS ===
    
    -- Jambatan Endau-Rompin
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Jambatan Endau-Rompin',
        '兴楼云冰大桥',
        'Bridge connecting Pahang and Johor, offering scenic river views.',
        'Mukah, Endau, 86900 Kuala Rompin, Pahang',
        'https://maps.app.goo.gl/H94h9uVyKd1yAreL9',
        2.656659, 103.621591,
        v_rompin_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Hiburan
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Hiburan',
        'Hiburan Beach',
        'Popular beach in Kuala Rompin, known for its casuarina trees and recreational activities. A hub for local events and food stalls.',
        'Jalan Pantai Hiburan, 26800 Kuala Rompin, Pahang',
        'https://maps.google.com/?q=2.8050,103.4850',
        2.8050, 103.4850,
        v_rompin_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- === PEKAN SPOTS ===

    -- Jambatan Cherok Paloh
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Jambatan Cherok Paloh',
        'Cherok Paloh Bridge',
        'Scenic bridge area in Pekan, popular for fishing and views.',
        'Kampung Cherok Paloh, 26610 Pekan, Pahang',
        'https://maps.app.goo.gl/FWTySsZBVewoaLwX8',
        3.500721, 103.390121,
        v_pekan_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Lagenda
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Lagenda',
        'Lagenda Beach',
        'Beautiful beach in Pekan, near the golf club.',
        'Jalan Kampung Tanjung Selangor, 26600 Pekan, Pahang',
        'https://maps.app.goo.gl/igwn2zSGQMNdL1oB9',
        3.56145, 103.43411,
        v_pekan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- === KUANTAN SPOTS ===

    -- Pantai Saujana Biru (Pantai Batu 16)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Saujana Biru (Pantai Batu 16)',
        'Saujana Biru Beach',
        'Serene beach spot in Kuantan.',
        'Pantai Batu 16, Jalan Kuantan-Kemaman, Kuantan, Pahang',
        'https://maps.app.goo.gl/vnoZ3VY9QVLALFDG6',
        3.9167, 103.3667, -- Approx for Batu 16
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- === SUNGAI LEMBING (KUANTAN) SPOTS ===
    
    -- Gua Charas (Sleeping Buddha Cave)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Gua Charas (Sleeping Buddha Cave)',
        '林明查拉斯洞 (卧佛洞)',
        'Limestone cave temple featuring a reclining Buddha statue. A spiritual site with stunning rock formations.',
        'Jalan Gua Charas, 26090 Kuantan, Pahang',
        'https://maps.app.goo.gl/H76FuYmpSWpjWgGu5',
        3.9056, 103.1481,
        v_kuantan_id,
        'Culture',
        '{"monday": "09:00-17:00", "tuesday": "09:00-17:00", "wednesday": "09:00-17:00", "thursday": "09:00-17:00", "friday": "09:00-17:00", "saturday": "09:00-17:00", "sunday": "09:00-17:00"}',
        'open'
    );

    -- Jia Chuan Ser Pu (Home Recipe)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Jia Chuan Ser Pu (Home Recipe)',
        '家传食谱',
        'Famous for smooth mountain water Taufufa and coconut biscuits. Located at the Morning Market.',
        'Sungai Lembing Morning Market, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/MiDK2dSJugGD1bbZ7',
        3.916967, 103.035283,
        v_kuantan_id,
        'Food',
        '{"monday": "06:00-12:00", "tuesday": "06:00-12:00", "wednesday": "06:00-12:00", "thursday": "06:00-12:00", "friday": "06:00-12:00", "saturday": "06:00-12:00", "sunday": "06:00-12:00"}',
        'open'
    );

    -- Riverside Palm Inn
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Riverside Palm Inn',
        '林明河畔度假村',
        'Resort located near the river, organizing trips to Rainbow Waterfall. Peaceful accommodation.',
        '331, Jalan Kolong Pahat, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/g3PS9pAQ7jNVB1Uf9',
        3.9180, 103.0360,
        v_kuantan_id,
        'Accommodation',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Rainbow Bridge (Jambatan Gantung)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Rainbow Bridge (Jambatan Gantung)',
        '彩虹吊桥',
        'Colorful hanging bridge connecting to Kampung Seberang. A photogenic spot over the river.',
        'Kampung Seberang, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/iEsDj1mDoorQEK2f9',
        3.9175, 103.0355,
        v_kuantan_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Kolong Pahat Hanging Bridge
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Kolong Pahat Hanging Bridge',
        '林明吊桥 (Kolong Pahat)',
        'Historical suspension bridge, over 100 years old. Connects the main road to Kampung Kolong Pahat.',
        'Kampung Kolong Pahat, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/mWTdh2nVMfZNmCdT8',
        3.9150, 103.0340,
        v_kuantan_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Iconic Big Tree
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Iconic Big Tree',
        '林明大树',
        'Majestic century-old tree, a beloved landmark of Sungai Lembing town center.',
        '231, Jalan Sungai Lembing, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/GvfvYyfHkY6M8un47',
        3.9165, 103.0350,
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Thean Hou Temple
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Thean Hou Temple',
        '林明马祖天后宫',
        'Temple dedicated to Mazu, Goddess of the Sea. Located near the market and Big Tree.',
        'Sungai Lembing, 26200 Pahang',
        'https://maps.app.goo.gl/vMy8XuEzZUcNCGNbA',
        3.9168, 103.0351,
        v_kuantan_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- Sungai Lembing Mining Restaurant
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Sungai Lembing Mining Restaurant',
        '林明矿场餐厅',
        'Popular restaurant serving local dishes in a historic setting.',
        '23, Jalan Sungai Lembing, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/K3pRbmcJctVBPeiR8',
        3.9172, 103.0358,
        v_kuantan_id,
        'Food',
        '{"monday": "11:00-21:00", "tuesday": "11:00-21:00", "wednesday": "11:00-21:00", "thursday": "11:00-21:00", "friday": "11:00-21:00", "saturday": "11:00-21:00", "sunday": "11:00-21:00"}',
        'open'
    );

    -- Muzium Sungai Lembing
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Muzium Sungai Lembing',
        '林明博物馆',
        'Historical museum located in the former mine manager''s residence, showcasing the tin mining history of Sungai Lembing.',
        'Jalan Kuantan - Sungai Lembing, Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/hG1y8jR1aX2bC3d49',
        3.9138152, 103.0322441,
        v_kuantan_id,
        'Culture',
        '{"monday": "09:00-17:00", "tuesday": "09:00-17:00", "wednesday": "09:00-17:00", "thursday": "09:00-17:00", "friday": "09:00-17:00", "saturday": "09:00-17:00", "sunday": "09:00-17:00"}',
        'open'
    );

    -- Pasir Puteri
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pasir Puteri',
        '公主沙滩',
        'Riverside picnic and recreation area with clear water. Formerly known as Pasir Kubur.',
        'Kampung Seberang Kuala Kenau, 26200 Sungai Lembing, Pahang',
        'https://www.google.com/maps/search/?api=1&query=Pasir+Puteri+Sungai+Lembing',
        3.9390, 103.0480,
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Bukit Panorama (Sunrise Hill)
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Bukit Panorama (Sunrise Hill)',
        '林明山 (全景山)',
        'Famous hiking spot for sunrise and sea of clouds views. Trailhead located behind the town market.',
        'Sungai Lembing, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/qTjiC5Qerx83q19H7',
        3.91537, 103.03665,
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Rainbow Waterfall
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Rainbow Waterfall',
        '林明彩虹瀑布',
        'Spectacular waterfall where rainbows form in the morning mist. Accessible only by 4WD from town.',
        'Sungai Lembing Town (4WD Pickup Point), 26200 Pahang',
        'https://maps.app.goo.gl/oPhQxJorwmPTH5Tk9',
        3.917015, 103.035158, -- Pickup point in town
        v_kuantan_id,
        'Nature',
        '{"monday": "06:00-13:00", "tuesday": "06:00-13:00", "wednesday": "06:00-13:00", "thursday": "06:00-13:00", "friday": "06:00-13:00", "saturday": "06:00-13:00", "sunday": "06:00-13:00"}',
        'open'
    );

    -- Sungai Lembing Mines
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Sungai Lembing Mines',
        '林明锡矿隧道',
        'Famous underground tin mines with tunnel tours. Explore the history of the largest underground tin mine in the world.',
        'Sungai Lembing, 26200 Sungai Lembing, Pahang',
        'https://maps.app.goo.gl/uXyZ2xZ1xZ2xZ3xZ4',
        3.916917, 103.034972,
        v_kuantan_id,
        'Sightseeing',
        '{"monday": "09:00-18:00", "tuesday": "09:00-18:00", "wednesday": "09:00-18:00", "thursday": "09:00-18:00", "friday": "09:00-18:00", "saturday": "09:00-18:00", "sunday": "09:00-18:00"}',
        'open'
    );

    -- Tien Lock coffee shop
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Tien Lock coffee shop',
        '天乐咖啡店',
        'Traditional coffee shop known for its Hainanese coffee and toast. Located on Jalan Besar.',
        'Jalan Besar, 25000 Kuantan, Pahang',
        'https://maps.app.goo.gl/265wG5HzyzMvsXL36',
        3.8077, 103.3260, -- Kuantan City Centre
        v_kuantan_id,
        'Food',
        '{"monday": "07:00-17:00", "tuesday": "07:00-17:00", "wednesday": "07:00-17:00", "thursday": "07:00-17:00", "friday": "07:00-17:00", "saturday": "07:00-17:00", "sunday": "07:00-17:00"}',
        'open'
    );

    -- Pahang Buddhist Association
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pahang Buddhist Association',
        '彭亨佛教会',
        'Beautiful Buddhist temple and association with a serene lake view.',
        'Lot 4004, Jalan Sungai Lembing, 25200 Kuantan, Pahang',
        'https://maps.app.goo.gl/Z9KxXXNWnzzaa6ks6',
        3.82347, 103.30977,
        v_kuantan_id,
        'Culture',
        '{"monday": "08:00-17:00", "tuesday": "08:00-17:00", "wednesday": "08:00-17:00", "thursday": "08:00-17:00", "friday": "08:00-17:00", "saturday": "08:00-17:00", "sunday": "08:00-17:00"}',
        'open'
    );

    -- Imperium Residence Kuantan
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Imperium Residence Kuantan',
        'Imperium Residence',
        'Waterfront residence and landmark in Kuantan.',
        'Jalan Tanjung Lumpur, 26060 Kuantan, Pahang',
        'https://maps.app.goo.gl/UxbG7nWrAaPMC7TE8',
        3.8000, 103.3333, -- Approx Tanjung Lumpur
        v_kuantan_id,
        'Accommodation',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- 888 Food Court
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        '888 Food Court',
        '888 美食中心',
        'Popular food court offering a variety of local hawker food.',
        'Lorong Seri Kuantan 21, 25250 Kuantan, Pahang',
        'https://maps.app.goo.gl/CiNYpWSgwvBQ6LNc7',
        3.8167, 103.3333, -- Approx
        v_kuantan_id,
        'Food',
        '{"monday": "07:00-22:30", "tuesday": "07:00-22:30", "wednesday": "07:00-22:30", "thursday": "07:00-22:30", "friday": "07:00-22:30", "saturday": "07:00-22:30", "sunday": "07:00-22:30"}',
        'open'
    );

    -- Kuantan Art Street
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Kuantan Art Street',
        '关丹艺术街',
        'Vibrant street featuring murals and street art celebrating local culture.',
        'Jalan Taman, 25000 Kuantan, Pahang',
        'https://maps.app.goo.gl/q1kcKciYgkVvWyFg7',
        3.8050, 103.3250,
        v_kuantan_id,
        'Culture',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Padang MBK 1
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Padang MBK 1 (Padang Depan Masjid Negeri)',
        'MBK 1 草场',
        'Public field located in front of the State Mosque, used for events and recreation.',
        'Jalan Bukit Ubi, Jalan Masjid, 25000 Kuantan, Pahang',
        'https://maps.app.goo.gl/TXNH7ihNkDAU1Bam8',
        3.8063138, 103.3263902,
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Lian Heng kopitiam
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Lian Heng kopitiam',
        '联兴海南茶室',
        'Traditional Hainanese kopitiam famous for coffee and toast. A local favorite.',
        'Jalan Besar, 25000 Kuantan, Pahang',
        'https://maps.app.goo.gl/7TKjg82eayNTB4oZ6',
        3.8077, 103.3260, -- Kuantan City Centre
        v_kuantan_id,
        'Food',
        '{"monday": "07:00-13:00", "tuesday": "07:00-13:00", "wednesday": "06:30-13:00", "thursday": "07:00-13:00", "friday": "07:00-13:00", "saturday": "07:00-16:00", "sunday": "07:00-16:00"}',
        'open'
    );

    -- Sungai Pandan Waterfall
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Sungai Pandan Waterfall',
        '潘丹河瀑布',
        'Spectacular waterfall and recreation area.',
        'Air Terjun Sungai Pandan, 26250 Kuantan, Pahang',
        'https://maps.app.goo.gl/xnbYTKP55yZDLzzv8',
        3.7833, 103.1500, -- Approx
        v_kuantan_id,
        'Nature',
        '{"monday": "09:00-17:00", "tuesday": "09:00-17:00", "wednesday": "09:00-17:00", "thursday": "09:00-17:00", "friday": "closed", "saturday": "09:00-18:00", "sunday": "09:00-18:00"}',
        'open'
    );

    -- Mohd Chan Restaurant
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Mohd Chan Restaurant @ Kuantan',
        'Mohd Chan 穆斯林中餐',
        'Halal Chinese cuisine restaurant.',
        'A-53, Jalan Tun Ismail 1, Sri Dagangan 2, 25000 Kuantan, Pahang',
        'https://maps.app.goo.gl/Z2FpBRZCRd9RyLNx5',
        3.8167, 103.3333, -- Approx
        v_kuantan_id,
        'Food',
        '{"monday": "11:00-23:00", "tuesday": "11:00-23:00", "wednesday": "11:00-23:00", "thursday": "11:00-23:00", "friday": "11:00-23:00", "saturday": "11:00-23:00", "sunday": "11:00-23:00"}',
        'open'
    );

    -- East Coast Mall
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'East Coast Mall',
        '东海岸广场',
        'Major shopping mall in Kuantan city center.',
        'Jalan Putra Square 6, Putra Square, 25200 Kuantan, Pahang',
        'https://maps.app.goo.gl/3SAUXMTuEZjuuQqt9',
        3.8183, 103.3267,
        v_kuantan_id,
        'Shopping',
        '{"monday": "10:00-22:00", "tuesday": "10:00-22:00", "wednesday": "10:00-22:00", "thursday": "10:00-22:00", "friday": "10:00-22:00", "saturday": "10:00-22:00", "sunday": "10:00-22:00"}',
        'open'
    );

    -- Teluk Cempedak
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Teluk Cempedak',
        '直落尖佩达海滩',
        'Famous beach in Kuantan with a boardwalk and monkeys.',
        'Teluk Cempedak, 25050 Kuantan, Pahang',
        'https://maps.app.goo.gl/XL4pHTqktFb2weYQ9',
        3.8117, 103.3750,
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Pantai Pelindung
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Pantai Pelindung',
        '柏林东海滩',
        'Quiet beach area north of Teluk Cempedak.',
        'Pantai Pelindung, 25050 Kuantan, Pahang',
        'https://maps.app.goo.gl/ENkQcPLt1RWQDx8i8',
        3.8250, 103.3833,
        v_kuantan_id,
        'Nature',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Ms Elliot at Hock Bee
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Ms Elliot at Hock Bee',
        'Ms Elliot @ Hock Bee',
        'Charming cafe in a historic building.',
        '10, Jalan Besar, 25000 Kuantan, Pahang',
        'https://maps.app.goo.gl/2aCAcjnYV74LjsLSA',
        3.8077, 103.3260,
        v_kuantan_id,
        'Food',
        '{"monday": "10:00-22:00", "tuesday": "10:00-22:00", "wednesday": "10:00-22:00", "thursday": "10:00-22:00", "friday": "10:00-22:00", "saturday": "10:00-22:00", "sunday": "10:00-22:00"}',
        'open'
    );

    -- Esplanade Kuantan
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Esplanade Kuantan',
        '关丹河畔公园',
        'Riverside park and promenade along the Kuantan River.',
        'Jalan Tanah Putih, 25100 Kuantan, Pahang',
        'https://maps.app.goo.gl/nhgnjTAKAV2Y3BzS8',
        3.8050, 103.3250,
        v_kuantan_id,
        'Sightseeing',
        '{"monday": "24 hours", "tuesday": "24 hours", "wednesday": "24 hours", "thursday": "24 hours", "friday": "24 hours", "saturday": "24 hours", "sunday": "24 hours"}',
        'open'
    );

    -- Ombok Cherating Surf Cafe
    INSERT INTO locations (name, name_cn, description, address, google_maps_url, latitude, longitude, region_id, category, opening_hours, status)
    VALUES (
        'Ombok Cherating Surf Cafe',
        'Ombok Cherating Surf Cafe',
        'Cozy surf cafe serving signature mango cheesecake (Kula Cakes), Ombok coffee, burgers, and pasta. Features a mini boutique selling surf gear and handmade jewelry.',
        'No 1006-1, Kedai Jalan Kemaman, Jalan Kampung Cherating Lama, Cherating, 26080 Kuantan, Pahang',
        'https://www.google.com/maps/place/Ombok+Cherating+Surf+Cafe/@4.1278,103.3934,17z/data=!3m1!4b1!4m6!3m5!1s0x31c8852fb80dc45f:0xed7b24501f6567e2!8m2!3d4.1278!4d103.3934!16s%2Fg%2F11b6y0_0_0',
        4.1278, 103.3934,
        v_kuantan_id,
        'Food',
        '{"monday": "closed", "tuesday": "10:00-17:00", "wednesday": "10:00-17:00", "thursday": "10:00-17:00", "friday": "10:00-17:00", "saturday": "10:00-17:00", "sunday": "10:00-17:00"}',
        'open'
    );

END $$;
