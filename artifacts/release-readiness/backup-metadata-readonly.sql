BEGIN TRANSACTION READ ONLY;
WITH targets AS (SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('hainan_package_merge_backup_20261006','spot_content_backup_20261009','spot_content_backup_20261013_evening','spot_content_backup_20261013_lijiang_hangzhou','spot_northeast_backup_20261013')),
functions AS (SELECT DISTINCT p.oid,p.proname,p.prosecdef FROM targets t CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') AND position(t.relname IN p.prosrc)>0)
SELECT jsonb_build_object(
'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'oid',oid,'owner',pg_get_userbyid(relowner),'acl',relacl::text,'rls',relrowsecurity,'forceRls',relforcerowsecurity)) FROM targets),
'columnAcl',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'column',a.attname,'acl',a.attacl::text)),'[]'::jsonb) FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',p.tablename,'name',p.policyname,'roles',p.roles,'command',p.cmd,'permissive',p.permissive)),'[]'::jsonb) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN (SELECT relname FROM targets)),
'dependencies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'dependent',pg_describe_object(d.classid,d.objid,d.objsubid))),'[]'::jsonb) FROM targets t JOIN pg_depend d ON d.refobjid=t.oid WHERE d.refclassid='pg_class'::regclass AND d.deptype <> 'i'),
'functionCandidates',(SELECT coalesce(jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'securityDefiner',prosecdef,'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',oid,'EXECUTE'))),'[]'::jsonb) FROM functions),
'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'bypassRls',rolbypassrls)) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
'roleMembership',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member))),'[]'::jsonb) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')))
) AS audit; ROLLBACK;
