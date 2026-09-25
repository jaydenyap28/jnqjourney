create or replace function public.complete_spot_publication_sync(
  p_spot_id bigint,
  p_source_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  source_still_current boolean := false;
begin
  update public.spot_publication_sync s
  set synced_source_updated_at = case
        when s.source_updated_at = p_source_updated_at then p_source_updated_at
        else null
      end,
      synced_at = case
        when s.source_updated_at = p_source_updated_at then now()
        else s.synced_at
      end,
      processing_started_at = null,
      last_error = null
  where s.spot_id = p_spot_id
  returning (s.source_updated_at = p_source_updated_at)
  into source_still_current;

  return coalesce(source_still_current, false);
end;
$$;

revoke all on function public.complete_spot_publication_sync(bigint, timestamptz)
from public, anon, authenticated;

grant execute on function public.complete_spot_publication_sync(bigint, timestamptz)
to service_role;
