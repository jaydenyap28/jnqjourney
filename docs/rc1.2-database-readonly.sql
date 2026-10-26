-- RC1.2: run only after a read-only connection is available. No grants/DDL/writes.
BEGIN TRANSACTION READ ONLY;
SELECT now() AS checked_at, current_database(), current_user;
SELECT to_regclass('public.spot_publication_sync') AS sync_table;
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND (table_name='locations' OR table_name='spot_publication_sync')
ORDER BY table_name,ordinal_position;

-- Backup/archive metadata only: do not export historical row contents or secrets.
SELECT n.nspname AS schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') AS anon_write,
       has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
       has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS authenticated_write
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '(backup|archive|optimization)'
ORDER BY c.relname;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename ~ '(backup|archive|optimization)'
ORDER BY tablename,policyname;
COMMIT;

-- Run the following SELECT separately only after confirming the column metadata:
-- SELECT location_id,source_updated_at,synced_source_updated_at,last_error
-- FROM public.spot_publication_sync
-- WHERE source_updated_at IS DISTINCT FROM synced_source_updated_at OR last_error IS NOT NULL;
-- Check cron job names/schedule/active only, NEVER export cron.command (may hold credentials).
-- Do not enable the historical description optimizer or change RLS in this audit.
