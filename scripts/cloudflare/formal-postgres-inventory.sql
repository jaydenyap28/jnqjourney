with application_tables as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'auth', 'storage') and c.relkind in ('r', 'p')
), table_details as (
  select nspname, relname, jsonb_build_object(
    'rows', ((xpath('/row/n/text()', query_to_xml(
      format('select count(*) as n from %I.%I', nspname, relname), false, true, '')))[1]::text)::bigint,
    'rls', relrowsecurity, 'forceRls', relforcerowsecurity,
    'acl', (select jsonb_agg(a::text order by a::text) from unnest(relacl) a),
    'constraints', (select jsonb_agg(jsonb_build_array(conname, contype, pg_get_constraintdef(x.oid)) order by conname)
      from pg_constraint x where x.conrelid = t.oid and contype in ('p', 'f'))
  ) as detail
  from application_tables t
)
select jsonb_build_object(
  'tables', (select jsonb_object_agg(nspname || '.' || relname, detail) from table_details),
  'extensions', (select jsonb_object_agg(extname, extversion) from pg_extension),
  'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by schemaname, tablename, policyname), '[]'::jsonb)
    from pg_policies p where schemaname in ('public', 'auth', 'storage')),
  'roles', (select jsonb_object_agg(rolname, jsonb_build_array(rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls))
    from pg_roles where rolname !~ '^pg_' and rolname <> 'jnq_cutover_restore'),
  'memberships', (select coalesce(jsonb_agg(jsonb_build_array(r.rolname, m.rolname, a.admin_option, a.inherit_option, a.set_option)
    order by r.rolname, m.rolname, a.admin_option, a.inherit_option, a.set_option), '[]'::jsonb)
    from pg_auth_members a join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member
    where m.rolname <> 'jnq_cutover_restore'),
  'locationsReadAccess', (select jsonb_object_agg(role, has_table_privilege(role, 'public.locations', 'SELECT'))
    from unnest(array['anon','authenticated','service_role']) role),
  'authorityStorageKeys', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb)
    from storage.objects where bucket_id = 'location-images' and name ~ '^_system/(notes(-latest|/)|guides(-latest|/)|location-slugs)')
);
