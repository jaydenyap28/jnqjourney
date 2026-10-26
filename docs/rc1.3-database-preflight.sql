-- READ ONLY. No historical content, function body or cron.command is returned.
BEGIN TRANSACTION READ ONLY;
SELECT now() AS checked_at;
SELECT n.nspname,c.relname,c.oid,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~* '(backup|archive)' ORDER BY c.relname;
SELECT c.relname,a.attname,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname ~* '(backup|archive)' AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
SELECT schemaname,tablename,policyname,roles,cmd,permissive FROM pg_policies WHERE schemaname='public' AND tablename ~* '(backup|archive)';
SELECT c.relname,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent
FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE d.refclassid='pg_class'::regclass AND n.nspname='public' AND c.relname ~* '(backup|archive)';
-- Dynamic SQL can evade this heuristic; matches are candidates, never clearance.
SELECT DISTINCT t.relname,p.oid::regprocedure AS function_signature,p.prosecdef
FROM pg_class t JOIN pg_namespace tn ON tn.oid=t.relnamespace
CROSS JOIN pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE tn.nspname='public' AND t.relkind IN ('r','p') AND t.relname ~* '(backup|archive)'
AND pn.nspname='public' AND p.prokind IN ('f','p') AND position(t.relname IN p.prosrc)>0;
SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT pg_get_userbyid(roleid) AS granted_role,pg_get_userbyid(member) AS member FROM pg_auth_members
WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'));
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name ~* '(sync|queue|publication|translation)' ORDER BY table_name,ordinal_position;
SELECT to_regclass('cron.job') AS cron_catalog; -- If present, separately select jobid,jobname,schedule,active only.
COMMIT;
