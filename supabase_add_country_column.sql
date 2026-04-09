-- Add country column to regions table for Internationalization
-- Default value: 'Malaysia' for existing records

DO $$
BEGIN
    -- Check if 'country' column exists in 'regions' table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'country') THEN
        -- Add the column
        ALTER TABLE regions ADD COLUMN country TEXT DEFAULT 'Malaysia';
        
        -- Update existing records to have 'Malaysia' (handled by DEFAULT, but explicit update ensures consistency)
        UPDATE regions SET country = 'Malaysia' WHERE country IS NULL;
        
        RAISE NOTICE 'Added country column to regions table.';
    ELSE
        RAISE NOTICE 'Column country already exists in regions table.';
    END IF;
END $$;
