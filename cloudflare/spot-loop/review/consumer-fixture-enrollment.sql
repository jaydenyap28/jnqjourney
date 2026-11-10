-- Fixture DML only. This guarded transaction was executed through the official
-- connection explicitly bound to rnamstwwbzknwbjwdgrf in this round.
-- Never run against vrufunuomioczocdsoer. Never rerun the completed enrollment.
begin;
set local lock_timeout='3s';
do $$ begin
  if current_user <> 'postgres'
    or (select count(*) from public.locations where id in (92061,92062)
      and name='Consumer Fixture '||id::text and status='active'
      and publication_status='hidden' and updated_at is null)<>2
    or exists(select 1 from jnq_media_private.enabled_spots where spot_id in (92061,92062))
    or exists(select 1 from jnq_media_private.registry where spot_id in (92061,92062))
  then raise exception 'CONSUMER_FIXTURE_PRECONDITION_CHANGED'; end if;
end $$;
insert into jnq_media_private.enabled_spots(spot_id) values (92061),(92062);
commit;
