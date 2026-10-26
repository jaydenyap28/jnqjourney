-- PROPOSAL ONLY. Archive original ACL and fill the independently reviewed allowlist first.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $plan$
DECLARE
  targets text[] := ARRAY[]::text[]; -- EXACTLY five reviewed public backup table names.
  target text;
  col text;
BEGIN
  IF cardinality(targets)<>5 OR (SELECT count(DISTINCT x) FROM unnest(targets) AS x)<>5 THEN
    RAISE EXCEPTION 'STOP: supply exactly five independently reviewed backup table names';
  END IF;
  FOREACH target IN ARRAY targets LOOP
    IF target IN ('locations','regions','travel_packages','travel_package_options','affiliate_links') OR
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=target AND c.relkind IN ('r','p')) THEN
      RAISE EXCEPTION 'Invalid backup target: %',target;
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',target);
    FOR col IN SELECT a.attname FROM pg_attribute a WHERE a.attrelid=to_regclass(format('public.%I',target)) AND a.attnum>0 AND NOT a.attisdropped LOOP
      EXECUTE format('REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.%2$I FROM PUBLIC, anon, authenticated',col,target);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
  END LOOP;
END $plan$;
-- Review ACL/RLS plus inherited-role/function exposure before separately authorizing COMMIT.
ROLLBACK;
