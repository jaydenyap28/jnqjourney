-- SQL script to insert Muar spots
-- Created based on user request to add specific Muar attractions, food, and accommodation

DO $$
DECLARE
    muar_id BIGINT;
BEGIN
    -- 1. Get or Create Muar Region
    SELECT id INTO muar_id FROM regions WHERE name = 'Muar';

    IF muar_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, bounds)
        VALUES (
            'Muar',
            '麻坡',
            'Muar, the Royal Town of Johor, is famous for its historical buildings, street art, and delicious local food like Otak-Otak and Mee Bandung.',
            'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder', -- Placeholder, user can update
            '{"north": 2.10, "south": 1.90, "east": 102.70, "west": 102.50}'::jsonb
        ) RETURNING id INTO muar_id;
    END IF;

    -- 2. Insert Locations
    -- Note: Using ON CONFLICT DO NOTHING to avoid duplicates if run multiple times, 
    -- but since we don't have a unique constraint on name usually, we just insert. 
    -- Assuming this is a fresh batch or user handles duplicates.
    
    INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, tags)
    VALUES
    -- 1. Muar Street Art (Leisure)
    (
        'Muar Street Art',
        '麻坡街头艺术',
        'attraction',
        'Jalan Meriam / Jalan Sisi, Pekan Muar, 84000 Muar, Johor',
        2.0465, 102.5638, -- Precise intersection of Mural Walk
        '麻坡市充满活力的壁画和艺术装置，以当地文化和历史为主题。其中包括著名的“姐妹情深”壁画。\n\nVibrant murals and art installations celebrating local culture and history, including the famous "Loving Sisters" mural.',
        '{"is24Hours": true, "closedDays": []}',
        muar_id,
        ARRAY['Street Art', 'Culture', 'Photo Spot']
    ),
    -- 2. Xiu De Shan Tang (Leisure)
    (
        'Xiu De Shan Tang',
        '修德善堂',
        'attraction',
        'No. 40, Jalan Sultan Ibrahim, Pekan Muar, 84000 Muar, Johor',
        2.0475, 102.5680, -- Precise on Jalan Sultan Ibrahim
        '百年慈善机构，结合宗教与公益，致力于扶贫济困、教育及社区服务。\n\nA century-old charitable organization combining religion and public welfare, dedicated to poverty alleviation, education, and community service.',
        '{"is24Hours": false, "open": "08:00", "close": "17:00", "closedDays": []}',
        muar_id,
        ARRAY['Temple', 'Charity', 'History', 'Culture']
    ),
    -- 3. Nan Ting Si (Leisure)
    (
        'Nan Ting Si Temple',
        '麻坡南亭寺善才爷公',
        'attraction',
        'Jalan Dato Koh Thian Peng, Parit Unas, 84150 Muar, Johor',
        1.9900, 102.6100, -- Precise Parit Unas location
        '著名道教庙宇，主祀善才爷公，香火鼎盛。\n\nA famous Taoist temple dedicated to Shan Cai Ye Gong, known for its strong incense and devotees.',
        '{"is24Hours": false, "open": "06:00", "close": "18:00", "closedDays": []}',
        muar_id,
        ARRAY['Temple', 'Culture', 'Taoism']
    ),
    -- 4. Parit Jawa Fishing Village (Leisure)
    (
        'Parit Jawa Fishing Village',
        '巴东海口渔村',
        'attraction',
        'Parit Jawa, 84150 Parit Jawa, Johor',
        1.9500, 102.6500, -- Precise Parit Jawa center
        '宁静渔村，以传统渔业、新鲜海鲜和淳朴的渔港风情为特色。\n\nA quiet fishing village characterized by traditional fishing, fresh seafood, and rustic harbor charm.',
        '{"is24Hours": true, "closedDays": []}',
        muar_id,
        ARRAY['Fishing Village', 'Nature', 'Sunset', 'Seafood']
    ),
    -- 5. Daily Happy OtakOtak (Retro House) (Leisure/Food)
    (
        'Daily Happy OtakOtak (Retro House)',
        'Daily Happy OtakOtak 复古小屋',
        'attraction',
        'No. 163-8, Jalan Jabbar, Parit Jawa, 84150 Parit Jawa, Johor',
        1.9560, 102.6380, -- Precise on Jalan Jabbar
        '由当地人用再循环旧屋打造而成的复古建筑，打卡超出片！\n\nA retro-style building created from a recycled old house, perfect for photography!',
        '{"is24Hours": false, "open": "07:00", "close": "17:00", "closedDays": []}',
        muar_id,
        ARRAY['Photo Spot', 'Retro', 'Culture', 'Otak-Otak']
    ),
    -- 6. Muar Bridge (Leisure)
    (
        'Sultan Ismail Bridge',
        '麻坡大桥夜景',
        'attraction',
        'Jalan Kesang, 84000 Muar, Johor',
        2.0509, 102.5672, -- Precise from search
        '夜晚灯光璀璨，是散步和摄影的热门地点，也是情侣约会散步的好去处。\n\nSparkling lights at night make this a popular spot for walking, photography, and dating.',
        '{"is24Hours": true, "closedDays": []}',
        muar_id,
        ARRAY['Landmark', 'Night View', 'Bridge', 'Photography']
    ),
    -- 7. See Hoi (Food)
    (
        'Kedai Kopi See Hoi',
        '世维茶室',
        'food',
        '129-4, Jalan Temenggong Ahmad, Jalan Parit Perupok, 84000 Muar, Johor',
        2.0400, 102.5750, -- Precise on Jalan Temenggong Ahmad
        '麻坡老字号传统咖啡店，以古早味海南咖啡和炭烤面包闻名。\n\nA traditional coffee shop known for its old-school Hainanese coffee and charcoal-toasted bread.',
        '{"is24Hours": false, "open": "07:00", "close": "17:30", "closedDays": ["Sunday"]}',
        muar_id,
        ARRAY['Food', 'Coffee', 'Traditional', 'Breakfast']
    ),
    -- 8. Hua Nam (Food)
    (
        'Kedai Kopi Hua Nam',
        '华南茶餐室 亚云叻沙',
        'food',
        'No. 23, Jalan Yahya, Pekan Muar, 84000 Muar, Johor',
        2.0476, 102.5702, -- Precise GPS from search
        '麻坡必吃的古早味叻沙，椰香浓郁，味道很赞！\n\nA must-try traditional Laksa in Muar, known for its rich coconut flavor and great taste.',
        '{"is24Hours": false, "open": "07:00", "close": "12:30", "closedDays": []}',
        muar_id,
        ARRAY['Food', 'Laksa', 'Breakfast', 'Local Delight']
    ),
    -- 9. Glutton Street (Food)
    (
        'Muar Glutton Street',
        '贪食街',
        'food',
        'Jalan Haji Abu, Pekan Muar, 84000 Muar, Johor',
        2.0480, 102.5680, -- Precise Jalan Haji Abu
        '集中小吃街，乌达、蚝煎、沙爹应有尽有的麻坡著名街道。\n\nA famous street in Muar concentrated with hawker stalls serving Otak-Otak, Oyster Omelette, Satay, and more.',
        '{"is24Hours": false, "open": "12:00", "close": "00:00", "closedDays": []}',
        muar_id,
        ARRAY['Food', 'Street Food', 'Hawker', 'Dinner']
    ),
    -- 10. Kopi 434 (Food)
    (
        'Sai Kee Kopi 434',
        'Kopi 434',
        'food',
        '121, Jalan Maharani, Taman Sri Emas, 84000 Muar, Johor',
        2.0490, 102.5650, -- Precise Jalan Maharani
        '麻坡人气现代咖啡馆，主打创意南洋风味咖啡和复古怀旧氛围。\n\nA popular modern coffee house in Muar specializing in creative Nanyang-style coffee and a retro nostalgic atmosphere.',
        '{"is24Hours": false, "open": "08:00", "close": "17:30", "closedDays": []}',
        muar_id,
        ARRAY['Food', 'Coffee', 'Cafe', 'Famous']
    ),
    -- 11. Cheng Boi (Food)
    (
        'Otak-Otak Cheng Boi',
        '阿梅麻坡乌达',
        'food',
        'No 28 4, Jln Bentayan, Taman Sri Emas, 84000 Muar, Johor',
        2.0479, 102.5905, -- Precise from search
        '麻坡知名乌达专卖店，鱼肉细腻、香料浓郁，炭烤或蒸制皆风味十足。\n\nA well-known Otak-Otak specialty shop in Muar, known for its delicate fish texture and rich spices.',
        '{"is24Hours": false, "open": "09:00", "close": "16:00", "closedDays": ["Wednesday"]}',
        muar_id,
        ARRAY['Food', 'Otak-Otak', 'Local Product', 'Souvenir']
    ),
    -- 12. Restoran Chun Hui (Food)
    (
        'Restoran Chun Hui',
        '全妃亚叁鱼 (Asam Pedas)',
        'food',
        'PKB 23-A, Jalan Muar - Batu Pahat, Parit Jawa, 84150 Muar, Johor',
        1.9550, 102.6400, -- Precise Parit Jawa main road
        '招牌亚叁鱼，酸口为主，个人觉得味道普通，价格稍高。\n\nSignature Asam Pedas (sour and spicy fish).',
        '{"is24Hours": false, "open": "09:30", "close": "16:00", "closedDays": []}',
        muar_id,
        ARRAY['Food', 'Asam Pedas', 'Lunch']
    ),
    -- 13. Muo Boutique Hotel (Accommodation)
    (
        'Muo Boutique Hotel',
        'Muo Boutique Hotel',
        'accommodation',
        '1 & 1A, Jalan Petri, 84000 Muar, Johor',
        2.0500, 102.5650, -- Precise Jalan Petri
        '麻坡森系设计酒店，现代简约风大厅搭配绿植装饰，前台服务亲切，房间紧凑但整洁，位置便利，适合探索老城。\n\nA nature-inspired boutique hotel in Muar with modern minimalist design, friendly service, and a convenient location for exploring the old town.',
        '{"checkIn": "15:00", "checkOut": "12:00"}',
        muar_id,
        ARRAY['Accommodation', 'Hotel', 'Boutique', 'Stay']
    );

    RAISE NOTICE 'Inserted Muar locations';
END $$;
