-- REVIEW / APPROVAL REQUIRED. Do not run from an automatic regression runner.
-- Only the explicitly connected vrufunuomioczocdsoer project is authorized later.
-- No records, original Storage flags or original R2 objects are changed here.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $guard$
BEGIN
  IF current_setting('app.jnq_formal_private_cutover_approved', true) IS DISTINCT FROM 'true'
    OR NOT EXISTS (SELECT FROM storage.buckets WHERE id='jnq-admin-formal-publication' AND public IS FALSE)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.locations'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  THEN RAISE EXCEPTION 'FORMAL_PRIVATE_PRECONDITION_FAILED'; END IF;
  IF EXISTS (SELECT FROM (VALUES ('SELECT'),('INSERT'),('UPDATE')) AS p(privilege)
      WHERE NOT has_table_privilege('service_role','public.locations',p.privilege))
    OR EXISTS (SELECT FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS p(privilege)
      WHERE NOT has_table_privilege('service_role','storage.objects',p.privilege))
  THEN RAISE EXCEPTION 'FORMAL_SERVICE_PATH_UNAVAILABLE'; END IF;
END $guard$;
REVOKE SELECT ON TABLE public.locations FROM PUBLIC, anon, authenticated;
DO $columns$
DECLARE names text;
BEGIN
  SELECT string_agg(quote_ident(attname), ',') INTO names
    FROM pg_attribute WHERE attrelid='public.locations'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT (%s) ON TABLE public.locations FROM PUBLIC, anon, authenticated', names);
END $columns$;
CREATE POLICY jnq_formal_locations_no_browser_read ON public.locations
  AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY jnq_formal_private_store_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id IS DISTINCT FROM 'jnq-admin-formal-publication')
  WITH CHECK (bucket_id IS DISTINCT FROM 'jnq-admin-formal-publication');
DO $acl$
BEGIN
  IF has_any_column_privilege('anon','public.locations','SELECT')
    OR has_any_column_privilege('authenticated','public.locations','SELECT')
  THEN RAISE EXCEPTION 'FORMAL_INHERITED_READ_PATH_REMAINS'; END IF;
  -- Reuse the earlier conservative dependent-view / DEFINER checks. Unknown
  -- indirect SQL dependencies still require reviewing the existing snapshot.
  IF EXISTS (
    WITH RECURSIVE dependent(oid) AS (
      SELECT 'public.locations'::regclass::oid UNION
      SELECT r.ev_class FROM dependent d JOIN pg_depend p ON p.refobjid=d.oid AND p.refclassid='pg_class'::regclass AND p.classid='pg_rewrite'::regclass
      JOIN pg_rewrite r ON r.oid=p.objid JOIN pg_class c ON c.oid=r.ev_class AND c.relkind IN ('v','m')
    ) SELECT FROM dependent WHERE oid<>'public.locations'::regclass AND
      (has_any_column_privilege('anon',oid,'SELECT') OR has_any_column_privilege('authenticated',oid,'SELECT'))
  ) OR EXISTS (
    SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.prosrc ~* '\mlocations\M' AND
      (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN RAISE EXCEPTION 'FORMAL_INDIRECT_READ_PATH_REMAINS'; END IF;
END $acl$;
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Safe operational rollback: pause mutations/queue, keep this private boundary
-- in place, and restore only reviewed private versions/authorized static bytes.
-- Do not drop the policy or regrant browser SELECT to recover an editor outage.
