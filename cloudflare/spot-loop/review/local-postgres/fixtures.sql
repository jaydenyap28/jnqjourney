-- Synthetic fixtures. Run only in the disposable local cluster.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
revoke create on schema public from public;

create table public.locations (
  id bigint primary key,
  name text not null,
  name_cn text, category text, address text,
  latitude double precision not null, longitude double precision not null,
  region_id bigint, video_url text, facebook_video_url text,
  image_url text, images text[], description text, review text, tags text[],
  visit_date date, opening_hours text, price_info jsonb, google_maps_url text,
  status text, created_at timestamptz, updated_at timestamptz,
  publication_status text check (publication_status in ('published','hidden','draft')),
  seo_title_zh text, seo_description_zh text, seo_title_en text, seo_description_en text,
  experience_zh text, experience_en text, related_note_slugs text[],
  image_metadata jsonb check (jsonb_typeof(image_metadata) = 'object'),
  redirect_url text, redirect_type integer check (redirect_type in (301,302)),
  review_jayden text, review_qing text, is_visited boolean
);
alter table public.locations enable row level security;
grant select on public.locations to anon;
create policy synthetic_public_read on public.locations for select to anon
  using (status = 'active' and publication_status = 'published');
grant select, update, delete on public.locations to service_role;

-- Deletion also exercises a pre-existing dependency independently of Registry.
create table public.synthetic_location_children (
  location_id bigint primary key references public.locations(id) on delete cascade
);
insert into public.locations (id,name,latitude,longitude,status,publication_status)
select n, 'Synthetic Spot ' || n, 0, 0, 'active', 'published'
from generate_series(1,19) as n;
insert into public.synthetic_location_children values (7);

-- Failure injection is switched on only in the test session.
create function public.synthetic_mutation_fault() returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_setting('jnq.test_fault', true) = 'skip' then return null; end if;
  if tg_op = 'DELETE' then return old; end if;
  if current_setting('jnq.test_fault', true) = 'rewrite' then new.images := array['/legacy.jpg']; end if;
  return new;
end
$$;
create trigger synthetic_spot_fault before update or delete on public.locations
for each row execute function public.synthetic_mutation_fault();

create function public.synthetic_after_update_fault() returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if pg_trigger_depth() = 1 and current_setting('jnq.test_fault', true) = 'after_rewrite' then
    update public.locations set images = array['/legacy.jpg'] where id = new.id;
  end if;
  return null;
end
$$;
create trigger synthetic_after_update_fault after update on public.locations
for each row execute function public.synthetic_after_update_fault();
