-- Master Setup Script to ensure Schema is ready for Spot Insertion
-- Run this script FIRST before inserting spots!

BEGIN;

-- 1. Ensure 'regions' table has necessary columns
DO $$
BEGIN
    -- Add name_cn
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'name_cn') THEN
        ALTER TABLE regions ADD COLUMN name_cn TEXT;
    END IF;
    
    -- Add description
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'description') THEN
        ALTER TABLE regions ADD COLUMN description TEXT;
    END IF;

    -- Add image_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'image_url') THEN
        ALTER TABLE regions ADD COLUMN image_url TEXT;
    END IF;

    -- Add bounds
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'bounds') THEN
        ALTER TABLE regions ADD COLUMN bounds JSONB;
    END IF;

    -- Add slug
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'slug') THEN
        ALTER TABLE regions ADD COLUMN slug TEXT;
    END IF;
END $$;

-- 2. Ensure 'locations' table has necessary columns and correct names
DO $$
BEGIN
    -- Rename name_en to name_cn if old schema exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'name_en') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'name_cn') THEN
        ALTER TABLE locations RENAME COLUMN name_en TO name_cn;
    END IF;

    -- Add status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'status') THEN
        ALTER TABLE locations ADD COLUMN status text DEFAULT 'active';
    END IF;

    -- Add visit_date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'visit_date') THEN
        ALTER TABLE locations ADD COLUMN visit_date date;
    END IF;
    
    -- Add opening_hours
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'opening_hours') THEN
        ALTER TABLE locations ADD COLUMN opening_hours jsonb;
    END IF;

    -- Add google_maps_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'google_maps_url') THEN
        ALTER TABLE locations ADD COLUMN google_maps_url TEXT;
    END IF;
END $$;

COMMIT;
