-- Add Indonesia spots (Batam)
-- This script adds the country 'Indonesia', state 'Kepulauan Riau', city 'Batam', and 16 spots.

DO $$
DECLARE
    v_kepri_id INTEGER;
    v_batam_id INTEGER;
    v_location_id INTEGER;
BEGIN
    -- 1. Ensure Regions Exist
    -- Kepulauan Riau (State)
    SELECT id INTO v_kepri_id FROM regions WHERE name = 'Kepulauan Riau' AND country = 'Indonesia';
    IF v_kepri_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Kepulauan Riau', 
            '廖内群岛', 
            'Riau Islands Province, Indonesia', 
            NULL, 
            'KEPRI', 
            'Indonesia', 
            NULL,
            'kepulauan-riau'
        ) RETURNING id INTO v_kepri_id;
    END IF;

    -- Batam (City)
    SELECT id INTO v_batam_id FROM regions WHERE name = 'Batam' AND parent_id = v_kepri_id;
    IF v_batam_id IS NULL THEN
        INSERT INTO regions (name, name_cn, description, image_url, code, country, parent_id, slug)
        VALUES (
            'Batam', 
            '巴淡岛', 
            'The largest city in the province of Riau Islands, Indonesia.', 
            NULL, 
            'BTM', 
            'Indonesia', 
            v_kepri_id,
            'batam'
        ) RETURNING id INTO v_batam_id;
    END IF;

    -- 2. Insert Spots
    -- Note: Coordinates are approximate based on search results.

    -- 1. Kepri Seafood Restaurant
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Kepri Seafood Restaurant') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Kepri Seafood Restaurant',
            'Popular seafood restaurant with a rustic ambiance, known for fresh crab and gong gong.',
            'Jl. Trans Barelang, Setokok, Kec. Bulang, Kota Batam, Kepulauan Riau 29481, Indonesia',
            0.963000, 104.045000,
            'Food',
            'https://maps.google.com/?q=Kepri+Seafood+Restaurant+Batam',
            '{"standard": {"Mon": "10:00-22:00", "Tue": "10:00-22:00", "Wed": "10:00-22:00", "Thu": "10:00-22:00", "Fri": "10:00-22:00", "Sat": "10:00-22:00", "Sun": "10:00-22:00"}}',
            v_batam_id
        );
    END IF;

    -- 2. Barelang Jembatan 1
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Barelang Jembatan 1') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Barelang Jembatan 1',
            'Iconic bridge connecting Batam, Rempang, and Galang islands. A must-visit landmark.',
            'Jl. Trans Barelang, Sembulang, Galang, Kota Batam, Kepulauan Riau 29481, Indonesia',
            0.983000, 104.037000,
            'Sightseeing',
            'https://maps.google.com/?q=Barelang+Jembatan+1',
            '{"standard": {"Mon": "00:00-23:59", "Tue": "00:00-23:59", "Wed": "00:00-23:59", "Thu": "00:00-23:59", "Fri": "00:00-23:59", "Sat": "00:00-23:59", "Sun": "00:00-23:59"}}',
            v_batam_id
        );
    END IF;

    -- 3. Puncak Beliung
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Puncak Beliung') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Puncak Beliung',
            'Scenic hilltop spot with panoramic views, photo ops ("Batam Swing", "Stairway to Heaven"), and lush greenery.',
            'Jl. Diponegoro, Tj. Riau, Kec. Sekupang, Kota Batam, Kepulauan Riau 29425, Indonesia',
            1.107000, 103.931000,
            'Sightseeing',
            'https://maps.google.com/?q=Puncak+Beliung+Batam',
            '{"standard": {"Mon": "08:00-18:00", "Tue": "08:00-18:00", "Wed": "08:00-18:00", "Thu": "08:00-18:00", "Fri": "08:00-18:00", "Sat": "08:00-18:00", "Sun": "08:00-18:00"}}',
            v_batam_id
        );
    END IF;

    -- 4. BlueFire Beach Club (粉色沙滩酒吧)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'BlueFire Beach Club (粉色沙滩酒吧)') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'BlueFire Beach Club (粉色沙滩酒吧)',
            'Trendy beach club with pink sand, pool, live DJ, and fire shows. Great for sunset and nightlife.',
            'Gold Coast Luxury, Jl. Golden City, Bengkong Laut, Kota Batam, Kepulauan Riau 29453, Indonesia',
            1.157000, 104.045000,
            'Food', -- Also Nightlife/Sightseeing
            'https://maps.google.com/?q=BlueFire+Beach+Club+Batam',
            '{"standard": {"Mon": "16:00-03:30", "Tue": "16:00-03:30", "Wed": "16:00-03:30", "Thu": "16:00-03:30", "Fri": "16:00-03:30", "Sat": "16:00-03:30", "Sun": "16:00-03:30"}}',
            v_batam_id
        );
    END IF;

    -- 5. a2 Foodcourt
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'a2 Foodcourt') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'a2 Foodcourt',
            'Large, popular open-air food court offering a wide variety of local and seafood dishes.',
            'Jl. Bunga Mawar, Batu Selicin, Kec. Lubuk Baja, Kota Batam, Kepulauan Riau 29444, Indonesia',
            1.135000, 104.008000,
            'Food',
            'https://maps.google.com/?q=a2+Foodcourt+Batam',
            '{"standard": {"Mon": "06:00-01:00", "Tue": "06:00-01:00", "Wed": "06:00-01:00", "Thu": "06:00-01:00", "Fri": "06:00-01:00", "Sat": "06:00-01:00", "Sun": "06:00-01:00"}}',
            v_batam_id
        );
    END IF;

    -- 6. Absolute Massage
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Absolute Massage') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Absolute Massage',
            'Relaxing spa offering traditional Indonesian massage, foot reflexology, and aromatherapy.',
            'Ruko Penuin Blok OA No.12 - 12A, Batu Selicin, Kec. Lubuk Baja, Kota Batam, Kepulauan Riau 29444, Indonesia',
            1.133000, 104.009000,
            'Culture', -- Wellness
            'https://maps.google.com/?q=Absolute+Massage+Batam',
            '{"standard": {"Mon": "10:00-22:00", "Tue": "10:00-22:00", "Wed": "10:00-22:00", "Thu": "10:00-22:00", "Fri": "10:00-22:00", "Sat": "10:00-22:00", "Sun": "10:00-22:00"}}',
            v_batam_id
        );
    END IF;

    -- 7. Golden View Hotel
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Golden View Hotel') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Golden View Hotel',
            '4-star hotel in Bengkong Laut with sea views, pool, and easy access to Golden City attractions.',
            'Jl. Bengkong Laut, Bengkong, Batam, Kepulauan Riau 29433, Indonesia',
            1.157000, 104.040000,
            'Accommodation',
            'https://maps.google.com/?q=Golden+View+Hotel+Batam',
            '{"standard": {"Mon": "00:00-23:59", "Tue": "00:00-23:59", "Wed": "00:00-23:59", "Thu": "00:00-23:59", "Fri": "00:00-23:59", "Sat": "00:00-23:59", "Sun": "00:00-23:59"}}',
            v_batam_id
        );
    END IF;

    -- 8. 70 Fahrenheit Koffie Batam
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = '70 Fahrenheit Koffie Batam') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            '70 Fahrenheit Koffie Batam',
            'Coffee factory and cafe offering educational tours, tastings, and a variety of Indonesian coffee beans.',
            'Komp. Golden City, Blk. A No.1, Bengkong Laut, Bengkong, Kota Batam, Kepulauan Riau 29458, Indonesia',
            1.158000, 104.045000,
            'Food',
            'https://maps.google.com/?q=70+Fahrenheit+Koffie+Batam',
            '{"standard": {"Mon": "09:00-17:30", "Tue": "09:00-17:30", "Wed": "09:00-17:30", "Thu": "09:00-17:30", "Fri": "09:00-17:30", "Sat": "09:00-17:30", "Sun": "09:00-17:30"}}',
            v_batam_id
        );
    END IF;

    -- 9. Golden GoKart
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Golden GoKart') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Golden GoKart',
            'Exciting go-kart track in Golden City, suitable for families and thrill-seekers.',
            'Bengkong Laut, Bengkong, Tj. Buntung, Kota Batam, Kepulauan Riau 29444, Indonesia',
            1.158000, 104.045000,
            'Sightseeing',
            'https://maps.google.com/?q=Golden+City+Go-Kart+Batam',
            '{"standard": {"Mon": "09:00-18:00", "Tue": "09:00-18:00", "Wed": "09:00-18:00", "Thu": "09:00-18:00", "Fri": "09:00-18:00", "Sat": "09:00-18:00", "Sun": "09:00-18:00"}}',
            v_batam_id
        );
    END IF;

    -- 10. Golden Factory Outlet
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Golden Factory Outlet') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Golden Factory Outlet',
            'Shopping outlet in Golden City offering clothes, batik, and souvenirs.',
            'Tanjung Buntung, Bengkong, Batam City, Riau Islands 29444, Indonesia',
            1.158000, 104.045000,
            'Shopping',
            'https://maps.google.com/?q=Golden+Factory+Outlet+Batam',
            '{"standard": {"Mon": "09:00-18:00", "Tue": "09:00-18:00", "Wed": "09:00-18:00", "Thu": "09:00-18:00", "Fri": "09:00-18:00", "Sat": "09:00-18:00", "Sun": "09:00-18:00"}}',
            v_batam_id
        );
    END IF;

    -- 11. Jia Jia Layer Cake (家家千层糕)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Jia Jia Layer Cake (家家千层糕)') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Jia Jia Layer Cake (家家千层糕)',
            'Famous shop for traditional Indonesian layer cakes (Kueh Lapis), a popular souvenir.',
            'Ruko Trikarsa Equalita Blok F No. 03, Pasir Putih, Kota Batam, Kepulauan Riau 29411, Indonesia',
            1.130000, 104.053000,
            'Shopping',
            'https://maps.google.com/?q=Jia+Jia+Layer+Cake+Batam',
            '{"standard": {"Mon": "08:00-17:00", "Tue": "08:00-17:00", "Wed": "08:00-17:00", "Thu": "08:00-17:00", "Fri": "08:00-17:00", "Sat": "08:00-17:00", "Sun": "08:00-17:00"}}',
            v_batam_id
        );
    END IF;

    -- 12. Royal Linest Anugerah (莉家燕窝)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Royal Linest Anugerah (莉家燕窝)') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Royal Linest Anugerah (莉家燕窝)',
            'Specialty shop offering high-quality edible bird''s nest and health products.',
            'Ruko Cahaya Garden Blok F Nomor 16, Bengkong, Kota Batam, Kepulauan Riau, Indonesia',
            1.147000, 104.038000,
            'Shopping',
            'https://maps.google.com/?q=Royal+Linest+Anugerah+Batam',
            '{"standard": {"Mon": "09:00-18:00", "Tue": "09:00-18:00", "Wed": "09:00-18:00", "Thu": "09:00-18:00", "Fri": "09:00-18:00", "Sat": "09:00-18:00", "Sun": "09:00-18:00"}}',
            v_batam_id
        );
    END IF;

    -- 13. Sentosa Batam
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Sentosa Batam') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Sentosa Batam',
            'Well-known seafood restaurant serving fresh, live seafood in a spacious setting.',
            'Sentosa Seafood, Jl. Duyung, Sungai Jodoh, Kec. Batu Ampar, Kota Batam, Kepulauan Riau 29432, Indonesia',
            1.150000, 104.002000,
            'Food',
            'https://maps.google.com/?q=Sentosa+Seafood+Batam',
            '{"standard": {"Mon": "10:00-22:00", "Tue": "10:00-22:00", "Wed": "10:00-22:00", "Thu": "10:00-22:00", "Fri": "10:00-22:00", "Sat": "10:00-22:00", "Sun": "10:00-22:00"}}',
            v_batam_id
        );
    END IF;

    -- 14. De Sands Cafe (小圣托里尼)
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'De Sands Cafe (小圣托里尼)') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'De Sands Cafe (小圣托里尼)',
            'Santorini-inspired cafe with white and blue decor, offering great photo spots and Western/Asian cuisine.',
            'Jl. Golden City Residence, Tj. Buntung, Kec. Bengkong, Kota Batam, Kepulauan Riau 29444, Indonesia',
            1.158000, 104.045000,
            'Food',
            'https://maps.google.com/?q=De+Sands+Cafe+Batam',
            '{"standard": {"Mon": "11:00-01:00", "Tue": "11:00-01:00", "Wed": "11:00-01:00", "Thu": "11:00-02:00", "Fri": "11:00-02:00", "Sat": "11:00-02:00", "Sun": "11:00-02:00"}}',
            v_batam_id
        );
    END IF;

    -- 15. Grand Batam Mall
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Grand Batam Mall') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Grand Batam Mall',
            'Modern and one of the largest shopping malls in Batam with international brands, cinema, and dining.',
            'Jl. Pembangunan, Batu Selicin, Kec. Lubuk Baja, Kota Batam, Kepulauan Riau 29444, Indonesia',
            1.137000, 104.007000,
            'Shopping',
            'https://maps.google.com/?q=Grand+Batam+Mall',
            '{"standard": {"Mon": "10:00-22:00", "Tue": "10:00-22:00", "Wed": "10:00-22:00", "Thu": "10:00-22:00", "Fri": "10:00-22:00", "Sat": "10:00-22:00", "Sun": "10:00-22:00"}}',
            v_batam_id
        );
    END IF;

    -- 16. Angkringan Tepi Danau
    IF NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Angkringan Tepi Danau') THEN
        INSERT INTO locations (name, description, address, latitude, longitude, category, google_maps_url, opening_hours, region_id)
        VALUES (
            'Angkringan Tepi Danau',
            'Lakeside dining spot in Golden City, offering affordable local snacks (angkringan style) and relaxed vibes.',
            'Golden City, Bengkong Laut, Kec. Bengkong, Kota Batam, Kepulauan Riau 29444, Indonesia',
            1.158000, 104.045000,
            'Food',
            'https://maps.google.com/?q=Angkringan+Tepi+Danau+Batam',
            '{"standard": {"Mon": "16:00-00:00", "Tue": "16:00-00:00", "Wed": "16:00-00:00", "Thu": "16:00-00:00", "Fri": "16:00-00:00", "Sat": "16:00-00:00", "Sun": "16:00-00:00"}}',
            v_batam_id
        );
    END IF;

END $$;
