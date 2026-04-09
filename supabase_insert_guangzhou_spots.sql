-- Add Guangzhou spots
-- This script adds the country 'China', state 'Guangdong', city 'Guangzhou', and various spots.

DO $$
DECLARE
    v_guangdong_id INTEGER;
    v_guangzhou_id INTEGER;
BEGIN
    -- 1. Ensure Regions Exist
    -- Guangdong (State)
    SELECT id INTO v_guangdong_id FROM regions WHERE name = 'Guangdong' AND country = 'China';
    IF v_guangdong_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Guangdong', 
            '广东省', 
            'A coastal province in South China, known for its vibrant economy, Cantonese cuisine, and rich history.', 
            NULL, 
            'GD', 
            'China', 
            NULL,
            'guangdong'
        ) RETURNING id INTO v_guangdong_id;
    END IF;

    -- Guangzhou (City)
    SELECT id INTO v_guangzhou_id FROM regions WHERE name = 'Guangzhou' AND parent_id = v_guangdong_id;
    IF v_guangzhou_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Guangzhou', 
            '广州市', 
            'The capital city of Guangdong Province, also known as Canton, a major port and transportation hub.', 
            NULL, 
            'GZ', 
            'China', 
            v_guangdong_id,
            'guangzhou'
        ) RETURNING id INTO v_guangzhou_id;
    END IF;

    -- 2. Insert Spots
    
    -- Day 1 & 2
    
    -- 1. Xi Hua Lu Food Street (西华路美食街)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Xi Hua Lu Food Street') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Xi Hua Lu Food Street',
            '西华路美食街',
            'Famous food street with many authentic local eateries.',
            'Xi Hua Lu, Liwan District, Guangzhou, China',
            23.129, 113.245,
            'food',
            '', -- No specific GMaps URL provided, usually requires specific shop
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 2. Liuhua Lake Park (流花湖公园)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Liuhua Lake Park') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Liuhua Lake Park',
            '流花湖公园',
            'A large artificial lake park with beautiful scenery.',
            '100 Liuhua Road, Yuexiu District, Guangzhou, China',
            23.140, 113.248,
            'nature',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 3. Peasant Movement Institute (农讲所)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Peasant Movement Institute') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Peasant Movement Institute',
            '农讲所',
            'Historic site of the peasant movement institute.',
            '42 Zhongshan 4th Rd, Yuexiu District, Guangzhou, China',
            23.130, 113.275,
            'history',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 4. Beijing Road Pedestrian Street (北京路步行街)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Beijing Road Pedestrian Street') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Beijing Road Pedestrian Street',
            '北京路步行街',
            'Famous shopping street with ancient road ruins.',
            'Beijing Road, Yuexiu District, Guangzhou, China',
            23.125, 113.268,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 5. Dafo Temple (大佛寺)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Dafo Temple') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Dafo Temple',
            '大佛寺',
            'Big Buddha Temple, a buddhist temple with night lights.',
            '21 Huifu East Road, Yuexiu District, Guangzhou, China',
            23.123, 113.268,
            'culture',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 6. Dongshankou (东山口)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Dongshankou') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Dongshankou',
            '东山口',
            'Area with red-brick western-style houses and trendy shops.',
            'Dongshankou, Yuexiu District, Guangzhou, China',
            23.123, 113.292,
            'culture',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 7. Sacred Heart Cathedral (石室圣心大教堂)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Sacred Heart Cathedral') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Sacred Heart Cathedral',
            '石室圣心大教堂',
            'Gothic revival Roman Catholic cathedral.',
            '56 Yide Road, Yuexiu District, Guangzhou, China',
            23.116, 113.256,
            'culture',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 8. Yide Road (一德路)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Yide Road') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Yide Road',
            '一德路',
            'Famous for dried seafood and toy wholesale markets.',
            'Yide Road, Yuexiu District, Guangzhou, China',
            23.116, 113.254,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 9. Taikoo Cang Wharf (太古仓码头)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Taikoo Cang Wharf') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Taikoo Cang Wharf',
            '太古仓码头',
            'Revitalized wharf area with restaurants and bars.',
            '124 Gexin Road, Haizhu District, Guangzhou, China',
            23.097, 113.249,
            'entertainment',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 10. Shamian Island (沙面岛)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Shamian Island') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Shamian Island',
            '沙面岛',
            'Historic island with European colonial architecture.',
            'Shamian N St, Liwan District, Guangzhou, China',
            23.110, 113.240,
            'history',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- Day 3, 4, 5

    -- 11. Guangzhou Cultural & Arts Centre (广州市文化馆新馆)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Guangzhou Cultural & Arts Centre') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Guangzhou Cultural & Arts Centre',
            '广州市文化馆新馆',
            'New cultural landmark featuring Lingnan garden style.',
            '288 Xinjiao Middle Road, Haizhu District, Guangzhou, China',
            23.076, 113.315,
            'culture',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 12. Yong Qing Fang (永庆坊)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Yong Qing Fang') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Yong Qing Fang',
            '永庆坊',
            'Cultural district with Cantonese opera heritage.',
            '99 Enning Road, Liwan District, Guangzhou, China',
            23.117, 113.235,
            'culture',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 13. Shangxiajiu Pedestrian Street (上下九步行街)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Shangxiajiu Pedestrian Street') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Shangxiajiu Pedestrian Street',
            '上下九步行街',
            'Traditional commercial pedestrian street.',
            'Shangxiajiu, Liwan District, Guangzhou, China',
            23.115, 113.243,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 14. Xifang Dayuan (西坊大院)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Xifang Dayuan') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Xifang Dayuan',
            '西坊大院',
            'Creative park transformed from old factory buildings.',
            'No. 264, Huancheng West Road, Panyu District, Guangzhou, China',
            22.930, 113.360,
            'culture',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 15. Baomo Garden (宝墨园)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Baomo Garden') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Baomo Garden',
            '宝墨园',
            'Exquisite Lingnan style garden.',
            'Zini Village, Shawan Town, Panyu District, Guangzhou, China',
            22.890, 113.288,
            'nature',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 16. Shawan Ancient Town (沙湾古镇)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Shawan Ancient Town') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Shawan Ancient Town',
            '沙湾古镇',
            'Ancient town with rich folk culture.',
            'Shawan Town, Panyu District, Guangzhou, China',
            22.905, 113.340,
            'history',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- Day 6, 7

    -- 17. Yuntai Garden (云台花园)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Yuntai Garden') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Yuntai Garden',
            '云台花园',
            'Large landscape garden at the foot of Baiyun Mountain.',
            '801 Guangyuan Middle Road, Baiyun District, Guangzhou, China',
            23.155, 113.298,
            'nature',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 18. Fashion Tianhe (时尚天河)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Fashion Tianhe') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Fashion Tianhe',
            '时尚天河',
            'Underground shopping mall with unique themes.',
            '299 Tianhe Road, Tianhe District, Guangzhou, China',
            23.135, 113.325,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 19. Liuyun Community (六运小区)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Liuyun Community') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Liuyun Community',
            '六运小区',
            'Trendy residential community with cafes and shops.',
            'Tianhe South 1st Road, Tianhe District, Guangzhou, China',
            23.132, 113.325,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 20. Canton Tower (广州塔)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Canton Tower') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Canton Tower',
            '广州塔',
            'Iconic TV tower and landmark of Guangzhou.',
            '222 Yuejiang West Road, Haizhu District, Guangzhou, China',
            23.106, 113.324,
            'entertainment',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 21. Huangpu Ancient Port (黄埔古港)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Huangpu Ancient Port') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Huangpu Ancient Port',
            '黄埔古港',
            'Historic port with traditional snacks and museum.',
            'Shiji Village, Pazhou Street, Haizhu District, Guangzhou, China',
            23.090, 113.385,
            'history',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 22. SYSU Wharf (中大码头)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'SYSU Wharf') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'SYSU Wharf',
            '中大码头',
            'Ferry wharf near Sun Yat-sen University.',
            'Binjiang East Road, Haizhu District, Guangzhou, China',
            23.100, 113.296,
            'transport',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 23. Haixinsha (海心沙)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Haixinsha') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Haixinsha',
            '海心沙',
            'Island park, venue for the 2010 Asian Games opening ceremony.',
            'Haixinsha Island, Tianhe District, Guangzhou, China',
            23.113, 113.323,
            'nature',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- Day 8

    -- 24. Taikoo Hui (太古汇)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Taikoo Hui') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Taikoo Hui',
            '太古汇',
            'Luxury shopping mall.',
            '383 Tianhe Road, Tianhe District, Guangzhou, China',
            23.136, 113.330,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 25. Grandview Mall (正佳广场)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Grandview Mall') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Grandview Mall',
            '正佳广场',
            'Large shopping mall with aquarium.',
            '228 Tianhe Road, Tianhe District, Guangzhou, China',
            23.135, 113.327,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 26. Parc Central (天环广场)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Parc Central') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Parc Central',
            '天环广场',
            'Shopping mall with unique architecture.',
            '218 Tianhe Road, Tianhe District, Guangzhou, China',
            23.135, 113.325,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 27. Teemall (天河城)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Teemall') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Teemall',
            '天河城',
            'One of the first modern shopping malls in Guangzhou.',
            '208 Tianhe Road, Tianhe District, Guangzhou, China',
            23.135, 113.323,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

    -- 28. Kaisa Plaza (佳兆业广场)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kaisa Plaza') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Kaisa Plaza',
            '佳兆业广场',
            'Shopping and dining complex.',
            '191 Tiyu West Road, Tianhe District, Guangzhou, China',
            23.140, 113.321,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_guangzhou_id,
            'active'
        );
    END IF;

END $$;
