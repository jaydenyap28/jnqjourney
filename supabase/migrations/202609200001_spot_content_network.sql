-- Additive only: do not rewrite existing editorial content, URLs or images.
begin;
alter table public.locations
  add column if not exists seo_title_zh text,
  add column if not exists seo_description_zh text,
  add column if not exists seo_title_en text,
  add column if not exists seo_description_en text,
  add column if not exists experience_zh text,
  add column if not exists experience_en text,
  add column if not exists related_note_slugs text[],
  add column if not exists image_metadata jsonb,
  add column if not exists redirect_url text,
  add column if not exists redirect_type integer default 301;

-- The existing status (active/hidden/etc.) stays authoritative. A redirect is
-- an explicit independent instruction and works even for a hidden source.
alter table public.locations add constraint locations_redirect_type_check
  check (redirect_type is null or redirect_type in (301, 302));
alter table public.locations add constraint locations_image_metadata_check
  check (image_metadata is null or jsonb_typeof(image_metadata) = 'object');

create or replace function public.validate_spot_redirect()
returns trigger language plpgsql set search_path = public as $$
declare
  target text;
  target_id bigint;
  visited bigint[] := array[new.id::bigint];
  hops integer := 0;
begin
  if new.redirect_url is null or btrim(new.redirect_url) = '' then
    new.redirect_url := null;
    return new;
  end if;
  -- Serialize editorial routing changes; runtime validation also checks every
  -- hop, including preexisting data and concurrent transaction snapshots.
  perform pg_advisory_xact_lock(20260920, 1);
  new.redirect_url := btrim(new.redirect_url);
  target := new.redirect_url;
  loop
    if target !~ '^/(en/)?(notes|spot)/[[:alnum:]_-]+$' then
      raise exception 'Redirect must be a local /notes/slug or /spot/slug URL';
    end if;
    exit when target !~ '/spot/';
    target_id := substring(target from '-([1-9][0-9]*)$')::bigint;
    if target_id is null then raise exception 'Spot redirect must include its numeric ID'; end if;
    if target_id = any(visited) then raise exception 'Spot redirect loop detected'; end if;
    visited := array_append(visited, target_id);
    hops := hops + 1;
    if hops >= 16 then raise exception 'Spot redirect chain exceeds 16 hops'; end if;
    select nullif(btrim(redirect_url), '') into target from public.locations where id = target_id;
    exit when target is null;
  end loop;
  return new;
end $$;

create trigger locations_validate_spot_redirect
before insert or update of redirect_url, redirect_type on public.locations
for each row execute function public.validate_spot_redirect();
commit;
