-- Candidate only. Use the explicit isolated project for this task.
-- Formal use requires approval, fresh ACL evidence and migrated callers.
-- The Registry SQL, RLS policies and write permissions are left intact.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $preflight$
begin
  if current_user <> 'postgres'
    or (select count(*) from information_schema.columns
      where table_schema='public' and table_name='locations') <> 36
    or not (select relrowsecurity from pg_class where oid='public.locations'::regclass)
    or not (select rolbypassrls from pg_roles where rolname='service_role')
    or not has_table_privilege('service_role','public.locations','SELECT')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='jnq_public_spots') then
    raise exception 'PUBLIC_READ_PREFLIGHT_MISMATCH';
  end if;
end
$preflight$;

create function public.jnq_public_spots(p_ids bigint[])
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501', message='SERVICE_REQUIRED';
  end if;
  if p_ids is null or coalesce(array_ndims(p_ids),0)<>1
    or cardinality(p_ids)<1 or cardinality(p_ids)>20
    or exists(select 1 from unnest(p_ids) id where id is null or id<1 or id>9007199254740991)
    or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then
    raise exception using errcode='PT400', message='BOUNDED_IDS_REQUIRED';
  end if;
  select coalesce(jsonb_agg(to_jsonb(projected) order by projected.id),'[]'::jsonb)
    into result
    from (
      select id,name,name_cn,category,latitude,longitude,region_id,
        description,review,address,google_maps_url,opening_hours,price_info,tags,visit_date,
        image_url,images,image_metadata,video_url,facebook_video_url,related_note_slugs,
        status,publication_status,seo_title_zh,seo_description_zh,seo_title_en,
        seo_description_en,experience_zh,experience_en,updated_at,redirect_url,redirect_type
      from public.locations
      where id=any(p_ids) and id<>450 and status='active'
        and (publication_status is null or publication_status='published')
    ) projected;
  return result;
end
$function$;

-- Clear grants supplied by public schema creation defaults in this transaction.
revoke all on function public.jnq_public_spots(bigint[]) from public,anon,authenticated,service_role;
grant execute on function public.jnq_public_spots(bigint[]) to service_role;
revoke select on table public.locations from public,anon,authenticated;
-- Explicit column grants or inheritance must not silently keep the old path open.
do $assert_acl$
declare app_role text;
begin
  foreach app_role in array array['anon','authenticated'] loop
    if has_any_column_privilege(app_role,'public.locations','SELECT')
      or has_function_privilege(app_role,'public.jnq_public_spots(bigint[])','EXECUTE') then
      raise exception 'PUBLIC_READ_EFFECTIVE_ACL_NOT_CLOSED';
    end if;
  end loop;
  if not has_table_privilege('service_role','public.locations','SELECT')
    or not has_function_privilege('service_role','public.jnq_public_spots(bigint[])','EXECUTE') then
    raise exception 'SERVICE_READ_PRIVILEGE_MISSING';
  end if;
end
$assert_acl$;
notify pgrst, 'reload schema';
commit;
