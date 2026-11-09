-- REVIEW DRAFT. Outside supabase/migrations. Isolated project only after approval.
-- Preconditions: public.locations matches the recorded 36-column contract.
-- Deployment operator must check exact project ref, schema, roles and ACLs.
-- No automatic runner or target discovery. Keep this entire script transactional.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create schema jnq_media_private;
revoke all on schema jnq_media_private from public, anon, authenticated, service_role;
grant usage on schema jnq_media_private to service_role;

-- Operator provisions only NEW isolated fixtures through a separately reviewed step.
-- A service_role RPC cannot enroll an existing or production Spot by itself.
create table jnq_media_private.enabled_spots (
  spot_id bigint primary key references public.locations(id) on delete cascade,
  constraint enabled_spots_safe_id check (spot_id between 1 and 9007199254740991)
);

create function jnq_media_private.valid_key(p_spot bigint, p_key text)
returns boolean language sql immutable strict security invoker
set search_path = pg_catalog
as $$
  select p_spot between 1 and 9007199254740991
    and p_key ~ ('^media/candidate/' || p_spot::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp|gif)$')
$$;

create table jnq_media_private.registry (
  spot_id bigint not null references jnq_media_private.enabled_spots(spot_id) on delete cascade,
  object_key text not null,
  object_size bigint not null check (object_size between 12 and 10485760),
  mime text not null,
  object_etag text not null check (octet_length(object_etag) between 1 and 128),
  object_version text not null check (octet_length(object_version) between 1 and 128),
  receipt_size bigint not null check (receipt_size between 1 and 1024),
  receipt_etag text not null check (octet_length(receipt_etag) between 1 and 128),
  receipt_version text not null check (octet_length(receipt_version) between 1 and 128),
  verified_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key (spot_id, object_key),
  constraint registry_object_scope check (jnq_media_private.valid_key(spot_id, object_key)),
  constraint registry_mime_suffix check (mime is not distinct from
    case right(object_key, 4)
      when '.png' then 'image/png'
      when '.jpg' then 'image/jpeg'
      when '.gif' then 'image/gif'
      when 'webp' then 'image/webp'
    end),
  constraint registry_revocation_order check (revoked_at is null or revoked_at >= verified_at)
);
-- Row existence represents verification. revoked_at is a terminal tombstone.
-- PK prefix covers the FK and Spot lookup. No secondary index until measured.
alter table jnq_media_private.enabled_spots enable row level security;
alter table jnq_media_private.registry enable row level security;
revoke all on table jnq_media_private.enabled_spots, jnq_media_private.registry
  from public, anon, authenticated, service_role;
grant select on table jnq_media_private.enabled_spots, jnq_media_private.registry to service_role;
grant insert (spot_id, object_key, object_size, mime, object_etag, object_version,
  receipt_size, receipt_etag, receipt_version)
  on jnq_media_private.registry to service_role;
grant update (revoked_at) on jnq_media_private.registry to service_role;
-- Narrow column grants protect identities from accidental UPDATE by the adapter.
-- service_role can bypass RLS and is a trusted credential, never a browser role.

create function jnq_media_private.require_service()
returns void language plpgsql security invoker
set search_path = pg_catalog
as $$
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'JNQ_SERVICE_REQUIRED';
  end if;
end
$$;

create function jnq_media_private.lock_spot(p_spot bigint)
returns public.locations language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  v_row public.locations;
begin
  perform jnq_media_private.require_service();
  if not exists (select 1 from jnq_media_private.enabled_spots s where s.spot_id = p_spot) then
    raise exception using errcode = 'PT404', message = 'JNQ_SPOT_NOT_ENABLED';
  end if;
  -- All mutation RPCs acquire this lock before accessing registry entries.
  select l.* into v_row
    from public.locations l
    where l.id = p_spot
    for update;
  if not found or not exists (
    select 1 from jnq_media_private.enabled_spots s where s.spot_id = p_spot
  ) then
    raise exception using errcode = 'PT404', message = 'JNQ_SPOT_NOT_ENABLED';
  end if;
  return v_row;
end
$$;

