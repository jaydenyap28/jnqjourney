-- Add structured price info support for locations

ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS price_info JSONB;
