-- 2026-10-04 Analytics v2: visitors, 30-minute visits, device and attribution

alter table public.page_views
  add column if not exists visitor_id text,
  add column if not exists visit_id text,
  add column if not exists device_type text,
  add column if not exists traffic_source text,
  add column if not exists traffic_medium text,
  add column if not exists traffic_campaign text;

alter table public.analytics_events
  add column if not exists visitor_id text,
  add column if not exists visit_id text,
  add column if not exists traffic_source text,
  add column if not exists traffic_medium text,
  add column if not exists traffic_campaign text;

alter table public.affiliate_clicks
  add column if not exists visitor_id text,
  add column if not exists visit_id text,
  add column if not exists traffic_source text,
  add column if not exists traffic_medium text,
  add column if not exists traffic_campaign text;

create index if not exists page_views_visitor_time_idx
  on public.page_views (visitor_id, viewed_at desc);
create index if not exists page_views_visit_time_idx
  on public.page_views (visit_id, viewed_at asc);
create index if not exists page_views_source_time_idx
  on public.page_views (traffic_source, viewed_at desc);

create index if not exists analytics_events_visitor_time_idx
  on public.analytics_events (visitor_id, occurred_at desc);
create index if not exists analytics_events_visit_time_idx
  on public.analytics_events (visit_id, occurred_at asc);
create index if not exists analytics_events_source_time_idx
  on public.analytics_events (traffic_source, occurred_at desc);

create index if not exists affiliate_clicks_visit_time_idx
  on public.affiliate_clicks (visit_id, clicked_at desc);
