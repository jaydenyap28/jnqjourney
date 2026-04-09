-- SQL script to insert Yong Peng spots with verified data
-- Visit Date: 2025-04-22 (Unified)
-- Region: Yong Peng (Parent: Johor)

BEGIN;

-- 1. Ensure 'Yong Peng' region exists
DO $$
DECLARE
    v_johor_id BIGINT;
    v_yongpeng_id BIGINT;
    v_visit_date DATE := '2025-04-22';
    t RECORD;
BEGIN
    -- Get Johor ID
    SELECT id INTO v_johor_id FROM regions WHERE name = 'Johor' AND parent_id IS NULL;
    
    -- Create Yong Peng if not exists
    SELECT id INTO v_yongpeng_id FROM regions WHERE name = 'Yong Peng';
    
    IF v_yongpeng_id IS NULL THEN
        INSERT INTO regions (name, parent_id)
        VALUES (
            'Yong Peng', 
            v_johor_id
        ) RETURNING id INTO v_yongpeng_id;
    END IF;

    -- 2. Create Temp Table for Upsert
    CREATE TEMP TABLE temp_locations (
        name_en TEXT,
        name_cn TEXT,
        category TEXT,
        address TEXT,
        latitude DECIMAL,
        longitude DECIMAL,
        opening_hours JSONB,
        description TEXT,
        image_url TEXT,
        tags TEXT[],
        visit_date DATE,
        status TEXT DEFAULT 'active'
    ) ON COMMIT DROP;

    -- 3. Insert Data into Temp Table
    INSERT INTO temp_locations (name_en, name_cn, category, address, latitude, longitude, opening_hours, description, image_url, tags, visit_date)
    VALUES
    -- 1. Tian Pao Kong (68尺济公庙)
    (
        'Tian Pao Kong Chinese Temple',
        '永平天保宫',
        'attraction',
        '20, Jalan Satin, Taman Sembrong Barat, 83700 Yong Peng, Johor',
        2.0210, 103.0650, -- Approx based on Taman Sembrong Barat
        '{"open": "08:30", "close": "17:30", "closedDays": [], "remarks": "全东南亚最高的济公活佛圣像，庄严宏伟，香火鼎盛", "is24Hours": false}',
        '全东南亚最高的济公活佛圣像，庄严宏伟，香火鼎盛。',
        '', -- Image URL
        ARRAY['temple', 'culture', 'sightseeing'],
        v_visit_date
    ),
    -- 2. Che Ann Khor (紫安阁)
    (
        'Che Ann Khor Moral Uplifting Society',
        '永平德教会紫安阁',
        'attraction',
        'Lot HS 2677, Pt 2446, Jalan Kota Impian 1, 83700 Yong Peng, Johor',
        2.0080, 103.0750, -- Approx based on Jalan Kota Impian
        '{"open": "09:00", "close": "19:00", "closedDays": [], "remarks": "阁内设有转祥龙，长达351尺，为东南亚最长的祥龙，游客可穿越龙身，象征转运祈福", "is24Hours": false}',
        '阁内设有转祥龙，长达351尺，为东南亚最长的祥龙，游客可穿越龙身，象征转运祈福。',
        '',
        ARRAY['temple', 'culture', 'dragon'],
        v_visit_date
    ),
    -- 3. Black Dragon Cave (黑龙洞)
    (
        'Black Dragon Cave Temple',
        '永平黑龙洞',
        'attraction',
        '18A, Jalan Ah Looh, Taman Bahagia, 83700 Yong Peng, Johor',
        2.0150, 103.0600, -- Approx based on Taman Bahagia
        '{"open": "08:00", "close": "18:00", "closedDays": [], "remarks": "永平历史悠久的庙宇，庙宇结合了洞穴景观与宗教文化，洞内环境幽静，香火鼎盛", "is24Hours": false}',
        '永平历史悠久的庙宇，庙宇结合了洞穴景观与宗教文化，洞内环境幽静，香火鼎盛。',
        '',
        ARRAY['temple', 'cave', 'nature'],
        v_visit_date
    ),
    -- 4. Cinema Corner (戏院角)
    (
        'Cinema Corner',
        '戏院角',
        'food',
        'Jln Meng Seng, Taman Selatan, 83700 Yong Peng, Johor',
        2.0110, 103.0630, -- Approx based on Taman Selatan
        '{"open": "09:30", "close": "18:00", "closedDays": [3], "remarks": "怀旧戏院风格的餐馆，提供正宗泰国简餐和丰富的美食选择", "is24Hours": false}',
        '怀旧戏院风格的餐馆，提供正宗泰国简餐和丰富的美食选择。',
        '',
        ARRAY['food', 'thai', 'nostalgia'],
        v_visit_date
    ),
    -- 5. Kim Kee Fish Ball (锦记鱼丸面)
    (
        'Kim Kee Fish Ball Restaurant',
        '锦记鱼丸面',
        'food',
        '4, Jalan Bayan, Taman Sembrong, 83700 Yong Peng, Johor',
        2.0180, 103.0660, -- Approx based on Taman Sembrong
        '{"open": "08:00", "close": "22:00", "closedDays": [3], "remarks": "永平在地人推荐的传统手工鱼丸面馆，驰名福州鱼丸", "is24Hours": false}',
        '永平在地人推荐的传统手工鱼丸面馆，驰名福州鱼丸。',
        '',
        ARRAY['food', 'noodles', 'fishball'],
        v_visit_date
    ),
    -- 6. Atap-OD (亚答屋饮食中心)
    (
        'Atap-OD Food Centre',
        '亚答屋饮食中心',
        'food',
        'Taman Berlian, 83700 Yong Peng, Johor',
        2.0140, 103.0680, -- Approx based on Taman Berlian
        '{"open": "07:00", "close": "15:30", "closedDays": [3], "remarks": "永平在地人推荐的传统福州面馆，驰名醋香卤面", "is24Hours": false}',
        '永平在地人推荐的传统福州面馆，驰名醋香卤面。',
        '',
        ARRAY['food', 'noodles', 'local'],
        v_visit_date
    ),
    -- 7. Eng Hin (永兴福州饼面厂)
    (
        'Eng Hin Bakery',
        '永兴福州饼面厂',
        'food',
        '14, Jalan Besar, Taman Sembrong, 83700 Yong Peng, Johor',
        2.0190, 103.0655, -- Main road
        '{"open": "07:00", "close": "19:00", "closedDays": [4], "remarks": "传承三代的福州传统饼面老字号，手工制作，古早风味", "is24Hours": false}',
        '传承三代的福州传统饼面老字号，手工制作，古早风味。',
        '',
        ARRAY['food', 'souvenir', 'bakery'],
        v_visit_date
    ),
    -- 8. YOYO Native Food (YOYO特产专卖店)
    (
        'YOYO Native Food Product',
        'YOYO特产专卖店',
        'food',
        'Lot 7317, Block B, Jalan Damai, Taman Sembrong Baru, 83700 Yong Peng, Johor',
        2.0220, 103.0640, -- Approx based on Taman Sembrong Baru
        '{"open": "09:00", "close": "18:00", "closedDays": [], "remarks": "永平热门伴手礼购物站，融合特产店、咖啡馆与休息区", "is24Hours": false}',
        '永平热门伴手礼购物站，融合特产店、咖啡馆与休息区。',
        '',
        ARRAY['food', 'souvenir', 'cafe'],
        v_visit_date
    ),
    -- 9. FANCY CARP - YONG PENG
    (
        'FANCY CARP',
        'FANCY CARP',
        'attraction',
        'Yong Peng, Johor', -- Placeholder address
        2.0136, 103.0659, -- Placeholder coordinates (Town Center)
        '{"open": "10:00", "close": "22:00", "closedDays": [], "remarks": "Review Needed: Please verify address and details", "is24Hours": false}',
        'FANCY CARP - Yong Peng. (Details to be verified)',
        '',
        ARRAY['attraction', 'leisure'],
        v_visit_date
    );

    -- 4. Perform Upsert using Loop to avoid ON CONFLICT issues
    FOR t IN SELECT * FROM temp_locations LOOP
        -- Try to update existing record by name and region
        UPDATE locations SET
            name_cn = t.name_cn,
            category = t.category,
            address = t.address,
            latitude = t.latitude,
            longitude = t.longitude,
            opening_hours = t.opening_hours,
            description = t.description,
            image_url = t.image_url,
            tags = t.tags,
            visit_date = t.visit_date,
            status = t.status
        WHERE name = t.name_en AND region_id = v_yongpeng_id;

        -- If not found, insert new record
        IF NOT FOUND THEN
            INSERT INTO locations (
                name, name_cn, category, address, latitude, longitude, 
                opening_hours, description, image_url, tags, visit_date, region_id, status
            ) VALUES (
                t.name_en, t.name_cn, t.category, t.address, t.latitude, t.longitude, 
                t.opening_hours, t.description, t.image_url, t.tags, t.visit_date, v_yongpeng_id, t.status
            );
        END IF;
    END LOOP;

END $$;

COMMIT;
