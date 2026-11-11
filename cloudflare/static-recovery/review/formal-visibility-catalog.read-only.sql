-- Directory evidence only. Check connection project vrufunuomioczocdsoer first.
-- No row payloads or object contents are read.
select current_user, session_user;
select id, public from storage.buckets where id='location-images';
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where (schemaname,tablename) in (('public','locations'),('storage','objects'),('storage','buckets'))
order by schemaname,tablename,policyname;
select n.nspname, c.relname, c.relrowsecurity, c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname,c.relname) in (('public','locations'),('storage','objects'),('storage','buckets'));
select a.attname,a.attacl from pg_attribute a
where a.attrelid='public.locations'::regclass and a.attnum>0 and not a.attisdropped and a.attacl is not null;
with recursive reads(oid) as (
  select 'public.locations'::regclass::oid union
  select r.ev_class from reads x join pg_depend d on d.refclassid='pg_class'::regclass and d.refobjid=x.oid and d.classid='pg_rewrite'::regclass
  join pg_rewrite r on r.oid=d.objid join pg_class v on v.oid=r.ev_class and v.relkind in ('v','m')
)
select oid::regclass::text,has_any_column_privilege('anon',oid,'SELECT') as anon_select,
  has_any_column_privilege('authenticated',oid,'SELECT') as authenticated_select from reads;
select p.oid::regprocedure::text,p.prosecdef,p.prorettype::regtype::text,p.proacl,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','storage') and (p.proname='jnq_public_spots' or p.prosrc ~* '\m(locations|location-images)\M');
