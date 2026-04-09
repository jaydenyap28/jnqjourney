-- Add Sarawak spots
-- This script adds the country 'Malaysia', state 'Sarawak', city 'Kuching', and 12 spots.

DO $$
DECLARE
    v_sarawak_id INTEGER;
    v_kuching_id INTEGER;
BEGIN
    -- 1. Ensure Regions Exist
    -- Sarawak (State)
    SELECT id INTO v_sarawak_id FROM regions WHERE name = 'Sarawak' AND country = 'Malaysia';
    IF v_sarawak_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Sarawak', 
            '砂拉越', 
            'The largest state in Malaysia, known for its rugged, dense rainforest, biodiverse wildlife, and indigenous culture.', 
            NULL, 
            'SWK', 
            'Malaysia', 
            NULL,
            'sarawak'
        ) RETURNING id INTO v_sarawak_id;
    END IF;

    -- Kuching (City)
    SELECT id INTO v_kuching_id FROM regions WHERE name = 'Kuching' AND parent_id = v_sarawak_id;
    IF v_kuching_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Kuching', 
            '古晋', 
            'The capital city of Sarawak, known for its bustling waterfront, colonial architecture, and cat statues.', 
            NULL, 
            'KCH', 
            'Malaysia', 
            v_sarawak_id,
            'kuching'
        ) RETURNING id INTO v_kuching_id;
    END IF;

    -- 2. Insert Spots
    
    -- 1. Ming Ming Food Court (明明美食阁)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Ming Ming Food Court') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Ming Ming Food Court',
            '明明美食阁',
            '探寻地道美食，满足味蕾的同时不伤荷包',
            'Bau, Kuching, Sarawak, Malaysia',
            1.4172, 110.1561, -- Approx Bau town
            'food',
            'https://maps.app.goo.gl/uqGzDeeYtrx8maBr9',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 2. Ceylonese Restaurant
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Ceylonese Restaurant') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Ceylonese Restaurant',
            NULL,
            '尝试Cheese Naan，芝士爱好者必尝试',
            '22 & 23, Jalan Green Hill, 93250 Kuching, Sarawak',
            1.5566, 110.3475,
            'food',
            'https://maps.app.goo.gl/uQSDJEg1hzk5xHVG6',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 3. Nam Joo (南儒)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Nam Joo') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Nam Joo',
            '南儒',
            '结合现代与复古风格的咖啡厅，旧时代场景打卡出片，价格合理',
            '21, Gambier Road, Kuching, Sarawak',
            1.5601, 110.3441,
            'food',
            'https://maps.app.goo.gl/soJiPrTjwG31q3aVA',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 4. Kantin at The Granary
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kantin at The Granary') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Kantin at The Granary',
            NULL,
            '舒适的用餐环境，食物和饮料味道都很不错',
            '23 Wayang Street, Kuching, Sarawak',
            1.5583, 110.3468,
            'food',
            'https://maps.app.goo.gl/nBnnYSv93oWdENM7A',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 5. Commons
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Commons') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Commons',
            NULL,
            '提供正餐和诱人茶点，环境宜人，适合庆祝特殊时刻',
            'The Old Court House, Jalan Tun Abang Haji Openg, 93000 Kuching, Sarawak',
            1.5594, 110.3450,
            'food',
            'https://maps.app.goo.gl/USctDpqy7cWjun4PA',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 6. Choon Hui Cafe (泉春茶室)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Choon Hui Cafe') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Choon Hui Cafe',
            '泉春茶室',
            '古晋平价早餐店，品味地道砂拉越叻沙的香醇',
            '34, Jalan Ban Hock, 93100 Kuching, Sarawak',
            1.5532, 110.3555,
            'food',
            'https://maps.app.goo.gl/PbuHCuPGKV5YxdMs5',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 7. Black Bean Coffee (黑豆子咖啡)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Black Bean Coffee') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Black Bean Coffee',
            '黑豆子咖啡',
            '提供多款咖啡选择，是咖啡爱好者的天堂',
            'No.87, Ewe Hai St (Carpenter St), 93000 Kuching, Sarawak',
            1.5585, 110.3462,
            'food',
            'https://maps.app.goo.gl/vT4zsZkh1K53e1m77',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 8. Aladdin Chicken Rice (阿拉丁神灯鸡饭)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Aladdin Chicken Rice') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Aladdin Chicken Rice',
            '阿拉丁神灯鸡饭',
            '无论是炸还是烤的鸡饭都充满诱人香气，价格亲民',
            '23, Lebuh Carpenter, 93000 Kuching, Sarawak',
            1.5587, 110.3458,
            'food',
            'https://maps.app.goo.gl/MmVSCdnp2fjEj2Q69',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 9. Abba Paradise (阿爸乐园)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Abba Paradise') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Abba Paradise',
            '阿爸乐园',
            '位于大自然怀抱中的复式树屋，提供宽敞的公共区域，是远离城市喧嚣的理想之地',
            'Bau, Kuching, Sarawak',
            1.383, 110.133, -- Approx Bau nature area
            'nature',
            'https://maps.app.goo.gl/T7ZibcDWjdzqd2zP9',
            v_kuching_id,
            'active'
        );
    END IF;

    -- 10. Meritin Hotel
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Meritin Hotel') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Meritin Hotel',
            NULL,
            '坐落于市中心，价格亲民，早餐丰盛，为你的行程提供便利. 预订: https://invol.co/clkesxs',
            'Lot 315, Jalan Padungan, Kuching, Sarawak',
            1.5535, 110.3582,
            'accommodation',
            NULL, -- User provided booking link only
            v_kuching_id,
            'active'
        );
    END IF;

    -- 11. The Culvert
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'The Culvert') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'The Culvert',
            NULL,
            '享受海边度假村的宁静，感受住在水管中的别致体验. 预订: https://invol.co/clkesy7',
            'Lot 285, Off Jalan Sultan Tengah, Block 2, Salak Land District, Damai / Santubong, Kuching',
            1.733, 110.316,
            'accommodation',
            NULL, -- User provided booking link only
            v_kuching_id,
            'active'
        );
    END IF;

    -- 12. The Marian Boutique Lodging House
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'The Marian Boutique Lodging House') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'The Marian Boutique Lodging House',
            NULL,
            '地理位置优越，复古建筑和装饰，是摄影爱好者的绝佳选择. 预订: https://invol.co/clkesz8',
            '25 & 27, Wayang Street, 93000 Kuching, Sarawak',
            1.5583, 110.3468,
            'accommodation',
            NULL, -- User provided booking link only
            v_kuching_id,
            'active'
        );
    END IF;

END $$;
