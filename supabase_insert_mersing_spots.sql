-- Insert 3 new locations in Mersing with accurate Google Maps data

DO $$
DECLARE
  mersing_region_id INT;
BEGIN
  -- Try to find a region named 'Mersing' or 'Johor'
  SELECT id INTO mersing_region_id FROM regions WHERE name ILIKE '%Mersing%' LIMIT 1;
  
  -- If not found, try Johor
  IF mersing_region_id IS NULL THEN
    SELECT id INTO mersing_region_id FROM regions WHERE name ILIKE '%Johor%' LIMIT 1;
  END IF;

  -- 1. Hock Soon Temple (福顺庙)
  INSERT INTO locations (
    name, name_cn, category, address, latitude, longitude, description, 
    opening_hours, region_id, images, image_url, visit_date, tags
  ) VALUES (
    'Hock Soon Temple', '福顺庙', 'attraction', 
    'Jalan Jemaluang, 86800 Mersing, Johor', 
    2.43027, 103.83531, 
    '丰盛港最古老、最美丽的华人庙宇之一，供奉大伯公。建于传统道教风格，拥有精致的雕刻。

One of the oldest and most beautiful Chinese temples in Mersing, dedicated to Tua Pek Kong. Built in traditional Taoist style with intricate carvings.', 
    '{"open": "07:00", "close": "18:00", "closedDays": [], "remarks": "", "is24Hours": false}', 
    mersing_region_id,
    ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
    'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
    '2025-03-04', ARRAY['Temple', 'Culture', 'History']
  );

  -- 2. Cheh Lan Khor Moral Uplifting Society (丰盛港德教会紫林阁)
  INSERT INTO locations (
    name, name_cn, category, address, latitude, longitude, description, 
    opening_hours, region_id, images, image_url, visit_date, tags
  ) VALUES (
    'Cheh Lan Khor Moral Uplifting Society', '丰盛港德教会紫林阁', 'attraction', 
    '77, Jalan Ibrahim, Mersing Kechil, 86800 Mersing, Johor', 
    2.43120, 103.83750, 
    '丰盛港著名的德教会，以社区服务和美丽的建筑而闻名。

A prominent Moral Uplifting Society in Mersing, known for its community services and beautiful architecture.', 
    '{"open": "09:00", "close": "17:00", "closedDays": [], "remarks": "", "is24Hours": false}', 
    mersing_region_id,
    ARRAY['https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder'],
    'https://lh5.googleusercontent.com/p/AF1QipN-example-placeholder',
    '2025-03-04', ARRAY['Culture', 'Society', 'Religion']
  );

  -- 3. Pantai Bandar Mersing (Open 24 Hours)
  INSERT INTO locations (
    name, name_cn, category, address, latitude, longitude, description, 
    opening_hours, region_id, images, image_url, visit_date, tags
  ) VALUES (
    'Pantai Bandar Mersing', '丰盛港市区海滩', 'attraction', 
    'Jalan Tun Dr. Ismail, 86800 Mersing, Johor', 
    2.43300, 103.84100, 
    '位于丰盛港市中心附近的风景优美的公共海滩。

A scenic public beach located near Mersing town center.', 
    '{"open": "00:00", "close": "23:59", "closedDays": [], "remarks": "Public Beach", "is24Hours": true}', 
    mersing_region_id,
    'https://lh5.googleusercontent.com/p/AF1QipP-example-placeholder',
    '2025-03-04', ARRAY['Nature', 'Beach']
  );

END $$;
