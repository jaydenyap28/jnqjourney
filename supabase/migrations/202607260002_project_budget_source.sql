alter table public.guide_budget_snapshots
  rename column source_event_key to source_project_key;

alter table public.guide_budget_snapshots
  add column source_project_name text;

update public.guide_budget_snapshots
   set source_project_name = source_project_key
 where source_project_name is null;

alter table public.guide_budget_snapshots
  alter column source_project_name set not null;

alter table public.guide_budget_snapshots
  drop column trip_date_from,
  drop column trip_date_to;

alter table public.guide_budget_snapshots
  drop constraint if exists guide_budget_snapshots_source_check;

update public.guide_budget_snapshots
   set source = 'moneybot_project'
 where source = 'moneybot';

alter table public.guide_budget_snapshots
  add constraint guide_budget_snapshots_source_check
  check (source = 'moneybot_project');

alter table public.guide_budget_snapshots
  drop constraint if exists guide_budget_snapshots_source_source_event_key_snapshot_version_key;

alter table public.guide_budget_snapshots
  add constraint guide_budget_snapshots_source_project_version_key
  unique (source, source_project_key, snapshot_version);
