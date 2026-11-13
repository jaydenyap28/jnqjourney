import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
const image=process.env.JNQ_POSTGRES17_IMAGE
assert.match(image||'',/^sha256:[a-f0-9]{64}$/)
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:30000,stdio:['pipe','pipe','pipe']}).trim()
assert.equal(docker(['image','inspect',image,'--format','{{.Id}}']),image)
const name='jnq-formal-boundary-'+Date.now()
let container
const evidence={source:'LOCAL_SYNTHETIC_POSTGRES_ONLY',image,network:'none',publishedPorts:0,checks:[],cleaned:false}
try {
  container=docker(['run','--pull=never','--detach','--rm','--name',name,'--network','none','--read-only',
    '--tmpfs','/var/lib/postgresql/data:rw,size=192m','--tmpfs','/var/run/postgresql:rw,size=16m','--tmpfs','/tmp:rw,size=16m',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'-c',"listen_addresses="])
  assert.match(container,/^[a-f0-9]{64}$/)
  const state=JSON.parse(docker(['inspect',container]))[0]
  assert.equal(state.HostConfig.NetworkMode,'none');assert.equal(Object.keys(state.HostConfig.PortBindings||{}).length,0)
  let ready=false
  for(let i=0;i<30;i++){try{docker(['exec',container,'pg_isready','-U','postgres']);ready=true;break}catch{}await new Promise(resolve=>setTimeout(resolve,300))}
  assert.ok(ready,'LOCAL_POSTGRES_NOT_READY')
  const sql=text=>docker(['exec','-i',container,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At'],text)
  evidence.postgres=sql('select version();')
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key,public boolean);
    insert into storage.buckets values('jnq-admin-formal-publication',false),('location-images',true);
    create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
    insert into storage.objects(bucket_id,name) values('jnq-admin-formal-publication','synthetic-private'),('location-images','synthetic-legacy');
    create table public.locations(id bigint generated always as identity primary key,name text,review_jayden text);
    insert into public.locations(name,review_jayden) values('synthetic','internal');
    alter table public.locations enable row level security; alter table storage.objects enable row level security;
    grant usage on schema public,storage to anon,authenticated,service_role;
    grant all on public.locations,storage.objects to service_role;
    grant usage,select on all sequences in schema public,storage to service_role;
    grant usage,select on all sequences in schema storage to anon,authenticated;
    grant select on public.locations to anon,authenticated;
    grant all on storage.objects to anon,authenticated;
    create policy old_open_locations on public.locations for select to anon,authenticated using(true);
    create policy old_open_storage on storage.objects for all to anon,authenticated using(true) with check(true);`)
  const draft=await readFile('cloudflare/admin-preview/review/formal-private-boundary.draft.sql','utf8')
  sql("set app.jnq_formal_private_cutover_approved='true';\n"+draft)
  evidence.checks.push('single transaction DDL applied')
  function denied(text){try{sql('\\set VERBOSITY verbose\n'+text);assert.fail('must reject')}catch(error){assert.match(String(error.stderr||''),/42501/);evidence.checks.push('42501 browser operation rejected')}}
  denied('set role anon; select review_jayden from public.locations;')
  denied('set role authenticated; select name from public.locations;')
  assert.equal(sql("set role anon; select count(*) from storage.objects where bucket_id='jnq-admin-formal-publication';").split('\n').at(-1),'0')
  assert.equal(sql("set role authenticated; select count(*) from storage.objects where bucket_id='jnq-admin-formal-publication';").split('\n').at(-1),'0')
  denied("set role authenticated; insert into storage.objects(bucket_id,name) values('jnq-admin-formal-publication','forged');")
  assert.equal(sql("set role authenticated; update storage.objects set name='forged' where bucket_id='jnq-admin-formal-publication';").split('\n').at(-1),'UPDATE 0')
  assert.equal(sql("set role authenticated; delete from storage.objects where bucket_id='jnq-admin-formal-publication';").split('\n').at(-1),'DELETE 0')
  assert.equal(sql("set role anon; select count(*) from storage.objects where bucket_id='location-images';").split('\n').at(-1),'1')
  assert.equal(sql("set role service_role; update public.locations set name='synthetic authorized' where id=1; select count(*) from storage.objects where bucket_id='jnq-admin-formal-publication';").split('\n').at(-1),'1')
  assert.equal(sql("select count(*) from public.locations;"),'1')
  assert.equal(sql("select public from storage.buckets where id='location-images';"),'t')
  evidence.checks.push('anon/authenticated private Storage rows invisible','service_role read/write preserved','original bucket public flag and row count unchanged')
  sql(`drop policy jnq_formal_locations_no_browser_read on public.locations; drop policy jnq_formal_private_store_server_only on storage.objects;
    grant select on public.locations to anon;create role synthetic_inherited_reader;grant select on public.locations to synthetic_inherited_reader;grant synthetic_inherited_reader to anon;`)
  try{sql("set app.jnq_formal_private_cutover_approved='true';\n"+draft);assert.fail('inherited grant must abort')}catch(error){assert.match(String(error.stderr||''),/FORMAL_INHERITED_READ_PATH_REMAINS/)}
  assert.equal(sql("select has_table_privilege('anon','public.locations','SELECT');"),'t')
  assert.equal(sql("select count(*) from pg_policies where policyname like 'jnq_formal_%';"),'0')
  evidence.checks.push('inherited ACL causes whole transaction rollback')
} finally {
  if(container&&/^[a-f0-9]{64}$/.test(container)){docker(['rm','--force',container]);assert.equal(docker(['ps','-aq','--filter','id='+container]),'');evidence.cleaned=true}
  await mkdir('artifacts/cloudflare-formal-off-20261113',{recursive:true})
  await writeFile('artifacts/cloudflare-formal-off-20261113/local-sql-boundary.json',JSON.stringify(evidence,null,2))
}
console.log(JSON.stringify(evidence))