create function jnq_media_private.media_keys(p_spot bigint, p_cover text, p_images text[])
returns text[] language plpgsql immutable security invoker
set search_path = pg_catalog
as $$
declare
  v_keys text[];
begin
  if cardinality(p_images) > 60 or array_ndims(p_images) > 1 then
    raise exception using errcode = 'PT400', message = 'JNQ_INVALID_MEDIA_ARRAY';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_images, '{}'::text[])) as a(path) where a.path is null
  ) then
    raise exception using errcode = 'PT400', message = 'JNQ_INVALID_MEDIA_ARRAY';
  end if;
  select coalesce(array_agg(distinct substring(a.path from 2)), '{}'::text[])
    into v_keys
    from unnest(array_prepend(p_cover, coalesce(p_images, '{}'::text[]))) as a(path)
    where a.path is not null and a.path <> '';
  if exists (
    select 1
    from unnest(array_prepend(p_cover, coalesce(p_images, '{}'::text[]))) as a(path)
    where a.path is not null and a.path <> ''
      and (left(a.path, 1) <> '/' or not jnq_media_private.valid_key(p_spot, substring(a.path from 2)))
  ) then
    raise exception using errcode = 'PT400', message = 'JNQ_INVALID_MEDIA_REFERENCE';
  end if;
  return v_keys;
end
$$;

create function jnq_media_private.spot_projection(p_row public.locations)
returns jsonb language sql stable security invoker
set search_path = pg_catalog
as $$
  select jsonb_object_agg(f.key, f.value)
  from jsonb_each(to_jsonb(p_row)) as f
  where f.key = any(array[
    'id', 'name', 'name_cn', 'category', 'latitude',
    'longitude', 'region_id', 'description', 'review', 'review_jayden',
    'review_qing', 'address', 'google_maps_url', 'opening_hours', 'price_info',
    'tags', 'visit_date', 'is_visited', 'image_url', 'images',
    'image_metadata', 'video_url', 'facebook_video_url', 'related_note_slugs', 'status',
    'publication_status', 'seo_title_zh', 'seo_description_zh', 'seo_title_en', 'seo_description_en',
    'experience_zh', 'experience_en', 'redirect_url', 'redirect_type', 'updated_at',
    'created_at'
  ])
$$;

-- Normal complete reuses metadata returned by its successful receipt PUT.
-- p_can_insert comes from the trusted adapter, never from the browser.
-- True only in the original complete invocation with its fresh PUT result,
-- or in a separately authorized importer that verifies independent provenance.
-- Processing-ticket retries pass false. Current R2 alone cannot prove origin.
create function public.jnq_media_register(
  p_spot bigint, p_key text, p_size bigint, p_mime text, p_etag text,
  p_version text, p_receipt_size bigint, p_receipt_etag text, p_receipt_version text,
  p_can_insert boolean
)
returns boolean language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  v_entry jnq_media_private.registry;
begin
  perform jnq_media_private.lock_spot(p_spot);
  select * into v_entry from jnq_media_private.registry
    where spot_id = p_spot and object_key = p_key;
  if found then
    if v_entry.revoked_at is not null or
       row(v_entry.object_size, v_entry.mime, v_entry.object_etag, v_entry.object_version,
           v_entry.receipt_size, v_entry.receipt_etag, v_entry.receipt_version)
       is distinct from
       row(p_size, p_mime, p_etag, p_version, p_receipt_size, p_receipt_etag, p_receipt_version) then
      raise exception using errcode = 'PT409', message = 'JNQ_REGISTRATION_CONFLICT';
    end if;
    return true;
  end if;
  if p_can_insert is distinct from true then
    raise exception using errcode = 'PT409', message = 'JNQ_REGISTRATION_UNCONFIRMED';
  end if;
  insert into jnq_media_private.registry (
    spot_id, object_key, object_size, mime, object_etag, object_version,
    receipt_size, receipt_etag, receipt_version
  ) values (
    p_spot, p_key, p_size, p_mime, p_etag, p_version,
    p_receipt_size, p_receipt_etag, p_receipt_version
  );
  return true;
end
$$;

