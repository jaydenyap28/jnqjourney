-- SQL script to Insert or Update (Upsert) spots for Muar, Pontian, and Bentong
-- Generated on 2025-02-24
-- This script handles:
-- 1. Region creation/verification
-- 2. Upserting spots (Update if exists by name+region, else Insert)
-- 3. Setting specific dates for Pontian (2025-02-24)
-- 4. Correcting Bentong/Muar coordinates and details

BEGIN;

DO $$
DECLARE
    muar_id BIGINT;
    pontian_id BIGINT;
    bentong_id BIGINT;
    spot_record RECORD;
BEGIN
    -- ==========================================
    -- 1. REGION SETUP
    -- ==========================================
    
    -- Muar
    SELECT id INTO muar_id FROM regions WHERE name = 'Muar';
    IF muar_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, bounds)
        VALUES ('Muar', '麻坡', 'Muar, the Royal Town of Johor, is famous for its historical buildings, street art, and delicious local food like Otak-Otak and Mee Bandung.', 'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder', '{"north": 2.10, "south": 1.90, "east": 102.70, "west": 102.50}'::jsonb)
        RETURNING id INTO muar_id;
    END IF;

    -- Pontian
    SELECT id INTO pontian_id FROM regions WHERE name = 'Pontian';
    IF pontian_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, bounds)
        VALUES ('Pontian', '笨珍', 'Known for its seafood, fishing villages, and the southernmost tip of mainland Asia.', 'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder', '{"north": 1.55, "south": 1.26, "east": 103.6, "west": 103.3}'::jsonb)
        RETURNING id INTO pontian_id;
    END IF;

    -- Bentong
    SELECT id INTO bentong_id FROM regions WHERE name = 'Bentong';
    IF bentong_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, bounds)
        VALUES ('Bentong', '文冬', 'A historical town famous for its ginger, durian, and surrounding nature retreats like Bukit Tinggi and Janda Baik.', 'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder', '{"north": 3.6, "south": 3.3, "east": 102.0, "west": 101.7}'::jsonb)
        RETURNING id INTO bentong_id;
    END IF;

    -- ==========================================
    -- 2. HELPER LOGIC (Inline Upserts)
    -- ==========================================
    -- We will iterate through data values and perform UPSERT logic manually since we can't guarantee unique constraints.

    -- ==========================================
    -- 3. MUAR SPOTS
    -- ==========================================
    -- Define temp table for Muar spots
    CREATE TEMP TABLE IF NOT EXISTS temp_muar_spots (
        name text, name_cn text, category text, address text, lat float, lng float, 
        description text, opening_hours jsonb, tags text[]
    ) ON COMMIT DROP;

    INSERT INTO temp_muar_spots VALUES 
    ('Muar Street Art', '麻坡街头艺术', 'attraction', 'Jalan Meriam / Jalan Sisi, Pekan Muar, 84000 Muar, Johor', 2.0465, 102.5638, '麻坡市充满活力的壁画和艺术装置，以当地文化和历史为主题。其中包括著名的“姐妹情深”壁画。\n\nVibrant murals and art installations celebrating local culture and history, including the famous "Loving Sisters" mural.', '{"is24Hours": true, "closedDays": []}', ARRAY['Street Art', 'Culture', 'Photo Spot']),
    ('Xiu De Shan Tang', '修德善堂', 'attraction', 'No. 40, Jalan Sultan Ibrahim, Pekan Muar, 84000 Muar, Johor', 2.0475, 102.5680, '百年慈善机构，结合宗教与公益，致力于扶贫济困、教育及社区服务。\n\nA century-old charitable organization combining religion and public welfare, dedicated to poverty alleviation, education, and community service.', '{"is24Hours": false, "open": "08:00", "close": "17:00", "closedDays": []}', ARRAY['Temple', 'Charity', 'History', 'Culture']),
    ('Nan Ting Si Temple', '麻坡南亭寺善才爷公', 'attraction', 'Jalan Dato Koh Thian Peng, Parit Unas, 84150 Muar, Johor', 1.9900, 102.6100, '著名道教庙宇，主祀善才爷公，香火鼎盛。\n\nA famous Taoist temple dedicated to Shan Cai Ye Gong, known for its strong incense and devotees.', '{"is24Hours": false, "open": "06:00", "close": "18:00", "closedDays": []}', ARRAY['Temple', 'Culture', 'Taoism']),
    ('Parit Jawa Fishing Village', '巴东海口渔村', 'attraction', 'Parit Jawa, 84150 Parit Jawa, Johor', 1.9500, 102.6500, '宁静渔村，以传统渔业、新鲜海鲜和淳朴的渔港风情为特色。\n\nA quiet fishing village characterized by traditional fishing, fresh seafood, and rustic harbor charm.', '{"is24Hours": true, "closedDays": []}', ARRAY['Fishing Village', 'Nature', 'Sunset', 'Seafood']),
    ('Daily Happy OtakOtak (Retro House)', 'Daily Happy OtakOtak 复古小屋', 'attraction', 'No. 163-8, Jalan Jabbar, Parit Jawa, 84150 Parit Jawa, Johor', 1.9560, 102.6380, '由当地人用再循环旧屋打造而成的复古建筑，打卡超出片！\n\nA retro-style building created from a recycled old house, perfect for photography!', '{"is24Hours": false, "open": "07:00", "close": "17:00", "closedDays": []}', ARRAY['Photo Spot', 'Retro', 'Culture', 'Otak-Otak']),
    ('Sultan Ismail Bridge', '麻坡大桥夜景', 'attraction', 'Jalan Kesang, 84000 Muar, Johor', 2.0509, 102.5672, '夜晚灯光璀璨，是散步和摄影的热门地点，也是情侣约会散步的好去处。\n\nSparkling lights at night make this a popular spot for walking, photography, and dating.', '{"is24Hours": true, "closedDays": []}', ARRAY['Landmark', 'Night View', 'Bridge', 'Photography']),
    ('Kedai Kopi See Hoi', '世维茶室', 'food', '129-4, Jalan Temenggong Ahmad, Jalan Parit Perupok, 84000 Muar, Johor', 2.0400, 102.5750, '麻坡老字号传统咖啡店，以古早味海南咖啡和炭烤面包闻名。\n\nA traditional coffee shop known for its old-school Hainanese coffee and charcoal-toasted bread.', '{"is24Hours": false, "open": "07:00", "close": "17:30", "closedDays": ["Sunday"]}', ARRAY['Food', 'Coffee', 'Traditional', 'Breakfast']),
    ('Kedai Kopi Hua Nam', '华南茶餐室 亚云叻沙', 'food', 'No. 23, Jalan Yahya, Pekan Muar, 84000 Muar, Johor', 2.0476, 102.5702, '麻坡必吃的古早味叻沙，椰香浓郁，味道很赞！\n\nA must-try traditional Laksa in Muar, known for its rich coconut flavor and great taste.', '{"is24Hours": false, "open": "07:00", "close": "12:30", "closedDays": []}', ARRAY['Food', 'Laksa', 'Breakfast', 'Local Delight']),
    ('Muar Glutton Street', '贪食街', 'food', 'Jalan Haji Abu, Pekan Muar, 84000 Muar, Johor', 2.0480, 102.5680, '集中小吃街，乌达、蚝煎、沙爹应有尽有的麻坡著名街道。\n\nA famous street in Muar concentrated with hawker stalls serving Otak-Otak, Oyster Omelette, Satay, and more.', '{"is24Hours": false, "open": "12:00", "close": "00:00", "closedDays": []}', ARRAY['Food', 'Street Food', 'Hawker', 'Dinner']),
    ('Sai Kee Kopi 434', 'Kopi 434', 'food', '121, Jalan Maharani, Taman Sri Emas, 84000 Muar, Johor', 2.0490, 102.5650, '麻坡人气现代咖啡馆，主打创意南洋风味咖啡和复古怀旧氛围。\n\nA popular modern coffee house in Muar specializing in creative Nanyang-style coffee and a retro nostalgic atmosphere.', '{"is24Hours": false, "open": "08:00", "close": "17:30", "closedDays": []}', ARRAY['Food', 'Coffee', 'Cafe', 'Famous']),
    ('Otak-Otak Cheng Boi', '阿梅麻坡乌达', 'food', 'No 28 4, Jln Bentayan, Taman Sri Emas, 84000 Muar, Johor', 2.0479, 102.5905, '麻坡知名乌达专卖店，鱼肉细腻、香料浓郁，炭烤或蒸制皆风味十足。\n\nA well-known Otak-Otak specialty shop in Muar, known for its delicate fish texture and rich spices.', '{"is24Hours": false, "open": "09:00", "close": "16:00", "closedDays": ["Wednesday"]}', ARRAY['Food', 'Otak-Otak', 'Local Product', 'Souvenir']),
    ('Restoran Chun Hui', '全妃亚叁鱼 (Asam Pedas)', 'food', 'PKB 23-A, Jalan Muar - Batu Pahat, Parit Jawa, 84150 Muar, Johor', 1.9550, 102.6400, '招牌亚叁鱼，酸口为主，个人觉得味道普通，价格稍高。\n\nSignature Asam Pedas (sour and spicy fish).', '{"is24Hours": false, "open": "09:30", "close": "16:00", "closedDays": []}', ARRAY['Food', 'Asam Pedas', 'Lunch']),
    ('Muo Boutique Hotel', 'Muo Boutique Hotel', 'accommodation', '1 & 1A, Jalan Petri, 84000 Muar, Johor', 2.0500, 102.5650, '麻坡森系设计酒店，现代简约风大厅搭配绿植装饰，前台服务亲切，房间紧凑但整洁，位置便利，适合探索老城。\n\nA nature-inspired boutique hotel in Muar with modern minimalist design, friendly service, and a convenient location for exploring the old town.', '{"checkIn": "15:00", "checkOut": "12:00"}', ARRAY['Accommodation', 'Hotel', 'Boutique', 'Stay']);

    FOR spot_record IN SELECT * FROM temp_muar_spots LOOP
        UPDATE locations SET 
            name_cn = spot_record.name_cn,
            category = spot_record.category,
            address = spot_record.address,
            latitude = spot_record.lat,
            longitude = spot_record.lng,
            description = spot_record.description,
            opening_hours = spot_record.opening_hours,
            tags = spot_record.tags
        WHERE name = spot_record.name AND region_id = muar_id;

        IF NOT FOUND THEN
            INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, tags)
            VALUES (spot_record.name, spot_record.name_cn, spot_record.category, spot_record.address, spot_record.lat, spot_record.lng, spot_record.description, spot_record.opening_hours, muar_id, spot_record.tags);
        END IF;
    END LOOP;
    
    DROP TABLE temp_muar_spots;

    -- ==========================================
    -- 4. PONTIAN SPOTS
    -- ==========================================
    CREATE TEMP TABLE IF NOT EXISTS temp_pontian_spots (
        name text, name_cn text, category text, address text, lat float, lng float, 
        description text, opening_hours jsonb, tags text[]
    ) ON COMMIT DROP;

    INSERT INTO temp_pontian_spots VALUES 
    ('Tanjung Piai National Park', '丹绒比艾国家公园', 'attraction', 'Jalan Tanjung Piai, 82300 Kukup, Johor', 1.2681, 103.5087, '亚洲大陆最南端的红树林保护区，设有木栈道和地球仪地标。\n\nThe southernmost point of mainland Asia with mangrove boardwalks and a globe landmark.', '{"is24Hours": false, "open": "09:00", "close": "17:00", "closedDays": ["Monday"], "remarks": "Last entry at 16:00"}', ARRAY['Nature', 'National Park', 'Mangrove', 'Landmark']),
    ('Kukup Fishing Village', '龟咯渔村', 'attraction', '74 Kukup Laut, 82300 Kukup, Johor', 1.3264, 103.4447, '建在海上的百年渔村。在村子里散步，感受独特的“水上人家”氛围，还可以搭船出海吹吹风，看看养鱼场。\n\nA century-old fishing village built entirely on stilts over the sea. Famous for fresh seafood, boat rides to fish farms (kelongs), and its unique "water village" atmosphere.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Village open 24h, shops vary"}', ARRAY['Culture', 'Village', 'Seafood', 'History']),
    ('Kopi Tenggek Tanjung Piai', 'Kopi Tenggek Tanjung Piai', 'food', '161, Jalan Serkat, Kampung Serkat Laut, 82300 Kukup, Johor', 1.3000, 103.4800, '著名的“Tenggek”咖啡，位于丹绒比艾附近。适合早餐和下午茶。\n\nFamous for its "Tenggek" coffee style. A popular spot near Tanjung Piai for breakfast and tea time.', '{"is24Hours": false, "open": "08:30", "close": "16:30", "closedDays": ["Tuesday"], "remarks": ""}', ARRAY['Coffee', 'Local', 'Breakfast']),
    ('Twins Cafe Kukup', 'Twins Cafe Kukup', 'food', 'No 9, Jalan Kukup Laut, 82300 Kukup, Johor', 1.3260, 103.4450, '位于龟咯渔村的咖啡馆，提供舒适的环境和美食。\n\nA cafe located in Kukup fishing village, offering a cozy environment and good food.', '{"is24Hours": false, "open": "11:00", "close": "18:00", "closedDays": [], "remarks": "Check FB for latest hours"}', ARRAY['Cafe', 'Western', 'Seafood']),
    ('Jong Suan Hiang Kopitiam', '湧泉香咖啡店', 'food', '327, Jalan Bakek, Kampung Atap, 82000 Pontian, Johor', 1.4870, 103.3880, '笨珍老字号传统海南咖啡店。必试炭烤面包和海南咖啡。\n\nA legendary traditional Hainanese kopitiam in Pontian. Must-try items include charcoal-toasted bread and Hainanese coffee.', '{"is24Hours": false, "open": "07:00", "close": "14:00", "closedDays": ["Sunday"], "remarks": ""}', ARRAY['Breakfast', 'Traditional', 'Kopitiam']),
    ('Kedai Mee Sin Kee', '新记云吞面', 'food', '1120, Jalan Bakek Jaya Utama, Kampung Atap, 82000 Pontian, Johor', 1.4880, 103.3890, '笨珍着名的茄汁云吞面。面条Q弹，酱汁独特。\n\nFamous for Pontian-style Wanton Mee with tomato sauce ketchup. Springy noodles with unique sauce.', '{"is24Hours": false, "open": "10:00", "close": "17:00", "closedDays": ["Thursday"], "remarks": ""}', ARRAY['Wanton Mee', 'Local', 'Noodles']),
    ('Ah Leng Fried Kuey Tiau', '古早味亞龙黑面', 'food', 'Pontian Kechil, 82000 Pontian, Johor', 1.4890, 103.3900, '古早味炒粿条/黑面。锅气十足。\n\nTraditional style Fried Kuey Tiau / Black Noodles. Full of "Wok Hei".', '{"is24Hours": false, "open": "11:00", "close": "18:00", "closedDays": [], "remarks": "Verify exact location"}', ARRAY['Street Food', 'Noodles', 'Local']),
    ('Xiao Mu Wu Kitchen', '小木屋•厨房', 'food', '2002, Jalan Parit Mesjid, Taman Mawar, 82000 Pontian, Johor', 1.4950, 103.3800, '温馨的木屋风格餐厅，适合家庭聚餐。\n\nA cozy wooden-house styled restaurant, suitable for family dining.', '{"is24Hours": false, "open": "12:00", "close": "22:00", "closedDays": ["Friday"], "remarks": ""}', ARRAY['Western', 'Dinner', 'Cozy']),
    ('Pontian Shoal', 'Pontian Shoal', 'attraction', 'Pontian Coast, Johor', 1.5000, 103.3000, '位于笨珍海域的浅滩，风景优美，适合观海。\n\nA shoal located off the coast of Pontian, offering beautiful sea views.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}', ARRAY['Nature', 'Sea', 'Shoal']),
    ('Taman Rekreasi Sungai Rambah', '双溪南峇休闲公园', 'attraction', '82000 Pontian, Johor', 1.4300, 103.4000, '休闲公园，适合散步、野餐和观赏红树林生态。\n\nRecreational park suitable for jogging, picnics, and observing mangrove ecology.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}', ARRAY['Park', 'Recreation', 'Nature']),
    ('Telok Kerang Beach', 'Telok Kerang Beach', 'attraction', 'Kampung Teluk Kerang, 82000 Pontian, Johor', 1.4156, 103.4246, '小众海滩，适合傍晚野餐、看海，氛围悠闲。\n\nA hidden gem beach, perfect for evening picnics and sea gazing with a relaxed atmosphere.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}', ARRAY['Beach', 'Nature', 'Sunset']),
    ('Coxn Cafe Pontian', 'Coxn Cafe Pontian', 'food', 'Batu 39, Lorong Parit Ibrahim, Kampung Rimba Terjun, 82000 Pontian, Johor', 1.4500, 103.4100, '海边咖啡馆，拥有绝美的日落景色。\n\nSeaside cafe with stunning sunset views.', '{"is24Hours": false, "open": "17:00", "close": "23:00", "closedDays": [], "remarks": "Sunset view"}', ARRAY['Cafe', 'Sunset', 'Seaside']);

    FOR spot_record IN SELECT * FROM temp_pontian_spots LOOP
        UPDATE locations SET 
            name_cn = spot_record.name_cn,
            category = spot_record.category,
            address = spot_record.address,
            latitude = spot_record.lat,
            longitude = spot_record.lng,
            description = spot_record.description,
            opening_hours = spot_record.opening_hours,
            visit_date = '2025-02-24', -- Explicitly set date
            tags = spot_record.tags
        WHERE name = spot_record.name AND region_id = pontian_id;

        IF NOT FOUND THEN
            INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, visit_date, tags)
            VALUES (spot_record.name, spot_record.name_cn, spot_record.category, spot_record.address, spot_record.lat, spot_record.lng, spot_record.description, spot_record.opening_hours, pontian_id, '2025-02-24', spot_record.tags);
        END IF;
    END LOOP;

    DROP TABLE temp_pontian_spots;

    -- ==========================================
    -- 5. BENTONG SPOTS
    -- ==========================================
    CREATE TEMP TABLE IF NOT EXISTS temp_bentong_spots (
        name text, name_cn text, category text, address text, lat float, lng float, 
        description text, opening_hours jsonb, tags text[]
    ) ON COMMIT DROP;

    INSERT INTO temp_bentong_spots VALUES 
    ('Old Glass Mouth Wealth God Temple', '彭亨文冬旧玻璃口财神庙', 'attraction', 'No. 94, Kg. Ulu Perting, 28700, Bentong, Pahang', 3.5186, 101.9023, '彭亨文冬玻璃口新村历史悠久的华人财神庙，香火鼎盛，祈求财运亨通。\n\nA historic Chinese temple in Glass Mouth New Village, Bentong, known for its strong incense and prayers for prosperity.', '{"is24Hours": false, "open": "08:00", "close": "18:00", "closedDays": [], "remarks": ""}', ARRAY['Temple', 'Culture', 'History']),
    ('Bentong Gallery', '文冬文化馆', 'attraction', '17-18, Jalan Loke Yew, 28700 Bentong, Pahang', 3.5220, 101.9070, '展示文冬早期发展的历史，重点介绍开埠功臣陆佑的贡献，馆内设有咖啡厅，免费入场。\n\nExhibits the early history of Bentong, focusing on the contributions of Loke Yew. Includes a cafe and free admission.', '{"is24Hours": false, "open": "09:00", "close": "18:00", "closedDays": ["Tuesday"], "remarks": ""}', ARRAY['History', 'Museum', 'Culture']),
    ('Japanese Village', '日本村', 'attraction', 'KM 48, Persimpangan Bertingkat, Lebuhraya Karak, 28750 Bukit Tinggi, Pahang', 3.4200, 101.8400, '位于Colmar Tropicale园区内（需购买入场门票）。掩映在绿林中的日式庭院，让你仿佛置身日本的小村落，有和服出租，穿上和服打卡超出片。\n\nLocated within Colmar Tropicale (admission ticket required). A Japanese-style garden hidden in the green forest, offering kimono rentals for photos.', '{"is24Hours": false, "open": "10:00", "close": "17:00", "closedDays": [], "remarks": ""}', ARRAY['Garden', 'Nature', 'Photography']),
    ('Colmar Tropicale', 'Colmar Tropicale法国村', 'attraction', 'Bukit Tinggi, 28750 Bentong, Pahang', 3.4042, 101.8394, '藏身Bukit Tinggi的欧式童话小镇，仿法国科尔马镇建造，彩色木筋屋与石板路打造梦幻欧洲风情。\n\nA French-themed village in Bukit Tinggi, modeled after Colmar, France, featuring colorful timber-framed houses and cobblestone streets.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open all day"}', ARRAY['Architecture', 'Resort', 'Photography']),
    ('Chamang Waterfall', '文冬情人瀑布', 'attraction', 'Jalan Chamang, 28700 Bentong, Pahang', 3.5090, 101.8590, '文冬蕞受欢迎的天然瀑布，瀑布水势澎湃，是本地人消暑的首选地点。\n\nBentong''s most popular natural waterfall, known for its powerful currents and as a favorite local cooling spot.', '{"is24Hours": false, "open": "09:00", "close": "17:00", "closedDays": [], "remarks": "雨季期间或大雨后可能关闭，以策安全。（Highly dangerous during heavy rain due to flash floods）"}', ARRAY['Nature', 'Waterfall', 'Recreation']),
    ('Kechara Forest Retreat', '克切拉禅修林', 'attraction', 'Lot 3189, Jalan Chamang，28700 Bentong, Pahang', 3.5400, 101.8800, '隐逸在彭亨文冬群山中的藏传佛教静修圣地，结合自然疗愈与禅修文化，提供远离尘嚣的心灵净化体验。\n\nA Tibetan Buddhist retreat nestled in the hills of Bentong, offering spiritual healing and meditation experiences.', '{"is24Hours": false, "open": "10:00", "close": "17:00", "closedDays": [], "remarks": ""}', ARRAY['Spiritual', 'Meditation', 'Temple']),
    ('Thong Kee Kopitiam', '溏记海南茶室', 'food', 'No. 4, Jalan Chui Yin, 28700 Bentong, Pahang', 3.5220, 101.9070, '知名老字号咖啡店，主打独特的1+1咖啡茶混合饮品，以及香脆的火腿芝士牛角包和自制咖椰吐司。\n\nA famous heritage kopitiam known for its unique 1+1 (coffee+tea) drink, crispy ham & cheese croissants, and homemade kaya toast.', '{"is24Hours": false, "open": "07:00", "close": "16:30", "closedDays": [], "remarks": "Croissants usually sold out before noon"}', ARRAY['Breakfast', 'Kopitiam', 'Local']),
    ('Lemang To’ki', 'Lemang To’ki', 'food', 'Batu 2, Jalan Tras, 28700 Bentong, Pahang', 3.5350, 101.9000, '以炭烤竹筒饭搭配香辣仁当鸡和牛肉闻名，使用新鲜竹筒与椰浆饭炭火慢烤，超香~\n\nFamous for charcoal-grilled Lemang paired with spicy Chicken or Beef Rendang.', '{"is24Hours": false, "open": "08:00", "close": "19:45", "closedDays": [], "remarks": ""}', ARRAY['Malay Food', 'Lunch', 'Local']),
    ('Tauhu Auntie Mok', '莫大妈豆腐', 'food', '90，Jalan Pasar, 28700 Bentong, Pahang', 3.5210, 101.9060, '位于文冬老街，以嫩滑的姜糖豆腐花闻名，也有售卖多种豆腐卜，红豆冰和冰淇淋等等。\n\nLocated on Bentong Old Street, famous for its silky Tau Fu Fah with ginger syrup, Tofu Puffs, and ABC.', '{"is24Hours": false, "open": "06:00", "close": "16:00", "closedDays": ["Wednesday"], "remarks": ""}', ARRAY['Dessert', 'Snack', 'Local']),
    ('Restoran Wonderland Valley', '桃源谷美食', 'food', 'Lot 9253, Kampung Bukit Tinggi, 28750 Bentong, Pahang', 3.3551, 101.8214, '位于云顶山脚下的中式煮炒餐馆，餐馆设立在河边，价格公道，食物味道不错。\n\nA Chinese restaurant located at the foot of Genting Highlands, set by the river with reasonable prices and good food.', '{"is24Hours": false, "open": "11:30", "close": "20:30", "closedDays": ["Tuesday"], "remarks": ""}', ARRAY['Chinese', 'Dinner', 'River View']),
    ('Tumike Hotel Bentong', 'Tumike Hotel Bentong', 'accommodation', 'P.6-G, Jalan MG3, Pusat Perniagaan Mutiaramas Gemilang, 28700 Bentong, Pahang', 3.5100, 101.9150, '距离市中心很近，酒店设立在新区有很多停车位。房间整洁度OK，性价格高。\n\nLocated near the town center in a new area with ample parking. Clean rooms and high value for money.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Check-in 14:00, Check-out 12:00"}', ARRAY['Hotel', 'Accommodation', 'Budget']),
    ('Chow Sun Yuk Cheong Fun', '周新旭猪肠粉', 'food', 'Jalan Wayang / Jalan Chui Yin Intersection, Bentong, Pahang', 3.5225, 101.9075, 'Famous local Chee Cheong Fun stall known for its smooth texture and sauces.', '{"is24Hours": false, "open": "11:00", "close": "15:00", "closedDays": [], "remarks": "Until sold out"}', ARRAY['Street Food', 'Breakfast', 'Local']),
    ('Dataran Bentong', 'Dataran Bentong', 'attraction', 'Jalan Chui Yin, Bentong Town, Pahang', 3.5230, 101.9080, 'Bentong Town Square, a popular spot for locals to gather and for events.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}', ARRAY['Square', 'Landmark', 'Public Space']),
    ('Taman Pinggiran Sungai Marong', 'Taman Pinggiran Sungai Marong', 'attraction', 'Kampung Sungai Marong, Bentong, Pahang', 3.5250, 101.9100, 'A scenic riverside park suitable for jogging and evening walks.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}', ARRAY['Park', 'Nature', 'Recreation']),
    ('Big House Restaurant', '大屋美食阁', 'food', 'Kg Kemansur, Bentong, Pahang', 3.5200, 101.9050, 'Large food court style restaurant offering a variety of local hawker food.', '{"is24Hours": false, "open": "11:00", "close": "23:00", "closedDays": [], "remarks": ""}', ARRAY['Food Court', 'Dinner', 'Local']),
    ('Lilla Hilltop Retreat', 'Lilla Hilltop Retreat', 'accommodation', 'Lor Seri Dinar, Kampung Janda Baik, 28750 Bentong, Pahang', 3.3200, 101.8700, 'A peaceful hilltop retreat in Janda Baik, perfect for nature lovers and group gatherings.', '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": ""}', ARRAY['Resort', 'Nature', 'Staycation']),
    ('Figgy’s Cafe', 'Figgy’s Cafe', 'food', 'PT 20266 Sg. Panjang Kg. Cheringin, Kampung Janda Baik, Pahang', 3.3100, 101.8600, 'A cafe in Janda Baik offering food and drinks in a garden setting.', '{"is24Hours": false, "open": "10:00", "close": "18:00", "closedDays": [], "remarks": ""}', ARRAY['Cafe', 'Nature', 'Relax']);

    FOR spot_record IN SELECT * FROM temp_bentong_spots LOOP
        UPDATE locations SET 
            name_cn = spot_record.name_cn,
            category = spot_record.category,
            address = spot_record.address,
            latitude = spot_record.lat,
            longitude = spot_record.lng,
            description = spot_record.description,
            opening_hours = spot_record.opening_hours,
            tags = spot_record.tags
        WHERE name = spot_record.name AND region_id = bentong_id;

        IF NOT FOUND THEN
            INSERT INTO locations (name, name_cn, category, address, latitude, longitude, description, opening_hours, region_id, tags)
            VALUES (spot_record.name, spot_record.name_cn, spot_record.category, spot_record.address, spot_record.lat, spot_record.lng, spot_record.description, spot_record.opening_hours, bentong_id, spot_record.tags);
        END IF;
    END LOOP;

    DROP TABLE temp_bentong_spots;

    RAISE NOTICE 'Upsert complete for Muar, Pontian, and Bentong spots.';

END $$;

COMMIT;
