select jsonb_build_object(
 'identity',jsonb_build_object('database',current_database(),'role',current_user,'ssl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'read_only',current_setting('transaction_read_only')),
 'cron',(select to_jsonb(j) from cron.job j where jobname='jnq-spot-publication-sync'),
 'trigger',(select jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',pg_get_functiondef(t.tgfoid)) from pg_trigger t where tgrelid='public.locations'::regclass and tgname='locations_queue_publication_sync'),
 'other_cron',(select jsonb_agg(jsonb_build_object('jobid',jobid,'name',jobname,'active',active,'schedule',schedule,'command_hash',md5(command)) order by jobid) from cron.job where jobname<>'jnq-spot-publication-sync'),
 'other_triggers',(select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname) from pg_trigger where tgrelid='public.locations'::regclass and tgname<>'locations_queue_publication_sync'),
 'queue',(select jsonb_build_object('rows',count(*),'pending',count(*) filter(where synced_at is null),'processing',count(*) filter(where processing_started_at is not null),'digest',md5(string_agg(to_jsonb(q)::text,E'\n' order by spot_id))) from public.spot_publication_sync q),
 'business',(select jsonb_build_object('rows',count(*),'max_id',max(id),'digest',md5(string_agg(to_jsonb(l)::text,E'\n' order by id))) from public.locations l)
);