-- Worker performs the existing admin, Origin, field and redirect checks first.
-- p_observed is constructed by the server from live R2 binding responses.
-- Each item uses key, size, mime, etag, version, receipt_size, receipt_etag, receipt_version.
create function public.jnq_media_save(
  p_spot bigint, p_expected_updated_at timestamptz, p_patch jsonb, p_observed jsonb
)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  v_before public.locations;
  v_after public.locations;
  v_keys text[];
  v_matches bigint;
  v_distinct bigint;
begin
  perform jnq_media_private.require_service();
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb
    or octet_length(p_patch::text) > 524288
    or jsonb_typeof(p_observed) is distinct from 'array'
    or octet_length(p_observed::text) > 65536 then
    raise exception using errcode = 'PT400', message = 'JNQ_INVALID_SAVE_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) as k(field)
    where k.field <> all(array[
    'name', 'name_cn', 'category', 'latitude', 'longitude',
    'region_id', 'description', 'review', 'review_jayden', 'review_qing',
    'address', 'google_maps_url', 'opening_hours', 'price_info', 'tags',
    'visit_date', 'is_visited', 'image_url', 'images', 'image_metadata',
    'video_url', 'facebook_video_url', 'related_note_slugs', 'status', 'publication_status',
    'seo_title_zh', 'seo_description_zh', 'seo_title_en', 'seo_description_en', 'experience_zh',
    'experience_en', 'redirect_url', 'redirect_type'
    ])
  ) then
    raise exception using errcode = 'PT400', message = 'JNQ_INVALID_PATCH_FIELD';
  end if;
  v_before := jnq_media_private.lock_spot(p_spot);
  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'JNQ_SPOT_VERSION_CONFLICT';
  end if;
  v_after := jsonb_populate_record(v_before, p_patch);
  if v_after.name is null or btrim(v_after.name) = ''
    or v_after.latitude is null or not (v_after.latitude between -90 and 90)
    or v_after.longitude is null or not (v_after.longitude between -180 and 180)
    or (v_after.status is not null and v_after.status not in ('active','inactive','temporarily_closed','permanently_closed'))
    or (v_after.publication_status is not null and v_after.publication_status not in ('published','hidden','draft'))
    or (v_after.redirect_type is not null and v_after.redirect_type not in (301,302)) then
    raise exception using errcode = 'PT400', message = 'JNQ_INVALID_SPOT_FIELDS';
  end if;
  v_keys := jnq_media_private.media_keys(p_spot, v_after.image_url, v_after.images);
  if jsonb_array_length(p_observed) <> cardinality(v_keys) then
    raise exception using errcode = 'PT409', message = 'JNQ_MEDIA_SNAPSHOT_INCOMPLETE';
  end if;
  select count(*), count(distinct o.key) into v_matches, v_distinct
  from jsonb_to_recordset(p_observed) as o(
    key text, size bigint, mime text, etag text, version text,
    receipt_size bigint, receipt_etag text, receipt_version text
  )
  join jnq_media_private.registry r on r.spot_id = p_spot and r.object_key = o.key
  where o.key = any(v_keys) and r.revoked_at is null
    and (r.object_size, r.mime, r.object_etag, r.object_version,
         r.receipt_size, r.receipt_etag, r.receipt_version)
      = (o.size, o.mime, o.etag, o.version, o.receipt_size, o.receipt_etag, o.receipt_version);
  if v_matches <> cardinality(v_keys) or v_distinct <> cardinality(v_keys) then
    raise exception using errcode = 'PT409', message = 'JNQ_MEDIA_NOT_VERIFIED';
  end if;
  -- Keep a millisecond-aligned version so the Worker can round-trip it without loss.
  update public.locations as l set
    name = v_after.name,
    name_cn = v_after.name_cn,
    category = v_after.category,
    latitude = v_after.latitude,
    longitude = v_after.longitude,
    region_id = v_after.region_id,
    description = v_after.description,
    review = v_after.review,
    review_jayden = v_after.review_jayden,
    review_qing = v_after.review_qing,
    address = v_after.address,
    google_maps_url = v_after.google_maps_url,
    opening_hours = v_after.opening_hours,
    price_info = v_after.price_info,
    tags = v_after.tags,
    visit_date = v_after.visit_date,
    is_visited = v_after.is_visited,
    image_url = v_after.image_url,
    images = v_after.images,
    image_metadata = v_after.image_metadata,
    video_url = v_after.video_url,
    facebook_video_url = v_after.facebook_video_url,
    related_note_slugs = v_after.related_note_slugs,
    status = v_after.status,
    publication_status = v_after.publication_status,
    seo_title_zh = v_after.seo_title_zh,
    seo_description_zh = v_after.seo_description_zh,
    seo_title_en = v_after.seo_title_en,
    seo_description_en = v_after.seo_description_en,
    experience_zh = v_after.experience_zh,
    experience_en = v_after.experience_en,
    redirect_url = v_after.redirect_url,
    redirect_type = v_after.redirect_type,
    updated_at = greatest(date_trunc('milliseconds', clock_timestamp()),
      date_trunc('milliseconds', l.updated_at) + interval '1 millisecond')
    where l.id = p_spot
    returning l.* into v_after;
  return jnq_media_private.spot_projection(v_after);
