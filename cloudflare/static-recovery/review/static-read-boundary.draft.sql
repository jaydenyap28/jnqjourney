-- Review-only. Apply after the existing service-only public-read projection,
-- private Storage bucket cutover and migrated server callers. Never run against
-- production from a regression runner.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $guard$
begin
  if current_setting('app.jnq_static_reader_verified', true) is distinct from 'true' then
    raise exception 'STATIC_READER_NOT_VERIFIED';
  end if;
  if not exists(select 1 from storage.buckets where id='location-images' and public is false)
    or not (select relrowsecurity from pg_class where oid='storage.objects'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.locations'::regclass) then
    raise exception 'STORAGE_PRIVATE_OR_RLS_PRECONDITION_FAILED';
  end if;
  if has_any_column_privilege('anon','public.locations','SELECT')
    or has_any_column_privilege('authenticated','public.locations','SELECT')
    or has_function_privilege('anon','public.jnq_public_spots(bigint[])','EXECUTE')
    or has_function_privilege('authenticated','public.jnq_public_spots(bigint[])','EXECUTE') then
    raise exception 'TABLE_OR_PROJECTION_ACL_NOT_CLOSED';
  end if;
  -- Owner-executed views can bypass the base RLS. Check transitive dependencies
  -- and effective column grants, including materialized views.
  if exists(
    with recursive dependent(oid) as (
      select 'public.locations'::regclass::oid
      union
      select rewrite.ev_class from dependent d
      join pg_depend dep on dep.refclassid='pg_class'::regclass and dep.refobjid=d.oid and dep.classid='pg_rewrite'::regclass
      join pg_rewrite rewrite on rewrite.oid=dep.objid
      join pg_class rel on rel.oid=rewrite.ev_class and rel.relkind in ('v','m')
    )
    select from dependent where oid<>'public.locations'::regclass
      and (has_any_column_privilege('anon',oid,'SELECT') or has_any_column_privilege('authenticated',oid,'SELECT'))
  ) then
    raise exception 'DEPENDENT_VIEW_READ_BYPASS';
  end if;
  -- A conservative check for exposed DEFINER readers. Catalog inspection of
  -- text does not detect every indirect or dynamic SQL dependency.
  if exists(
    select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prosrc ~* '\m(locations|location-images)\M'
      and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) then
    raise exception 'DEFINER_RPC_READ_BYPASS';
  end if;
  if not has_table_privilege('service_role','public.locations','SELECT')
    or not has_table_privilege('service_role','public.locations','UPDATE')
    or not has_table_privilege('service_role','storage.objects','SELECT')
    or not has_table_privilege('service_role','storage.objects','INSERT')
    or not has_table_privilege('service_role','storage.objects','UPDATE')
    or not has_function_privilege('service_role','public.jnq_public_spots(bigint[])','EXECUTE') then
    raise exception 'SERVICE_PATH_NOT_AVAILABLE';
  end if;
end
$guard$;

-- Restrictive policies are ANDed with existing permissive policies. The old
-- SELECT policy cannot revive the table even if a grant is later reintroduced.
create policy jnq_static_locations_no_browser_read on public.locations
  as restrictive for select to anon, authenticated using (false);

-- Scope to this bucket only. Public URL access is controlled by the bucket's
-- separate public flag, checked above. Existing write policies are untouched.
create policy jnq_static_location_images_no_browser_read on storage.objects
  as restrictive for select to anon, authenticated
  using (bucket_id is distinct from 'location-images');

notify pgrst, 'reload schema';
commit;
