-- Add status column to locations table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'status') THEN
        ALTER TABLE locations ADD COLUMN status text DEFAULT 'active';
        COMMENT ON COLUMN locations.status IS 'Status of the location: active, closed, renovation, etc.';
        RAISE NOTICE 'Added status column to locations table';
    ELSE
        RAISE NOTICE 'status column already exists';
    END IF;
END $$;