end
$$;

-- Emergency withdrawal is deliberately a separate operation. It accepts no
-- media mutations and can still work when R2 is down or a receipt has vanished.
create function public.jnq_media_withdraw(p_spot bigint, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  v_spot public.locations;
begin
  v_spot := jnq_media_private.lock_spot(p_spot);
  if v_spot.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'JNQ_SPOT_VERSION_CONFLICT';
  end if;
  update public.locations as l set publication_status = 'hidden',
    updated_at = greatest(date_trunc('milliseconds', clock_timestamp()),
      date_trunc('milliseconds', l.updated_at) + interval '1 millisecond')
    where l.id = p_spot returning l.* into v_spot;
  return jnq_media_private.spot_projection(v_spot);
end
$$;

create function public.jnq_media_revoke(p_spot bigint, p_key text)
returns boolean language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  v_spot public.locations;
  v_entry jnq_media_private.registry;
begin
  v_spot := jnq_media_private.lock_spot(p_spot);
  select * into v_entry from jnq_media_private.registry
    where spot_id = p_spot and object_key = p_key;
  if not found then
    raise exception using errcode = 'PT404', message = 'JNQ_MEDIA_NOT_REGISTERED';
  end if;
  if v_entry.revoked_at is not null then return true; end if;
  update jnq_media_private.registry
    set revoked_at = greatest(clock_timestamp(), verified_at)
    where spot_id = p_spot and object_key = p_key;
  if v_spot.image_url = '/' || p_key
    or ('/' || p_key) = any(coalesce(v_spot.images, '{}'::text[])) then
    update public.locations as l set publication_status = 'hidden',
      updated_at = greatest(date_trunc('milliseconds', clock_timestamp()),
        date_trunc('milliseconds', l.updated_at) + interval '1 millisecond')
      where l.id = p_spot;
  end if;
  return true;
end
$$;

create function public.jnq_media_delete(p_spot bigint, p_expected_updated_at timestamptz)
returns boolean language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  v_spot public.locations;
begin
  v_spot := jnq_media_private.lock_spot(p_spot);
  if v_spot.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'JNQ_SPOT_VERSION_CONFLICT';
  end if;
  delete from public.locations where id = p_spot;
  -- Registry cascades remove enrollment and registry rows. Existing locations
  -- foreign keys also apply. Enroll only dependency-checked synthetic fixtures.
  return true;
end
$$;

-- One SQL snapshot of live visibility, reference and registry identity.
-- The Worker keeps separate server-verified admin and anonymous gates.
create function public.jnq_media_lookup(p_spot bigint, p_key text)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  perform jnq_media_private.require_service();
  select jsonb_build_object(
    'publiclyReferenced', coalesce(l.status = 'active', false)
      and (l.publication_status is null or l.publication_status = 'published')
      and coalesce(l.image_url = '/' || r.object_key
        or ('/' || r.object_key) = any(coalesce(l.images, '{}'::text[])), false),
    'key', r.object_key, 'size', r.object_size, 'mime', r.mime,
    'etag', r.object_etag, 'version', r.object_version,
    'receiptSize', r.receipt_size, 'receiptEtag', r.receipt_etag, 'receiptVersion', r.receipt_version
  ) into v_result
  from public.locations l join jnq_media_private.registry r on r.spot_id = l.id
  where l.id = p_spot and r.object_key = p_key and r.revoked_at is null;
  return v_result;
end
$$;

-- Explicitly clear grants inherited through creation defaults for these objects.
-- Keep all grants in this transaction so no public exposure window exists.
revoke all on all functions in schema jnq_media_private from public, anon, authenticated, service_role;
grant execute on all functions in schema jnq_media_private to service_role;
-- The private schema is dedicated to this draft. Do not add it to PostgREST's exposed schemas.
revoke all on function public.jnq_media_register(bigint,text,bigint,text,text,text,bigint,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.jnq_media_register(bigint,text,bigint,text,text,text,bigint,text,text,boolean) to service_role;
revoke all on function public.jnq_media_save(bigint,timestamptz,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.jnq_media_save(bigint,timestamptz,jsonb,jsonb) to service_role;
revoke all on function public.jnq_media_withdraw(bigint,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.jnq_media_withdraw(bigint,timestamptz) to service_role;
revoke all on function public.jnq_media_revoke(bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.jnq_media_revoke(bigint,text) to service_role;
revoke all on function public.jnq_media_delete(bigint,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.jnq_media_delete(bigint,timestamptz) to service_role;
revoke all on function public.jnq_media_lookup(bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.jnq_media_lookup(bigint,text) to service_role;

-- Effective privilege check catches inherited ACLs as well as explicit grants.
do $$
declare
  v_role name;
  v_function oid;
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls)
    or not has_table_privilege('service_role', 'public.locations', 'SELECT')
    or not has_table_privilege('service_role', 'public.locations', 'UPDATE')
    or not has_table_privilege('service_role', 'public.locations', 'DELETE') then
    raise exception using errcode = '42501', message = 'JNQ_SERVICE_PREREQUISITES_MISSING';
  end if;
  if has_table_privilege('service_role', 'jnq_media_private.enabled_spots', 'INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege('service_role', 'jnq_media_private.enabled_spots', 'INSERT,UPDATE')
    or has_table_privilege('service_role', 'jnq_media_private.registry', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception using errcode = '42501', message = 'JNQ_SERVICE_REGISTRY_GRANT_TOO_BROAD';
  end if;
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = 'jnq_media_private.registry'::regclass and a.attnum > 0 and not a.attisdropped
      and ((a.attname <> 'revoked_at' and has_column_privilege('service_role', a.attrelid, a.attnum, 'UPDATE'))
        or (a.attname in ('verified_at', 'revoked_at') and has_column_privilege('service_role', a.attrelid, a.attnum, 'INSERT')))
  ) then
    raise exception using errcode = '42501', message = 'JNQ_SERVICE_IDENTITY_MUTABLE';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_schema_privilege(v_role, 'jnq_media_private', 'USAGE,CREATE')
      or has_table_privilege(v_role, 'jnq_media_private.enabled_spots', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege(v_role, 'jnq_media_private.registry', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(v_role, 'jnq_media_private.enabled_spots', 'SELECT,INSERT,UPDATE,REFERENCES')
      or has_any_column_privilege(v_role, 'jnq_media_private.registry', 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception using errcode = '42501', message = 'JNQ_PRIVATE_ACL_EXPOSED';
    end if;
    for v_function in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'jnq_media_private' or (n.nspname = 'public' and p.proname = any(array[
        'jnq_media_register', 'jnq_media_save', 'jnq_media_withdraw',
        'jnq_media_revoke', 'jnq_media_delete', 'jnq_media_lookup'
      ]))
    loop
      if has_function_privilege(v_role, v_function, 'EXECUTE') then
        raise exception using errcode = '42501', message = 'JNQ_RPC_EXECUTE_EXPOSED';
      end if;
    end loop;
  end loop;
end
$$;
commit;
