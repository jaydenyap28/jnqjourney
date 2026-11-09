-- Pending review evidence. Run only via a read-only channel explicitly bound
-- to rnamstwwbzknwbjwdgrf. The connection, not the SQL, establishes the target.
-- Keep raw policy predicates private. Record only the reviewed outcomes.
with
  locations as (select 'public.locations'::regclass as oid),
  app_roles as (
    select oid, rolname, rolcanlogin, rolinherit, rolbypassrls, rolsuper
    from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
  ),
  membership as (
    select a.rolname as member, r.rolname as granted_role,
      pg_has_role(a.oid, r.oid, 'USAGE') as inherits_now,
      pg_has_role(a.oid, r.oid, 'SET') as can_set
    from app_roles a cross join pg_roles r
    where a.oid <> r.oid
      and (pg_has_role(a.oid, r.oid, 'USAGE') or pg_has_role(a.oid, r.oid, 'SET'))
  ),
  defaults as (
    select pg_get_userbyid(d.defaclrole) as creator,
      case when d.defaclnamespace = 0 then '(global)' else n.nspname::text end as scope,
      d.defaclobjtype as object_type,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'grantor', pg_get_userbyid(a.grantor),
          'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
          'privilege', a.privilege_type, 'grantable', a.is_grantable
        )) from aclexplode(d.defaclacl) a
      ), '[]'::jsonb) as grants
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    where (d.defaclnamespace = 0 or n.nspname = 'public') and d.defaclobjtype in ('f','r','n')
  )
select jsonb_build_object(
  'database', current_database(), 'database_bytes', pg_database_size(current_database()),
  'server_version', current_setting('server_version'), 'catalog_role', current_user,
  'locations', (
    select jsonb_build_object('owner', pg_get_userbyid(c.relowner), 'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity)
    from pg_class c join locations l on c.oid = l.oid
  ),
  'locations_columns', (
    select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
      'has_default', a.atthasdef) order by a.attnum)
    from pg_attribute a join locations l on a.attrelid = l.oid
    where a.attnum > 0 and not a.attisdropped
  ),
  'locations_constraints_and_foreign_keys', (
    select coalesce(jsonb_agg(jsonb_build_object('name', c.conname, 'type', c.contype,
      'source', c.conrelid::regclass::text,
      'target', case when c.confrelid <> 0 then c.confrelid::regclass::text end,
      'validated', c.convalidated, 'deferrable', c.condeferrable,
      'definition', pg_get_constraintdef(c.oid)) order by c.conrelid, c.conname), '[]'::jsonb)
    from pg_constraint c join locations l on l.oid in (c.conrelid, c.confrelid)
  ),
  'locations_user_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('name', t.tgname, 'enabled', t.tgenabled)), '[]'::jsonb)
    from pg_trigger t join locations l on t.tgrelid = l.oid where not t.tgisinternal
  ),
  'locations_policies_review_privately', (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.policyname), '[]'::jsonb)
    from pg_policies p where p.schemaname = 'public' and p.tablename = 'locations'
  ),
  'roles', (select jsonb_agg(to_jsonb(a) order by a.rolname) from app_roles a),
  'effective_role_membership', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from membership m),
  'locations_effective_access', (
    select jsonb_agg(jsonb_build_object('role', a.rolname,
      'select', has_table_privilege(a.oid, l.oid, 'SELECT'),
      'insert', has_any_column_privilege(a.oid, l.oid, 'INSERT'),
      'update', has_any_column_privilege(a.oid, l.oid, 'UPDATE'),
      'delete', has_table_privilege(a.oid, l.oid, 'DELETE')))
    from app_roles a cross join locations l
  ),
  'default_acl', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from defaults d),
  'ddl_event_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('name', e.evtname, 'event', e.evtevent,
      'enabled', e.evtenabled, 'handler', e.evtfoid::regprocedure::text)), '[]'::jsonb)
    from pg_event_trigger e
  ),
  'private_schema_present', to_regnamespace('jnq_media_private') is not null,
  'public_rpc_conflicts', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text), '[]'::jsonb)
    from pg_proc p join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname in (
      'jnq_media_register','jnq_media_save','jnq_media_withdraw',
      'jnq_media_revoke','jnq_media_delete','jnq_media_lookup')
  ),
  'reserved_count_visible_to_catalog_role', (
    select count(*) from public.locations where id >= 92000 and id < 93000
  )
);
