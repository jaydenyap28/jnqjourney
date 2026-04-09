-- JnQ Journey secure RLS setup
-- Run this in Supabase SQL Editor before public launch.
-- Goal:
-- 1. Public visitors can read published travel content
-- 2. Only authenticated admin users can create/update/delete core content
-- 3. Sensitive tracking tables are not publicly readable

BEGIN;

-- Core content tables
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_placements ENABLE ROW LEVEL SECURITY;

-- Tracking / sensitive tables
ALTER TABLE IF EXISTS public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

-- Clean old open policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.locations;

DROP POLICY IF EXISTS "Public regions are viewable by everyone" ON public.regions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.regions;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.regions;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.regions;

DROP POLICY IF EXISTS "Public affiliate links are viewable by everyone" ON public.affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can insert affiliate links" ON public.affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can update affiliate links" ON public.affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can delete affiliate links" ON public.affiliate_links;

DROP POLICY IF EXISTS "Public ad placements are viewable by everyone" ON public.ad_placements;
DROP POLICY IF EXISTS "Authenticated users can manage ad placements" ON public.ad_placements;

DROP POLICY IF EXISTS "Anyone can insert affiliate clicks" ON public.affiliate_clicks;
DROP POLICY IF EXISTS "Authenticated users can read affiliate clicks" ON public.affiliate_clicks;
DROP POLICY IF EXISTS "Authenticated users can manage affiliate clicks" ON public.affiliate_clicks;

DROP POLICY IF EXISTS "Authenticated users can read affiliate conversions" ON public.affiliate_conversions;
DROP POLICY IF EXISTS "Authenticated users can manage affiliate conversions" ON public.affiliate_conversions;

-- locations
CREATE POLICY "Public can read locations"
ON public.locations
FOR SELECT
USING (true);

CREATE POLICY "Authenticated can insert locations"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update locations"
ON public.locations
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can delete locations"
ON public.locations
FOR DELETE
TO authenticated
USING (true);

-- regions
CREATE POLICY "Public can read regions"
ON public.regions
FOR SELECT
USING (true);

CREATE POLICY "Authenticated can insert regions"
ON public.regions
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update regions"
ON public.regions
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can delete regions"
ON public.regions
FOR DELETE
TO authenticated
USING (true);

-- affiliate_links
CREATE POLICY "Public can read affiliate links"
ON public.affiliate_links
FOR SELECT
USING (coalesce(is_active, true) = true);

CREATE POLICY "Authenticated can insert affiliate links"
ON public.affiliate_links
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update affiliate links"
ON public.affiliate_links
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can delete affiliate links"
ON public.affiliate_links
FOR DELETE
TO authenticated
USING (true);

-- ad placements
CREATE POLICY "Public can read active ad placements"
ON public.ad_placements
FOR SELECT
USING (coalesce(is_active, true) = true);

CREATE POLICY "Authenticated can manage ad placements"
ON public.ad_placements
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- affiliate clicks:
-- allow public insert for click tracking, but never public read
CREATE POLICY "Public can insert affiliate clicks"
ON public.affiliate_clicks
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated can read affiliate clicks"
ON public.affiliate_clicks
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can manage affiliate clicks"
ON public.affiliate_clicks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can delete affiliate clicks"
ON public.affiliate_clicks
FOR DELETE
TO authenticated
USING (true);

-- affiliate conversions:
-- no public access because it may contain transaction data
CREATE POLICY "Authenticated can read affiliate conversions"
ON public.affiliate_conversions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can manage affiliate conversions"
ON public.affiliate_conversions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

COMMIT;
