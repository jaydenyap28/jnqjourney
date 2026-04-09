-- Enable Row Level Security (RLS) on the locations table
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- 1. DROP existing policies to avoid "already exists" errors
DROP POLICY IF EXISTS "Enable read access for all users" ON locations;
DROP POLICY IF EXISTS "Enable insert access for all users" ON locations;
DROP POLICY IF EXISTS "Enable update access for all users" ON locations;

-- 2. Allow everyone to VIEW (SELECT) locations
CREATE POLICY "Enable read access for all users" 
ON locations FOR SELECT 
USING (true);

-- 3. Allow everyone to ADD (INSERT) locations
CREATE POLICY "Enable insert access for all users" 
ON locations FOR INSERT 
WITH CHECK (true);

-- 4. Allow everyone to UPDATE locations
CREATE POLICY "Enable update access for all users" 
ON locations FOR UPDATE 
USING (true);
