-- REVIEW ONLY. Do not apply to Production during candidate development.
-- Install in an isolated Supabase clone first. No new database/service is needed.
begin;
create table public.jnq_publication_state (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  revision bigint not null default 0,
  published_revision bigint not null default 0,
  first_dirty_at timestamptz,
  changed_at timestamptz,
  lease_token uuid,
  reserved_revision bigint,
  deployment_id text,
  last_attempt_at timestamptz,
  day_key date,
  day_attempts integer not null default 0,
  month_key date,
  month_attempts integer not null default 0
);
insert into public.jnq_publication_state(id) values(true);
alter table public.jnq_publication_state enable row level security;
revoke all on public.jnq_publication_state from public, anon, authenticated;
grant select, update on public.jnq_publication_state to service_role;

create function public.jnq_mark_publication_dirty() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if TG_TABLE_SCHEMA = 'storage' then
    -- Images alone don't rebuild the site. Only editor system documents do.
    if TG_OP = 'DELETE' then
      if OLD.bucket_id <> 'location-images' or left(OLD.name,8) <> '_system/' then return null; end if;
    elsif TG_OP = 'INSERT' then
      if NEW.bucket_id <> 'location-images' or left(NEW.name,8) <> '_system/' then return null; end if;
    else
      if not ((OLD.bucket_id = 'location-images' and left(OLD.name,8) = '_system/')
        or (NEW.bucket_id = 'location-images' and left(NEW.name,8) = '_system/')) then return null; end if;
    end if;
  end if;
  update public.jnq_publication_state set revision=revision+1,
    first_dirty_at=coalesce(first_dirty_at,clock_timestamp()), changed_at=clock_timestamp() where id;
  return null;
end $$;

-- Statement triggers merge bulk mutations. These are transactional with saves.
do $$ declare tab text; begin
  foreach tab in array array['locations','regions','travel_packages','travel_package_options','affiliate_links'] loop
    if to_regclass('public.'||tab) is null then raise exception 'Missing source table: %',tab; end if;
    execute format('create trigger jnq_publish_dirty after insert or update or delete on public.%I for each statement execute function public.jnq_mark_publication_dirty()',tab);
  end loop;
end $$;
create trigger jnq_publish_system_document after insert or update or delete on storage.objects
for each row execute function public.jnq_mark_publication_dirty();

create function public.jnq_publication_status() returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
  select to_jsonb(s) from public.jnq_publication_state s where id
$$;

create function public.jnq_publication_claim() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.jnq_publication_state; now_at timestamptz:=clock_timestamp();
  utc_day date:=(clock_timestamp() at time zone 'UTC')::date;
  utc_month date:=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
begin
  select * into s from public.jnq_publication_state where id for update;
  if not s.enabled or s.lease_token is not null or s.revision<=s.published_revision then return null; end if;
  if s.changed_at > now_at-interval '15 minutes' and s.first_dirty_at > now_at-interval '2 hours' then return null; end if;
  if s.last_attempt_at > now_at-interval '30 minutes' then return null; end if;
  if s.day_key=utc_day and s.day_attempts>=8 then return null; end if;
  if s.month_key=utc_month and s.month_attempts>=240 then return null; end if;
  update public.jnq_publication_state set lease_token=gen_random_uuid(), reserved_revision=revision,
    deployment_id=null, last_attempt_at=now_at, day_key=utc_day, month_key=utc_month,
    day_attempts=case when day_key=utc_day then day_attempts+1 else 1 end,
    month_attempts=case when month_key=utc_month then month_attempts+1 else 1 end
    where id returning * into s;
  return to_jsonb(s);
end $$;

create function public.jnq_publication_attach(token uuid, deployment text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if deployment is null or length(deployment)=0 then raise exception 'Deployment required'; end if;
  update public.jnq_publication_state set deployment_id=deployment where id and lease_token=token and deployment_id is null;
  if not found then raise exception 'Lease mismatch'; end if;
end $$;

create function public.jnq_publication_finish(token uuid, succeeded boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  -- A build only acknowledges its reserved revision. Saves during the build
  -- remain dirty; failures preserve all pending work and consume attempt quota.
  update public.jnq_publication_state set
    published_revision=case when succeeded then reserved_revision else published_revision end,
    first_dirty_at=case when succeeded and reserved_revision=revision then null else first_dirty_at end,
    lease_token=null,reserved_revision=null,deployment_id=null
    where id and lease_token=token and deployment_id is not null;
  if not found then raise exception 'Lease mismatch'; end if;
end $$;

revoke all on function public.jnq_mark_publication_dirty() from public,anon,authenticated;
revoke all on function public.jnq_publication_status() from public,anon,authenticated;
revoke all on function public.jnq_publication_claim() from public,anon,authenticated;
revoke all on function public.jnq_publication_attach(uuid,text) from public,anon,authenticated;
revoke all on function public.jnq_publication_finish(uuid,boolean) from public,anon,authenticated;
grant execute on function public.jnq_publication_status() to service_role;
grant execute on function public.jnq_publication_claim() to service_role;
grant execute on function public.jnq_publication_attach(uuid,text) to service_role;
grant execute on function public.jnq_publication_finish(uuid,boolean) to service_role;
commit;
