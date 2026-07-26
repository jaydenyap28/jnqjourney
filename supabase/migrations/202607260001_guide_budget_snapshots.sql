create extension if not exists pgcrypto;

create table if not exists public.guide_budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  guide_slug text not null,
  source text not null check (source = 'moneybot'),
  source_event_key text not null,
  snapshot_version integer not null check (snapshot_version > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  scope text not null check (scope in ('per_person', 'per_room', 'per_group', 'total_trip', 'unspecified')),
  traveller_count integer check (traveller_count is null or traveller_count > 0),
  total numeric(18,2) not null,
  categories jsonb not null default '{}'::jsonb,
  unclassified_amount numeric(18,2) not null default 0,
  transaction_count integer not null check (transaction_count >= 0),
  trip_date_from date not null,
  trip_date_to date not null check (trip_date_to >= trip_date_from),
  generated_at timestamptz not null,
  confirmed_at timestamptz not null,
  received_at timestamptz not null default now(),
  review_status text not null default 'imported'
    check (review_status in ('imported', 'reviewed', 'published', 'rejected')),
  published_at timestamptz,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  unique (source, source_event_key, snapshot_version),
  unique (checksum)
);

create unique index if not exists guide_budget_one_published_per_guide
  on public.guide_budget_snapshots (guide_slug)
  where review_status = 'published';

create index if not exists guide_budget_snapshots_guide_received
  on public.guide_budget_snapshots (guide_slug, received_at desc);

create table if not exists public.guide_budget_sync_nonces (
  nonce text primary key,
  request_timestamp timestamptz not null,
  received_at timestamptz not null default now()
);

alter table public.guide_budget_snapshots enable row level security;
alter table public.guide_budget_sync_nonces enable row level security;

drop policy if exists "published guide budgets are public" on public.guide_budget_snapshots;
create policy "published guide budgets are public"
  on public.guide_budget_snapshots
  for select
  to anon, authenticated
  using (review_status = 'published');

create or replace function public.publish_guide_budget_snapshot(target_id uuid)
returns setof public.guide_budget_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.guide_budget_snapshots;
begin
  select * into target from public.guide_budget_snapshots where id = target_id for update;
  if target.id is null then
    raise exception 'Snapshot not found';
  end if;
  if target.review_status not in ('reviewed', 'published') then
    raise exception 'Snapshot must be reviewed before publishing';
  end if;
  if target.unclassified_amount <> 0 then
    raise exception 'Unclassified spend must be resolved before publishing';
  end if;

  update public.guide_budget_snapshots
     set review_status = 'reviewed', published_at = null
   where guide_slug = target.guide_slug
     and review_status = 'published'
     and id <> target_id;

  update public.guide_budget_snapshots
     set review_status = 'published', published_at = now()
   where id = target_id;

  return query select * from public.guide_budget_snapshots where id = target_id;
end;
$$;

revoke all on function public.publish_guide_budget_snapshot(uuid) from public;
grant execute on function public.publish_guide_budget_snapshot(uuid) to service_role;
revoke all on table public.guide_budget_sync_nonces from anon, authenticated;
