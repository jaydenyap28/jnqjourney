-- SQL script to insert Bentong spots
-- Data verified from user input and web search

-- 1. Ensure Bentong region exists and get its ID
DO $$
DECLARE
    bentong_id BIGINT;
BEGIN
    -- Get Bentong ID (assuming it exists, otherwise insert it)
    SELECT id INTO bentong_id FROM regions WHERE name = 'Bentong';
    
    -- If Bentong doesn't exist, we should insert it
    IF bentong_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, bounds)
        VALUES (
            'Bentong',
            '文冬',
            'A historical town famous for its ginger, durian, and surrounding nature retreats like Bukit Tinggi and Janda Baik.',
            'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
            '{"north": 3.6, "south": 3.3, "east": 102.0, "west": 101.7}'::jsonb
        ) RETURNING id INTO bentong_id;
    END IF;

    -- 2. Insert Spots
    -- 彭亨文冬旧玻璃口财神庙 (Old Glass Mouth Wealth God Temple)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Old Glass Mouth Wealth God Temple',
        '彭亨文冬旧玻璃口财神庙',
        'attraction',
        'No. 94, Kg. Ulu Perting, 28700, Bentong, Pahang',
        3.5186, 101.9023, -- Precise coordinate
        '彭亨文冬玻璃口新村历史悠久的华人财神庙，香火鼎盛，祈求财运亨通。\n\nA historic Chinese temple in Glass Mouth New Village, Bentong, known for its strong incense and prayers for prosperity.',
        '{"is24Hours": false, "open": "08:00", "close": "18:00", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Temple', 'Culture', 'History']
    );

    -- 文冬文化馆 (Bentong Gallery)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Bentong Gallery',
        '文冬文化馆',
        'attraction',
        '17-18, Jalan Loke Yew, 28700 Bentong, Pahang',
        3.5220, 101.9070,
        '展示文冬早期发展的历史，重点介绍开埠功臣陆佑的贡献，馆内设有咖啡厅，免费入场。\n\nExhibits the early history of Bentong, focusing on the contributions of Loke Yew. Includes a cafe and free admission.',
        '{"is24Hours": false, "open": "09:00", "close": "18:00", "closedDays": ["Tuesday"], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['History', 'Museum', 'Culture']
    );

    -- 日本村 (Japanese Village)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Japanese Village',
        '日本村',
        'attraction',
        'KM 48, Persimpangan Bertingkat, Lebuhraya Karak, 28750 Bukit Tinggi, Pahang',
        3.4200, 101.8400,
        '位于Colmar Tropicale园区内（需购买入场门票）。掩映在绿林中的日式庭院，让你仿佛置身日本的小村落，有和服出租，穿上和服打卡超出片。\n\nLocated within Colmar Tropicale (admission ticket required). A Japanese-style garden hidden in the green forest, offering kimono rentals for photos.',
        '{"is24Hours": false, "open": "10:00", "close": "17:00", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Garden', 'Nature', 'Photography']
    );

    -- Colmar Tropicale法国村
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Colmar Tropicale',
        'Colmar Tropicale法国村',
        'attraction',
        'Bukit Tinggi, 28750 Bentong, Pahang',
        3.4042, 101.8394,
        '藏身Bukit Tinggi的欧式童话小镇，仿法国科尔马镇建造，彩色木筋屋与石板路打造梦幻欧洲风情。\n\nA French-themed village in Bukit Tinggi, modeled after Colmar, France, featuring colorful timber-framed houses and cobblestone streets.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open all day"}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Architecture', 'Resort', 'Photography']
    );

    -- 文冬情人瀑布 (Chamang Waterfall)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Chamang Waterfall',
        '文冬情人瀑布',
        'attraction',
        'Jalan Chamang, 28700 Bentong, Pahang',
        3.5090, 101.8590,
        '文冬蕞受欢迎的天然瀑布，瀑布水势澎湃，是本地人消暑的首选地点。\n\nBentong''s most popular natural waterfall, known for its powerful currents and as a favorite local cooling spot.',
        '{"is24Hours": false, "open": "09:00", "close": "17:00", "closedDays": [], "remarks": "雨季期间或大雨后可能关闭，以策安全。（Highly dangerous during heavy rain due to flash floods）"}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Nature', 'Waterfall', 'Recreation']
    );

    -- 克切拉禅修林 (Kechara Forest Retreat)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Kechara Forest Retreat',
        '克切拉禅修林',
        'attraction',
        'Lot 3189, Jalan Chamang，28700 Bentong, Pahang',
        3.5400, 101.8800,
        '隐逸在彭亨文冬群山中的藏传佛教静修圣地，结合自然疗愈与禅修文化，提供远离尘嚣的心灵净化体验。\n\nA Tibetan Buddhist retreat nestled in the hills of Bentong, offering spiritual healing and meditation experiences.',
        '{"is24Hours": false, "open": "10:00", "close": "17:00", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Spiritual', 'Meditation', 'Temple']
    );

    -- 溏记海南茶室 (Thong Kee)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Thong Kee Kopitiam',
        '溏记海南茶室',
        'food',
        'No. 4, Jalan Chui Yin, 28700 Bentong, Pahang',
        3.5220, 101.9070,
        '知名老字号咖啡店，主打独特的1+1咖啡茶混合饮品，以及香脆的火腿芝士牛角包和自制咖椰吐司。\n\nA famous heritage kopitiam known for its unique 1+1 (coffee+tea) drink, crispy ham & cheese croissants, and homemade kaya toast.',
        '{"is24Hours": false, "open": "07:00", "close": "16:30", "closedDays": [], "remarks": "Croissants usually sold out before noon"}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Breakfast', 'Kopitiam', 'Local']
    );

    -- Lemang To’ki
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Lemang To’ki',
        'Lemang To’ki',
        'food',
        'Batu 2, Jalan Tras, 28700 Bentong, Pahang',
        3.5350, 101.9000,
        '以炭烤竹筒饭搭配香辣仁当鸡和牛肉闻名，使用新鲜竹筒与椰浆饭炭火慢烤，超香~\n\nFamous for charcoal-grilled Lemang paired with spicy Chicken or Beef Rendang.',
        '{"is24Hours": false, "open": "08:00", "close": "19:45", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Malay Food', 'Lunch', 'Local']
    );

    -- 莫大妈豆腐 (Tauhu Auntie Mok)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Tauhu Auntie Mok',
        '莫大妈豆腐',
        'food',
        '90，Jalan Pasar, 28700 Bentong, Pahang',
        3.5210, 101.9060,
        '位于文冬老街，以嫩滑的姜糖豆腐花闻名，也有售卖多种豆腐卜，红豆冰和冰淇淋等等。\n\nLocated on Bentong Old Street, famous for its silky Tau Fu Fah with ginger syrup, Tofu Puffs, and ABC.',
        '{"is24Hours": false, "open": "06:00", "close": "16:00", "closedDays": ["Wednesday"], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Dessert', 'Snack', 'Local']
    );

    -- 桃源谷美食 (Restoran Wonderland Valley)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Restoran Wonderland Valley',
        '桃源谷美食',
        'food',
        'Lot 9253, Kampung Bukit Tinggi, 28750 Bentong, Pahang',
        3.3551, 101.8214,
        '位于云顶山脚下的中式煮炒餐馆，餐馆设立在河边，价格公道，食物味道不错。\n\nA Chinese restaurant located at the foot of Genting Highlands, set by the river with reasonable prices and good food.',
        '{"is24Hours": false, "open": "11:30", "close": "20:30", "closedDays": ["Tuesday"], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Chinese', 'Dinner', 'River View']
    );

    -- Tumike Hotel Bentong
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Tumike Hotel Bentong',
        'Tumike Hotel Bentong',
        'accommodation',
        'P.6-G, Jalan MG3, Pusat Perniagaan Mutiaramas Gemilang, 28700 Bentong, Pahang',
        3.5100, 101.9150,
        '距离市中心很近，酒店设立在新区有很多停车位。房间整洁度OK，性价格高。\n\nLocated near the town center in a new area with ample parking. Clean rooms and high value for money.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Check-in 14:00, Check-out 12:00"}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Hotel', 'Accommodation', 'Budget']
    );

    -- Extra Spots from Links
    
    -- Chow Sun Yuk Cheong Fun (周新旭猪肠粉)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Chow Sun Yuk Cheong Fun',
        '周新旭猪肠粉',
        'food',
        'Jalan Wayang / Jalan Chui Yin Intersection, Bentong, Pahang',
        3.5225, 101.9075,
        'Famous local Chee Cheong Fun stall known for its smooth texture and sauces.',
        '{"is24Hours": false, "open": "11:00", "close": "15:00", "closedDays": [], "remarks": "Until sold out"}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Street Food', 'Breakfast', 'Local']
    );

    -- Dataran Bentong
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Dataran Bentong',
        'Dataran Bentong',
        'attraction',
        'Jalan Chui Yin, Bentong Town, Pahang',
        3.5230, 101.9080,
        'Bentong Town Square, a popular spot for locals to gather and for events.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Square', 'Landmark', 'Public Space']
    );

    -- Taman Pinggiran Sungai Marong
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Taman Pinggiran Sungai Marong',
        'Taman Pinggiran Sungai Marong',
        'attraction',
        'Kampung Sungai Marong, Bentong, Pahang',
        3.5250, 101.9100,
        'A scenic riverside park suitable for jogging and evening walks.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Park', 'Nature', 'Recreation']
    );

    -- Big House Restaurant (大屋美食阁)
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Big House Restaurant',
        '大屋美食阁',
        'food',
        'Kg Kemansur, Bentong, Pahang',
        3.5200, 101.9050,
        'Large food court style restaurant offering a variety of local hawker food.',
        '{"is24Hours": false, "open": "11:00", "close": "23:00", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Food Court', 'Dinner', 'Local']
    );

    -- Lilla Hilltop Retreat
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Lilla Hilltop Retreat',
        'Lilla Hilltop Retreat',
        'accommodation',
        'Lor Seri Dinar, Kampung Janda Baik, 28750 Bentong, Pahang',
        3.3200, 101.8700,
        'A peaceful hilltop retreat in Janda Baik, perfect for nature lovers and group gatherings.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Resort', 'Nature', 'Staycation']
    );

    -- Figgy’s Cafe
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, images, image_url, tags)
    VALUES (
        'Figgy’s Cafe',
        'Figgy’s Cafe',
        'food',
        'PT 20266 Sg. Panjang Kg. Cheringin, Kampung Janda Baik, Pahang',
        3.3100, 101.8600,
        'A cafe in Janda Baik offering food and drinks in a garden setting.',
        '{"is24Hours": false, "open": "10:00", "close": "18:00", "closedDays": [], "remarks": ""}',
        bentong_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        ARRAY['Cafe', 'Nature', 'Relax']
    );

END $$;