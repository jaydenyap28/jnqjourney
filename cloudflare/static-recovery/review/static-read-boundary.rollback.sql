-- Operational rollback after a successful cutover. Switch the Pages deployment
-- to a verified safe package separately. Keep the server RPC, the Storage
-- bucket private and both restrictive policies in force.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $guard$
begin
  if not exists (
    select 1 from storage.buckets where id='location-images' and public is false
  ) or not (select relrowsecurity from pg_class where oid='storage.objects'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.locations'::regclass)
    or not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='jnq_static_location_images_no_browser_read' and permissive='RESTRICTIVE'
      and cmd='SELECT' and roles @> array['anon','authenticated']::name[]
      and qual='(bucket_id IS DISTINCT FROM ''location-images''::text)'
  ) or not exists (
    select 1 from pg_policies where schemaname='public' and tablename='locations'
      and policyname='jnq_static_locations_no_browser_read' and permissive='RESTRICTIVE'
      and cmd='SELECT' and roles @> array['anon','authenticated']::name[] and qual='false'
  ) then
    raise exception 'SAFE_ROLLBACK_BOUNDARY_NOT_PRESENT';
  end if;
end
$guard$;

revoke select on table public.locations from public,anon,authenticated;
revoke execute on function public.jnq_public_spots(bigint[]) from public,anon,authenticated;

do $assert_acl$
begin
  if has_any_column_privilege('anon','public.locations','SELECT')
    or has_any_column_privilege('authenticated','public.locations','SELECT')
    or has_function_privilege('anon','public.jnq_public_spots(bigint[])','EXECUTE')
    or has_function_privilege('authenticated','public.jnq_public_spots(bigint[])','EXECUTE')
    or not has_function_privilege('service_role','public.jnq_public_spots(bigint[])','EXECUTE') then
    raise exception 'SAFE_ROLLBACK_ACL_MISMATCH';
  end if;
end
$assert_acl$;
notify pgrst,'reload schema';
commit;
