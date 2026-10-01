
-- JnQ Journey production hygiene: isolate analytics writes, fix one orphan location,
-- and lock trigger function search_path.
update public.locations
set region_id = 1,
    updated_at = now()
where id = 274
  and region_id is null;

alter function public.update_ad_placements_updated_at() set search_path = public, pg_temp;
alter function public.update_generic_updated_at() set search_path = public, pg_temp;
alter function public.update_affiliate_links_updated_at() set search_path = public, pg_temp;

drop policy if exists "Anyone can insert page views" on public.page_views;
drop policy if exists "Authenticated users can read page views" on public.page_views;
drop policy if exists "Authenticated users can manage page views" on public.page_views;
