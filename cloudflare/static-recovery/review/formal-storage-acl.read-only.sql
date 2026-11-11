-- Run only through the official read-only connection for vrufunuomioczocdsoer.
-- Returns ACLs and expressions, never object names, row data, or credentials.
begin read only;
select jsonb_build_object(
  'currentUser',current_user,
  'sessionUser',session_user,
  'readOnly',current_setting('transaction_read_only'),
  'bucket',(select jsonb_build_object('id',id,'public',public) from storage.buckets where id='location-images'),
  'tables',(
    select jsonb_agg(jsonb_build_object(
      'table',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl,
      'roles',(select jsonb_object_agg(r, jsonb_build_object(
        'select',has_table_privilege(r,c.oid,'SELECT'),'anySelectColumn',has_any_column_privilege(r,c.oid,'SELECT'),
        'insert',has_table_privilege(r,c.oid,'INSERT'),'update',has_table_privilege(r,c.oid,'UPDATE'),
        'delete',has_table_privilege(r,c.oid,'DELETE')
      )) from unnest(array['anon','authenticated','service_role']) r)
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relname in ('objects','buckets')
  ),
  'policies',(
    select coalesce(jsonb_agg(to_jsonb(p) order by tablename,policyname),'[]'::jsonb)
    from pg_policies p where schemaname='storage' and tablename in ('objects','buckets')
  ),
  'serviceBypassRls',(select rolbypassrls from pg_roles where rolname='service_role')
) as catalog;
rollback;
