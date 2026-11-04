-- Run in the same Preview project after bootstrap. Read-only checks.
BEGIN READ ONLY;

DO $$
DECLARE
  reader text;
  relation record;
  privilege text;
BEGIN
  FOREACH reader IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOR relation IN
      SELECT c.oid, c.relname, c.relrowsecurity, n.nspname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public'
    LOOP
      IF relation.nspname = 'public' AND NOT relation.relrowsecurity THEN
        RAISE EXCEPTION 'RLS disabled on %', relation.relname;
      END IF;
      FOREACH privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER'] LOOP
        IF has_table_privilege(reader, relation.oid, privilege) THEN
          RAISE EXCEPTION '% has % on %', reader, privilege, relation.relname;
        END IF;
      END LOOP;
      IF has_any_column_privilege(reader, relation.oid, 'INSERT,UPDATE') THEN
        RAISE EXCEPTION '% has a column write grant on %', reader, relation.relname;
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege(reader, p.oid, 'EXECUTE')
    ) THEN RAISE EXCEPTION '% can execute a public RPC', reader;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  ) OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage')
    OR EXISTS (SELECT 1 FROM storage.buckets)
  THEN RAISE EXCEPTION 'Storage must have enabled RLS, zero policies and zero buckets';
  END IF;
END
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.regions) IS DISTINCT FROM ARRAY[91000]::bigint[]
    OR (SELECT array_agg(id ORDER BY id) FROM public.locations) IS DISTINCT FROM ARRAY[91001]::bigint[]
    OR (SELECT array_agg(id ORDER BY id) FROM public.travel_packages) IS DISTINCT FROM ARRAY[91001]::bigint[]
    OR (SELECT array_agg(id ORDER BY id) FROM public.travel_package_options) IS DISTINCT FROM ARRAY[91001]::bigint[]
    OR EXISTS (SELECT 1 FROM public.affiliate_links)
  THEN RAISE EXCEPTION 'Unexpected anonymous fixture visibility';
  END IF;
END
$$;
SELECT current_user AS verified_role, 'Preview fixture reads and write grants verified' AS result;
ROLLBACK;

-- Negative permission probes run in a transaction that always rolls back.
-- If a write unexpectedly succeeds, the exception rolls back that subtransaction.
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.regions (id, name) VALUES (91999, 'Permission probe');
    RAISE EXCEPTION 'Anonymous business write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.buckets (id, name) VALUES ('preview-denied-probe', 'preview-denied-probe');
    RAISE EXCEPTION 'Anonymous Storage bucket write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('preview-denied-probe', 'permission-probe');
    RAISE EXCEPTION 'Anonymous Storage object write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
SELECT current_user AS verified_role, 'Business and Storage INSERT probes rejected' AS result;
ROLLBACK;
