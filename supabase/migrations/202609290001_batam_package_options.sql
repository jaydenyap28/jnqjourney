alter table public.travel_package_options
  add column if not exists highlights jsonb not null default '[]'::jsonb,
  add column if not exists itinerary_days jsonb not null default '[]'::jsonb;

create table if not exists public.travel_package_option_internal (
  option_id bigint primary key references public.travel_package_options(id) on delete cascade,
  supplier_ref text,
  supplier_package_name text,
  internal_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.travel_package_option_internal enable row level security;

revoke all on table public.travel_package_option_internal from anon, authenticated;
