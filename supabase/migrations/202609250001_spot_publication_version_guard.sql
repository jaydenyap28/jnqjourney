alter table public.spot_publication_sync
  add column if not exists claimed_source_updated_at timestamptz;

drop function if exists public.complete_spot_publication_sync(bigint, timestamptz);

create or replace function public.claim_next_spot_publication_sync()
returns table(spot_id bigint, source_updated_at timestamptz)
language plpgsql
security definer
set search_path='public'
as $$
declare
  claimed public.spot_publication_sync%rowtype;
begin
  select *
  into claimed
  from public.spot_publication_sync
  where synced_source_updated_at is null
    and attempts < 5
    and (processing_started_at is null or processing_started_at < now() - interval '10 minutes')
  order by source_updated_at asc, spot_id asc
  for update skip locked
  limit 1;

  if claimed.spot_id is null then return; end if;

  update public.spot_publication_sync
  set processing_started_at = now(),
      claimed_source_updated_at = claimed.source_updated_at,
      attempts = attempts + 1,
      last_error = null
  where public.spot_publication_sync.spot_id = claimed.spot_id;

  return query select claimed.spot_id, claimed.source_updated_at;
end;
$$;

create or replace function public.complete_spot_publication_sync(p_spot_id bigint)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  update public.spot_publication_sync s
  set synced_source_updated_at = case
        when s.claimed_source_updated_at is not null
         and s.source_updated_at = s.claimed_source_updated_at
        then s.claimed_source_updated_at else null end,
      synced_at = case
        when s.claimed_source_updated_at is not null
         and s.source_updated_at = s.claimed_source_updated_at
        then now() else s.synced_at end,
      processing_started_at = null,
      claimed_source_updated_at = null,
      last_error = null
  where s.spot_id = p_spot_id;
end;
$$;

create or replace function public.fail_spot_publication_sync(p_spot_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  update public.spot_publication_sync
  set processing_started_at = null,
      claimed_source_updated_at = null,
      last_error = left(coalesce(p_error,'Unknown sync error'),1000)
  where spot_id = p_spot_id;
end;
$$;

revoke all on function public.claim_next_spot_publication_sync() from public, anon, authenticated;
revoke all on function public.complete_spot_publication_sync(bigint) from public, anon, authenticated;
revoke all on function public.fail_spot_publication_sync(bigint,text) from public, anon, authenticated;
grant execute on function public.claim_next_spot_publication_sync() to service_role;
grant execute on function public.complete_spot_publication_sync(bigint) to service_role;
grant execute on function public.fail_spot_publication_sync(bigint,text) to service_role;
