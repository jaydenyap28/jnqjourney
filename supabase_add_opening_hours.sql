-- Add opening_hours column to locations table
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS opening_hours TEXT;
