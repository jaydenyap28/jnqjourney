-- Add Japan spots
-- This script adds regions and spots for various locations in Japan.

DO $$
DECLARE
    v_tokyo_region_id INTEGER;
    v_kyoto_region_id INTEGER;
    v_hokkaido_region_id INTEGER;
    v_otaru_id INTEGER;
    v_hakodate_id INTEGER;
    v_noboribetsu_id INTEGER;
    v_yamagata_region_id INTEGER;
    v_obanazawa_id INTEGER;
    v_chiba_region_id INTEGER;
    v_urayasu_id INTEGER;
    v_yamanashi_region_id INTEGER;
    v_fujiyoshida_id INTEGER;
    v_oshino_id INTEGER;
    v_yamanakako_id INTEGER;
    v_yamagata_city_id INTEGER;
BEGIN
    -- ==========================================
    -- JAPAN - REGIONS & SPOTS
    -- ==========================================

    -- ------------------------------------------
    -- TOKYO
    -- ------------------------------------------
    -- Tokyo (Metropolis/Prefecture)
    SELECT id INTO v_tokyo_region_id FROM regions WHERE name = 'Tokyo' AND country = 'Japan';
    IF v_tokyo_region_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Tokyo', 
            '东京都', 
            'The capital of Japan, mixing the ultramodern and the traditional.', 
            NULL, 
            'TKY', 
            'Japan', 
            NULL,
            'tokyo'
        ) RETURNING id INTO v_tokyo_region_id;
    END IF;

    -- Spot: Tokyo Tower
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Tokyo Tower') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Tokyo Tower',
            '东京塔',
            'Communications and observation tower in the Shiba-koen district of Minato, Tokyo.',
            '4 Chome-2-8 Shibakoen, Minato City, Tokyo 105-0011, Japan',
            35.6586, 139.7454,
            'entertainment',
            'https://maps.app.goo.gl/example',
            v_tokyo_region_id,
            'active'
        );
    END IF;

    -- Spot: Nakamise Shopping Street
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Nakamise Shopping Street') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Nakamise Shopping Street', '仲见世商店街', '浅草寺门前的“吃货集合街”！现烤人形烧、草莓大福、烤团子…每家小吃摊都在喊“选我”！', '1 Chome-36-3 Asakusa, Taito City, Tokyo 111-0032, Japan', 35.7119, 139.7964, 'shopping', 'https://maps.app.goo.gl/example', v_tokyo_region_id, 'active');
    END IF;

    -- Spot: Senso-ji Temple
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Senso-ji Temple') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Senso-ji Temple', '浅草寺', '穿和服秒变日剧女主角，求签求到上上吉！东京最古老寺庙，巨大红灯笼“雷门”下打卡必去！', '2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan', 35.7148, 139.7967, 'culture', 'https://maps.app.goo.gl/example', v_tokyo_region_id, 'active');
    END IF;

    -- Spot: Kaminari-Issa
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kaminari-Issa') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Kaminari-Issa', '雷一茶', '抹茶控原地升天！必点“瀑布抹茶冰沙”，浓郁茶香爆炸在舌尖！', '1 Chome-15-9 Hanakawado, Taito City, Tokyo 111-0033, Japan', 35.7132, 139.7981, 'food', 'https://maps.app.goo.gl/example', v_tokyo_region_id, 'active');
    END IF;

    -- Spot: Shibuya Sky
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Shibuya Sky') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Shibuya Sky', 'Shibuya Sky', '在云端上等日落，360°把东京踩在脚下！涩谷上空230米，全东京最嚣张的观景台！', '2 Chome-24-12 Shibuya, Shibuya City, Tokyo 150-6145, Japan', 35.6585, 139.7023, 'entertainment', 'https://maps.app.goo.gl/example', v_tokyo_region_id, 'active');
    END IF;

    -- Spot: Kabukicho
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kabukicho') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Kabukicho', '歌舞伎町', '日本最著名的红灯区，拥有大量的餐厅、酒吧、夜总会，体验东京不夜城！', 'Kabukicho, Shinjuku City, Tokyo 160-0021, Japan', 35.6938, 139.7034, 'entertainment', 'https://maps.app.goo.gl/example', v_tokyo_region_id, 'active');
    END IF;

    -- Spot: Tokyu Kabukicho Tower
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Tokyu Kabukicho Tower') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Tokyu Kabukicho Tower', '东急歌舞伎町塔', '2023年诞生的东京新晋景点。集商务、娱乐和住宿于一体的综合性摩天大楼！', '1 Chome-29-1 Kabukicho, Shinjuku City, Tokyo 160-0021, Japan', 35.6953, 139.7006, 'entertainment', 'https://maps.app.goo.gl/example', v_tokyo_region_id, 'active');
    END IF;

    -- ------------------------------------------
    -- KYOTO
    -- ------------------------------------------
    -- Kyoto (Prefecture)
    SELECT id INTO v_kyoto_region_id FROM regions WHERE name = 'Kyoto' AND country = 'Japan';
    IF v_kyoto_region_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Kyoto', 
            '京都府', 
            'Former capital of Japan, famous for its numerous classical Buddhist temples, as well as gardens, imperial palaces, Shinto shrines and traditional wooden houses.', 
            NULL, 
            'KYT', 
            'Japan', 
            NULL,
            'kyoto'
        ) RETURNING id INTO v_kyoto_region_id;
    END IF;

    -- Spot: Fushimi Inari Taisha
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Fushimi Inari Taisha') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Fushimi Inari Taisha',
            '伏见稻荷大社',
            'Famous for its thousands of vermilion torii gates, which straddle a network of trails behind its main buildings.',
            '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto, 612-0882, Japan',
            34.9670, 135.7727,
            'culture',
            'https://maps.app.goo.gl/example',
            v_kyoto_region_id,
            'active'
        );
    END IF;

    -- ------------------------------------------
    -- HOKKAIDO
    -- ------------------------------------------
    -- Hokkaido (Prefecture)
    SELECT id INTO v_hokkaido_region_id FROM regions WHERE name = 'Hokkaido' AND country = 'Japan';
    IF v_hokkaido_region_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Hokkaido', 
            '北海道', 
            'Japan''s second largest island and northernmost prefecture, famous for its volcanoes, natural hot springs (onsen) and ski areas.', 
            NULL, 
            'HKD', 
            'Japan', 
            NULL,
            'hokkaido'
        ) RETURNING id INTO v_hokkaido_region_id;
    END IF;

    -- Otaru (City)
    SELECT id INTO v_otaru_id FROM regions WHERE name = 'Otaru' AND parent_id = v_hokkaido_region_id;
    IF v_otaru_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Otaru', 
            '小樽市', 
            'A port city on Hokkaido, known for glassworks, music boxes and sake distilleries.', 
            NULL, 
            'OTR', 
            'Japan', 
            v_hokkaido_region_id,
            'otaru'
        ) RETURNING id INTO v_otaru_id;
    END IF;

    -- Hakodate (City)
    SELECT id INTO v_hakodate_id FROM regions WHERE name = 'Hakodate' AND parent_id = v_hokkaido_region_id;
    IF v_hakodate_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Hakodate', 
            '函馆市', 
            'One of the first port cities in Japan to be opened to international trade.', 
            NULL, 
            'HKD', 
            'Japan', 
            v_hokkaido_region_id,
            'hakodate'
        ) RETURNING id INTO v_hakodate_id;
    END IF;

    -- Noboribetsu (City/Town)
    SELECT id INTO v_noboribetsu_id FROM regions WHERE name = 'Noboribetsu' AND parent_id = v_hokkaido_region_id;
    IF v_noboribetsu_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Noboribetsu', 
            '登别市', 
            'Famous for its hot springs, especially Jigokudani (Hell Valley).', 
            NULL, 
            'NBB', 
            'Japan', 
            v_hokkaido_region_id,
            'noboribetsu'
        ) RETURNING id INTO v_noboribetsu_id;
    END IF;

    -- OTARU SPOTS
    -- 1. Sumiyoshi Shrine (住吉神社)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Sumiyoshi Shrine' AND region_id = v_otaru_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Sumiyoshi Shrine',
            '住吉神社',
            '真的人少景美！积雪深到小腿，朱红鸟居+蓬松白雪=朋友圈核武器！',
            '2 Chome-5 Sumiyoshicho, Otaru, Hokkaido 047-0015, Japan',
            43.1873, 141.0089,
            'culture',
            'https://maps.app.goo.gl/example',
            v_otaru_id,
            'active'
        );
    END IF;

    -- 2. Ichiban Ramen (一番拉面)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Ichiban Ramen' AND region_id = v_otaru_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Ichiban Ramen',
            '一番拉面',
            '推门就被治愈！传统日式装修+榻榻米座位，暖气开得超足。',
            'Otaru, Hokkaido, Japan',
            43.1907, 140.9947,
            'food',
            'https://maps.app.goo.gl/example',
            v_otaru_id,
            'active'
        );
    END IF;

    -- 3. Otaru Music Box Museum (八音盒博物馆)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Otaru Music Box Museum' AND region_id = v_otaru_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Otaru Music Box Museum',
            '八音盒博物馆',
            '重磅彩蛋！馆外有全球仅存2座的蒸汽钟，馆内收藏数千款音乐盒。',
            '4-1 Sumiyoshicho, Otaru, Hokkaido 047-0015, Japan',
            43.1888, 141.0068,
            'entertainment',
            'https://maps.app.goo.gl/example',
            v_otaru_id,
            'active'
        );
    END IF;

    -- 4. LeTAO Pathos (LeTao小樽洋菓子铺)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'LeTAO Pathos' AND region_id = v_otaru_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'LeTAO Pathos',
            'LeTao小樽洋菓子铺',
            '芝士控天堂！招牌双层芝士蛋糕一口入魂。',
            '5-22 Sakaimachi, Otaru, Hokkaido 047-0027, Japan',
            43.1913, 141.0076,
            'food',
            'https://maps.app.goo.gl/example',
            v_otaru_id,
            'active'
        );
    END IF;

    -- 5. Otaru Sakaimachi Street (小樽堺町通商店街)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Otaru Sakaimachi Street' AND region_id = v_otaru_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Otaru Sakaimachi Street',
            '小樽堺町通商店街',
            '剁手党狂喜！玻璃工坊、海鲜干贝、六花亭黄油饼干…逛到停不下来！',
            'Sakaimachi, Otaru, Hokkaido 047-0027, Japan',
            43.1925, 141.0050,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_otaru_id,
            'active'
        );
    END IF;

    -- 6. Otaru Canal (小樽运河)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Otaru Canal' AND region_id = v_otaru_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Otaru Canal',
            '小樽运河',
            '冬季限定浪漫！傍晚蓝色时刻+煤气灯亮起，积雪仓库倒映水中。',
            'Minatomachi, Otaru, Hokkaido 047-0007, Japan',
            43.1996, 141.0016,
            'nature',
            'https://maps.app.goo.gl/example',
            v_otaru_id,
            'active'
        );
    END IF;

    -- HAKODATE SPOTS
    -- 1. Lucky Pierrot (幸运小丑汉堡)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Lucky Pierrot' AND region_id = v_hakodate_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Lucky Pierrot',
            '幸运小丑汉堡',
            '函馆限定！美式复古风魂穿了！汉堡味道嘎嘎棒。',
            '14-17 Suehirocho, Hakodate, Hokkaido 040-0053, Japan',
            41.7667, 140.7167, 
            'food',
            'https://maps.app.goo.gl/example',
            v_hakodate_id,
            'active'
        );
    END IF;

    -- 2. Hachiman-zaka Slope (八幡坂)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Hachiman-zaka Slope' AND region_id = v_hakodate_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Hachiman-zaka Slope',
            '八幡坂',
            '路的尽头是海！拍日系大片就在这！',
            'Motomachi, Hakodate, Hokkaido 040-0054, Japan',
            41.7633, 140.7119,
            'nature',
            'https://maps.app.goo.gl/example',
            v_hakodate_id,
            'active'
        );
    END IF;

    -- 3. Kanemori Red Brick Warehouse (金森红砖仓库)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kanemori Red Brick Warehouse' AND region_id = v_hakodate_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Kanemori Red Brick Warehouse',
            '金森红砖仓库',
            '伴手礼天堂！逛到腿软！就在海边的红砖建筑群。',
            '14-12 Suehirocho, Hakodate, Hokkaido 040-0053, Japan',
            41.7669, 140.7175,
            'shopping',
            'https://maps.app.goo.gl/example',
            v_hakodate_id,
            'active'
        );
    END IF;

    -- 4. Mount Hakodate Night View (函馆山夜景)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Mount Hakodate Night View' AND region_id = v_hakodate_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Mount Hakodate Night View',
            '函馆山夜景',
            '世界三大夜景之一！真的值回票价！',
            'Hakodateyama, Hakodate, Hokkaido 040-0000, Japan',
            41.7594, 140.7042,
            'nature',
            'https://maps.app.goo.gl/example',
            v_hakodate_id,
            'active'
        );
    END IF;

    -- 5. Kanemori Shrine (金森神社)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kanemori Shrine' AND region_id = v_hakodate_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Kanemori Shrine',
            '金森神社',
            '隐藏彩蛋！冬夜才有的魔法！冬季才会出现的限定漂浮神社。',
            'Suehirocho, Hakodate, Hokkaido, Japan',
            41.7670, 140.7180,
            'culture',
            'https://maps.app.goo.gl/example',
            v_hakodate_id,
            'active'
        );
    END IF;

    -- NOBORIBETSU SPOTS
    -- 1. Oyunuma River Natural Footbath (大汤沼川天然足汤)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Oyunuma River Natural Footbath' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Oyunuma River Natural Footbath',
            '大汤沼川天然足汤',
            '小众免费！森林雪地露天JIO部SPA！',
            'Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.4975, 141.1444,
            'nature',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- 2. Sengen Park (泉源公园)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Sengen Park' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Sengen Park',
            '泉源公园',
            '地表最强气氛组！每小时准时发疯的间歇泉！',
            'Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.4922, 141.1480,
            'nature',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- 3. Dosanko Pudding (道产子ぷりん)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Dosanko Pudding' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Dosanko Pudding',
            '道产子ぷりん',
            '布丁界颜值天花板！坐在温泉桶里出道！',
            'Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.4918, 141.1475,
            'food',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- 4. Enma-do (阎魔殿)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Enma-do' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Enma-do',
            '阎魔殿',
            '地狱判官在线变脸！表情包素材库狂喜！',
            'Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.4915, 141.1470,
            'culture',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- 5. Yuzawa Shrine (汤泽神社)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Yuzawa Shrine' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Yuzawa Shrine',
            '汤泽神社',
            '雪中静谧神社！祈福氛围感拿捏死了！',
            '106 Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.4940, 141.1485,
            'culture',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- 6. Noboribetsu Jigokudani (登别地狱谷)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Noboribetsu Jigokudani' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Noboribetsu Jigokudani',
            '登别地狱谷',
            '异世界登录点！朋友圈摄影大赛冠军稳了！',
            'Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.4983, 141.1467,
            'nature',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- 7. Noboribetsu Sekisuitei (住宿：登别石水亭)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Noboribetsu Sekisuitei' AND region_id = v_noboribetsu_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Noboribetsu Sekisuitei',
            '住宿：登别石水亭',
            '暴走一天后的终极治愈！吃喝泡躺一键躺平！',
            '203-1 Noboribetsuonsencho, Noboribetsu, Hokkaido 059-0551, Japan',
            42.5020, 141.1430,
            'accommodation',
            'https://maps.app.goo.gl/example',
            v_noboribetsu_id,
            'active'
        );
    END IF;

    -- ------------------------------------------
    -- CHIBA (Disney)
    -- ------------------------------------------
    -- Chiba Prefecture
    SELECT id INTO v_chiba_region_id FROM regions WHERE name = 'Chiba' AND country = 'Japan';
    IF v_chiba_region_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Chiba', '千叶县', 'Home to Tokyo Disney Resort and Narita International Airport.', NULL, 'CHB', 'Japan', NULL, 'chiba')
        RETURNING id INTO v_chiba_region_id;
    END IF;

    -- Urayasu City
    SELECT id INTO v_urayasu_id FROM regions WHERE name = 'Urayasu' AND parent_id = v_chiba_region_id;
    IF v_urayasu_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Urayasu', '浦安市', 'City in Chiba Prefecture, famous for Tokyo Disney Resort.', NULL, 'URY', 'Japan', v_chiba_region_id, 'urayasu')
        RETURNING id INTO v_urayasu_id;
    END IF;

    -- Spot: Tokyo Disneyland
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Tokyo Disneyland') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Tokyo Disneyland', '东京迪士尼乐园', '左手童话右手海洋，全球唯一双魔法体验！经典童话照进现实，白雪公主的城堡在夜幕中为你点亮烟花！', '1-1 Maihama, Urayasu, Chiba 279-0031, Japan', 35.6329, 139.8804, 'entertainment', 'https://maps.app.goo.gl/example', v_urayasu_id, 'active');
    END IF;

    -- Spot: Tokyo DisneySea
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Tokyo DisneySea') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Tokyo DisneySea', '东京迪士尼海洋', '全球独此一家！火山在海上爆发，海盗船驶向地中海港湾，连美人鱼都住在真实礁湖里！', '1-13 Maihama, Urayasu, Chiba 279-8511, Japan', 35.6267, 139.8851, 'entertainment', 'https://maps.app.goo.gl/example', v_urayasu_id, 'active');
    END IF;

    -- ------------------------------------------
    -- YAMANASHI
    -- ------------------------------------------
    -- Yamanashi Prefecture
    SELECT id INTO v_yamanashi_region_id FROM regions WHERE name = 'Yamanashi' AND country = 'Japan';
    IF v_yamanashi_region_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Yamanashi', '山梨县', 'Home to Mount Fuji and the Fuji Five Lakes.', NULL, 'YMS', 'Japan', NULL, 'yamanashi')
        RETURNING id INTO v_yamanashi_region_id;
    END IF;

    -- Fujiyoshida City
    SELECT id INTO v_fujiyoshida_id FROM regions WHERE name = 'Fujiyoshida' AND parent_id = v_yamanashi_region_id;
    IF v_fujiyoshida_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Fujiyoshida', '富士吉田市', 'City at the northern base of Mount Fuji.', NULL, 'FJY', 'Japan', v_yamanashi_region_id, 'fujiyoshida')
        RETURNING id INTO v_fujiyoshida_id;
    END IF;

    -- Spot: Arakurayama Sengen Park
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Arakurayama Sengen Park') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Arakurayama Sengen Park', '新仓山浅间公园', '闯进冬日限定的富士山明信片！五重塔+富士山同框的绝美机位！', '2-chōme-4-1 Asama, Fujiyoshida, Yamanashi 403-0011, Japan', 35.5011, 138.8015, 'nature', 'https://maps.app.goo.gl/example', v_fujiyoshida_id, 'active');
    END IF;

    -- Spot: Kanadorii
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kanadorii') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Kanadorii', '金鸟居', '10公尺高青铜巨框！我亲手为富士山裱上了千年画框！通往富士山的大门！', 'Kamiyoshida, Fujiyoshida, Yamanashi 403-0005, Japan', 35.4852, 138.7966, 'culture', 'https://maps.app.goo.gl/example', v_fujiyoshida_id, 'active');
    END IF;

    -- Oshino Village
    SELECT id INTO v_oshino_id FROM regions WHERE name = 'Oshino' AND parent_id = v_yamanashi_region_id;
    IF v_oshino_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Oshino', '忍野村', 'Small village famous for Oshino Hakkai springs.', NULL, 'OSN', 'Japan', v_yamanashi_region_id, 'oshino')
        RETURNING id INTO v_oshino_id;
    END IF;

    -- Spot: Oshino Hakkai
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Oshino Hakkai') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Oshino Hakkai', '忍野八海', '潜入富士山脚下的蓝眼泪秘境！八个清澈到犯规的泉池，被誉为“日本小九寨沟”！', 'Shibokusa, Oshino, Minamitsuru District, Yamanashi 401-0511, Japan', 35.4605, 138.8328, 'nature', 'https://maps.app.goo.gl/example', v_oshino_id, 'active');
    END IF;

    -- Yamanakako Village
    SELECT id INTO v_yamanakako_id FROM regions WHERE name = 'Yamanakako' AND parent_id = v_yamanashi_region_id;
    IF v_yamanakako_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Yamanakako', '山中湖村', 'Village around Lake Yamanaka, the largest of the Fuji Five Lakes.', NULL, 'YMK', 'Japan', v_yamanashi_region_id, 'yamanakako')
        RETURNING id INTO v_yamanakako_id;
    END IF;

    -- Spot: Hirano no Hama
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Hirano no Hama') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Hirano no Hama', '山中湖平野の浜', '把富士山和天鹅装进镜面湖里！拍摄“逆富士”的绝佳地点！', 'Hirano, Yamanakako, Minamitsuru District, Yamanashi 401-0502, Japan', 35.4225, 138.9056, 'nature', 'https://maps.app.goo.gl/example', v_yamanakako_id, 'active');
    END IF;

    -- ------------------------------------------
    -- YAMAGATA
    -- ------------------------------------------
    -- Yamagata Prefecture
    SELECT id INTO v_yamagata_region_id FROM regions WHERE name = 'Yamagata' AND country = 'Japan';
    IF v_yamagata_region_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Yamagata', 
            '山形县', 
            'Known for mountains, hot springs, and temples.', 
            NULL, 
            'YGT', 
            'Japan', 
            NULL,
            'yamagata'
        ) RETURNING id INTO v_yamagata_region_id;
    END IF;

    -- Obanazawa (City - for Ginzan Onsen)
    SELECT id INTO v_obanazawa_id FROM regions WHERE name = 'Obanazawa' AND parent_id = v_yamagata_region_id;
    IF v_obanazawa_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Obanazawa', 
            '尾花泽市', 
            'Home to the famous Ginzan Onsen.', 
            NULL, 
            'OBZ', 
            'Japan', 
            v_yamagata_region_id,
            'obanazawa'
        ) RETURNING id INTO v_obanazawa_id;
    END IF;

    -- GINZAN ONSEN SPOTS
    -- 1. Takimikan (泷见馆)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Takimikan' AND region_id = v_obanazawa_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Takimikan',
            '泷见馆',
            '别馆位于温泉街尽头瀑布对面，是欣赏瀑布美景的绝佳位置。',
            '522 Ginzanshinhata, Obanazawa, Yamagata 999-4333, Japan',
            38.5694, 140.5317,
            'accommodation',
            'https://maps.app.goo.gl/example',
            v_obanazawa_id,
            'active'
        );
    END IF;

    -- 2. Shirogane Falls (白银瀑布)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Shirogane Falls' AND region_id = v_obanazawa_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Shirogane Falls',
            '白银瀑布',
            '位于温泉街最深处有个白银公园，里头有一道高度落差达22公尺的瀑布。',
            'Ginzanshinhata, Obanazawa, Yamagata 999-4333, Japan',
            38.5690, 140.5315,
            'nature',
            'https://maps.app.goo.gl/example',
            v_obanazawa_id,
            'active'
        );
    END IF;

    -- 3. Ginzan Onsen Street (银山温泉街)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Ginzan Onsen Street' AND region_id = v_obanazawa_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Ginzan Onsen Street',
            '银山温泉街',
            '被称为《千与千寻》中“汤屋”原型的温泉街，真实又梦幻～',
            'Ginzanshinhata, Obanazawa, Yamagata 999-4333, Japan',
            38.5705, 140.5305,
            'culture',
            'https://maps.app.goo.gl/example',
            v_obanazawa_id,
            'active'
        );
    END IF;

    -- 4. Yukemuri Shokudo Shirogane (湯けむり食堂しろがね)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Yukemuri Shokudo Shirogane' AND region_id = v_obanazawa_id) THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES (
            'Yukemuri Shokudo Shirogane',
            '湯けむり食堂しろがね',
            '餐厅位于温泉街尾端，白银瀑布附近，提供多种热食和甜点。',
            'Ginzanshinhata, Obanazawa, Yamagata, Japan',
            38.5698, 140.5310,
            'food',
            'https://maps.app.goo.gl/example',
            v_obanazawa_id,
            'active'
        );
    END IF;

    -- Yamagata City (Zao Onsen area)
    SELECT id INTO v_yamagata_city_id FROM regions WHERE name = 'Yamagata City' AND parent_id = v_yamagata_region_id;
    IF v_yamagata_city_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES ('Yamagata City', '山形市', 'Capital city of Yamagata Prefecture, home to Zao Onsen.', NULL, 'YGT-C', 'Japan', v_yamagata_region_id, 'yamagata-city')
        RETURNING id INTO v_yamagata_city_id;
    END IF;

    -- Spot: Kajimaya Men Yatai
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kajimaya Men Yatai') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Kajimaya Men Yatai', 'かじまや面屋台', '一下车就暖到心巴上的食堂！生姜烧猪肉定食一绝！', '904-4 Zaoonsen, Yamagata, 990-2301, Japan', 38.1664, 140.3956, 'food', 'https://maps.app.goo.gl/example', v_yamagata_city_id, 'active');
    END IF;

    -- Spot: Zao Onsen Street
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Zao Onsen Street') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Zao Onsen Street', '藏王温泉街', '闯进会呼吸的雪国漫画！温泉蒸汽与积雪交织的梦幻小镇！', 'Zaoonsen, Yamagata, 990-2301, Japan', 38.1695, 140.3969, 'culture', 'https://maps.app.goo.gl/example', v_yamagata_city_id, 'active');
    END IF;

    -- Spot: Zao Tree Ice (Juhyo)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Zao Tree Ice') THEN
        INSERT INTO locations (name, name_cn, description, address, latitude, longitude, category, google_maps_url, region_id, status)
        VALUES ('Zao Tree Ice', '藏王树冰', '直面冰雪王国的终极大招！满山遍野的“雪怪”视觉震撼！', 'Zaoonsen, Yamagata, 990-2301, Japan', 38.1492, 140.4071, 'nature', 'https://maps.app.goo.gl/example', v_yamagata_city_id, 'active');
    END IF;

END $$;
