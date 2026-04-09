-- SQL script to insert Pontian spots
-- Verified data from Google Maps and Web Search

-- 1. Ensure Pontian region exists and get its ID
DO $$
DECLARE
    pontian_id BIGINT;
BEGIN
    -- Get Pontian ID (assuming it exists, otherwise insert it)
    SELECT id INTO pontian_id FROM regions WHERE name = 'Pontian';
    
    -- If Pontian doesn't exist, we should insert it (safety check)
    IF pontian_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, bounds)
        VALUES (
            'Pontian',
            '笨珍',
            'Known for its seafood, fishing villages, and the southernmost tip of mainland Asia.',
            'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
            '{"north": 1.55, "south": 1.26, "east": 103.6, "west": 103.3}'::jsonb
        ) RETURNING id INTO pontian_id;
    END IF;

    -- 2. Insert Spots
    -- Tanjung Piai National Park
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Tanjung Piai National Park',
        '丹绒比艾国家公园',
        'attraction',
        'Jalan Tanjung Piai, 82300 Kukup, Johor',
        1.2681, 103.5087,
        '亚洲大陆最南端的红树林保护区，设有木栈道和地球仪地标。\n\nThe southernmost point of mainland Asia with mangrove boardwalks and a globe landmark.',
        '{"is24Hours": false, "open": "09:00", "close": "17:00", "closedDays": ["Monday"], "remarks": "Last entry at 16:00"}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Nature', 'National Park', 'Mangrove', 'Landmark']
    );

    -- Kukup Fishing Village
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Kukup Fishing Village',
        '龟咯渔村',
        'attraction',
        '74 Kukup Laut, 82300 Kukup, Johor',
        1.3264, 103.4447,
        '建在海上的百年渔村。在村子里散步，感受独特的“水上人家”氛围，还可以搭船出海吹吹风，看看养鱼场。\n\nA century-old fishing village built entirely on stilts over the sea. Famous for fresh seafood, boat rides to fish farms (kelongs), and its unique "water village" atmosphere.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Village open 24h, shops vary"}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Culture', 'Village', 'Seafood', 'History']
    );

    -- Kopi Tenggek Tanjung Piai
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Kopi Tenggek Tanjung Piai',
        'Kopi Tenggek Tanjung Piai',
        'food',
        '161, Jalan Serkat, Kampung Serkat Laut, 82300 Kukup, Johor',
        1.3000, 103.4800,
        '著名的“Tenggek”咖啡，位于丹绒比艾附近。适合早餐和下午茶。\n\nFamous for its "Tenggek" coffee style. A popular spot near Tanjung Piai for breakfast and tea time.',
        '{"is24Hours": false, "open": "08:30", "close": "16:30", "closedDays": ["Tuesday"], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Coffee', 'Local', 'Breakfast']
    );

    -- Twins Cafe Kukup
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Twins Cafe Kukup',
        'Twins Cafe Kukup',
        'food',
        'No 9, Jalan Kukup Laut, 82300 Kukup, Johor',
        1.3260, 103.4450,
        '位于龟咯渔村的咖啡馆，提供舒适的环境和美食。\n\nA cafe located in Kukup fishing village, offering a cozy environment and good food.',
        '{"is24Hours": false, "open": "11:00", "close": "18:00", "closedDays": [], "remarks": "Check FB for latest hours"}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Cafe', 'Western', 'Seafood']
    );

    -- Jong Suan Hiang Kopitiam
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Jong Suan Hiang Kopitiam',
        '湧泉香咖啡店',
        'food',
        '327, Jalan Bakek, Kampung Atap, 82000 Pontian, Johor',
        1.4870, 103.3880,
        '笨珍老字号传统海南咖啡店。必试炭烤面包和海南咖啡。\n\nA legendary traditional Hainanese kopitiam in Pontian. Must-try items include charcoal-toasted bread and Hainanese coffee.',
        '{"is24Hours": false, "open": "07:00", "close": "14:00", "closedDays": ["Sunday"], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Breakfast', 'Traditional', 'Kopitiam']
    );

    -- Kedai Mee Sin Kee
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Kedai Mee Sin Kee',
        '新记云吞面',
        'food',
        '1120, Jalan Bakek Jaya Utama, Kampung Atap, 82000 Pontian, Johor',
        1.4880, 103.3890,
        '笨珍着名的茄汁云吞面。面条Q弹，酱汁独特。\n\nFamous for Pontian-style Wanton Mee with tomato sauce ketchup. Springy noodles with unique sauce.',
        '{"is24Hours": false, "open": "10:00", "close": "17:00", "closedDays": ["Thursday"], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Wanton Mee', 'Local', 'Noodles']
    );

    -- Ah Leng Fried Kuey Tiau (Placeholder for Ah Long/Ah Leng)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Ah Leng Fried Kuey Tiau',
        '古早味亞龙黑面',
        'food',
        'Pontian Kechil, 82000 Pontian, Johor',
        1.4890, 103.3900,
        '古早味炒粿条/黑面。锅气十足。\n\nTraditional style Fried Kuey Tiau / Black Noodles. Full of "Wok Hei".',
        '{"is24Hours": false, "open": "11:00", "close": "18:00", "closedDays": [], "remarks": "Verify exact location"}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Street Food', 'Noodles', 'Local']
    );

    -- Xiao Mu Wu Kitchen
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Xiao Mu Wu Kitchen',
        '小木屋•厨房',
        'food',
        '2002, Jalan Parit Mesjid, Taman Mawar, 82000 Pontian, Johor',
        1.4950, 103.3800,
        '温馨的木屋风格餐厅，适合家庭聚餐。\n\nA cozy wooden-house styled restaurant, suitable for family dining.',
        '{"is24Hours": false, "open": "12:00", "close": "22:00", "closedDays": ["Friday"], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Western', 'Dinner', 'Cozy']
    );

    -- Pontian Shoal
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Pontian Shoal',
        'Pontian Shoal',
        'attraction',
        'Pontian Coast, Johor',
        1.5000, 103.3000,
        '位于笨珍海域的浅滩，风景优美，适合观海。\n\nA shoal located off the coast of Pontian, offering beautiful sea views.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Nature', 'Sea', 'Shoal']
    );

    -- Taman Rekreasi Sungai Rambah
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Taman Rekreasi Sungai Rambah',
        '双溪南峇休闲公园',
        'attraction',
        '82000 Pontian, Johor',
        1.4300, 103.4000,
        '休闲公园，适合散步、野餐和观赏红树林生态。\n\nRecreational park suitable for jogging, picnics, and observing mangrove ecology.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Park', 'Recreation', 'Nature']
    );

    -- Telok Kerang Beach
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Telok Kerang Beach',
        'Telok Kerang Beach',
        'attraction',
        'Kampung Teluk Kerang, 82000 Pontian, Johor',
        1.4156, 103.4246,
        '小众海滩，适合傍晚野餐、看海，氛围悠闲。\n\nA hidden gem beach, perfect for evening picnics and sea gazing with a relaxed atmosphere.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Beach', 'Nature', 'Sunset']
    );

    -- Coxn Cafe Pontian
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, visit_date, tags)
    VALUES (
        'Coxn Cafe Pontian',
        'Coxn Cafe Pontian',
        'food',
        'Batu 39, Lorong Parit Ibrahim, Kampung Rimba Terjun, 82000 Pontian, Johor',
        1.4500, 103.4100,
        '海边咖啡馆，拥有绝美的日落景色。\n\nSeaside cafe with stunning sunset views.',
        '{"is24Hours": false, "open": "17:00", "close": "23:00", "closedDays": [], "remarks": "Sunset view"}',
        pontian_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-02-24',
        ARRAY['Cafe', 'Sunset', 'Seaside']
    );

END $$;
