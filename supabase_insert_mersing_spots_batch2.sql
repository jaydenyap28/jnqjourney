-- Insert 6 new spots into Mersing region
DO $$
DECLARE
    mersing_region_id INT;
BEGIN
    -- Get the region_id for Mersing
    SELECT id INTO mersing_region_id FROM regions WHERE name = 'Mersing';

    -- 1. Chicken Delight 美國喜愛雞
    INSERT INTO locations (
        name,
        name_cn,
        category,
        address,
        latitude,
        longitude,
        description,
        opening_hours,
        region_id,
        images,
        image_url,
        visit_date,
        tags
    ) VALUES (
        'Chicken Delight',
        '美國喜愛雞',
        'restaurant',
        '43, Jln Ismail, Mersing Kechil, 86800 Mersing, Johor',
        2.42985,
        103.83857,
        '丰盛港著名的炸鸡店。一个充满怀旧情怀的地方，供应具有独特当地风味的香脆炸鸡，是当地人的早餐和午餐热门选择。

Famous fried chicken shop in Mersing. A nostalgic spot serving crispy fried chicken with a unique local taste, popular for breakfast and lunch among locals.',
        '{"is24Hours": false, "open": "08:00", "close": "22:00", "closedDays": [], "remarks": ""}',
        mersing_region_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'], -- Placeholder
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-03-04',
        ARRAY['Food', 'Local Favorite', 'Fried Chicken']
    );

    -- 2. Pantai Teluk Buih
    INSERT INTO locations (
        name,
        name_cn,
        category,
        address,
        latitude,
        longitude,
        description,
        opening_hours,
        region_id,
        images,
        image_url,
        visit_date,
        tags
    ) VALUES (
        'Pantai Teluk Buih',
        '泡沫湾海滩',
        'attraction',
        'Jln Teluk Buih, Air Papan, 86800 Mersing, Johor',
        2.525, -- Approximate based on description (north of Air Papan)
        103.835, -- Approximate
        '被称为“泡沫湾”的隐藏宝石。拥有私人海滩般的氛围，海水清澈，沙滩柔软，是寻求宁静的理想之地。

A hidden gem known as Bubble Bay. Features a private beach-like atmosphere with crystal clear water and soft sands, ideal for those seeking tranquility.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open 24 hours"}',
        mersing_region_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-03-04',
        ARRAY['Nature', 'Beach', 'Hidden Gem']
    );

    -- 3. Pantai Air Papan
    INSERT INTO locations (
        name,
        name_cn,
        category,
        address,
        latitude,
        longitude,
        description,
        opening_hours,
        region_id,
        images,
        image_url,
        visit_date,
        tags
    ) VALUES (
        'Pantai Air Papan',
        'Air Papan海滩',
        'attraction',
        'Jalan Pantai, Kampung Air Papan, 86800 Mersing, Johor',
        2.517,
        103.831,
        '丰盛港最受欢迎的大众海滩之一。拥有长长的沙滩海岸线，海水清澈，非常适合野餐、游泳和享受海风。

One of the most popular public beaches in Mersing. Features a long sandy coastline with clear water, perfect for picnics, swimming, and enjoying the sea breeze.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open 24 hours"}',
        mersing_region_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-03-04',
        ARRAY['Nature', 'Beach', 'Popular']
    );

    -- 4. Sawah Air Papan
    INSERT INTO locations (
        name,
        name_cn,
        category,
        address,
        latitude,
        longitude,
        description,
        opening_hours,
        region_id,
        images,
        image_url,
        visit_date,
        tags
    ) VALUES (
        'Sawah Air Papan',
        'Air Papan稻田',
        'attraction',
        'Kampung Air Papan, 86800 Mersing, Johor',
        2.5092,
        103.83104,
        '海边的美丽稻田。绿色的稻田与沿海背景形成独特的风景，是摄影和欣赏自然风光的绝佳地点。

Beautiful paddy fields by the sea. The green paddy fields against the coastal backdrop create a unique scenery, excellent for photography and enjoying nature.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open 24 hours"}',
        mersing_region_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-03-04',
        ARRAY['Nature', 'Scenery', 'Photography']
    );

    -- 5. Pantai Tanjung Resang
    INSERT INTO locations (
        name,
        name_cn,
        category,
        address,
        latitude,
        longitude,
        description,
        opening_hours,
        region_id,
        images,
        image_url,
        visit_date,
        tags
    ) VALUES (
        'Pantai Tanjung Resang',
        'Tanjung Resang海滩',
        'attraction',
        'Jln Pantai Tanjung Resang, 86900 Endau, Johor',
        2.644,
        103.7645,
        '位于Penyabong和Air Papan之间的宁静海滩。以细沙和清澈的海水而闻名，大部分时间风平浪静，非常适合放松。

A serene beach located between Penyabong and Air Papan. Known for its fine sand and clear waters, it is calm most of the year, making it perfect for relaxation.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open 24 hours"}',
        mersing_region_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-03-04',
        ARRAY['Nature', 'Beach', 'Quiet']
    );

    -- 6. Pantai Penyabung
    INSERT INTO locations (
        name,
        name_cn,
        category,
        address,
        latitude,
        longitude,
        description,
        opening_hours,
        region_id,
        images,
        image_url,
        visit_date,
        tags
    ) VALUES (
        'Pantai Penyabung',
        'Penyabung海滩',
        'attraction',
        'Kampung Penyabong Pantai, 86900 Endau, Johor',
        2.64571,
        103.74969,
        '前身为“海盗沙滩”（Pantai Pasir Lanun）。一个历史悠久且风景优美的海滩，拥有码头和美丽的景色，是野餐和休闲的热门地点。

Formerly known as Pantai Pasir Lanun (Pirate''s Sand Beach). A historic and scenic beach with a jetty and beautiful views, a popular spot for picnics and leisure.',
        '{"is24Hours": true, "open": "", "close": "", "closedDays": [], "remarks": "Open 24 hours"}',
        mersing_region_id,
        ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
        'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
        '2025-03-04',
        ARRAY['Nature', 'Beach', 'History']
    );

END $$;
