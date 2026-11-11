// Actual PostgreSQL ACL and RLS tests. Supabase Storage HTTP is not simulated as a PASS.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import path from 'node:path'

const rollbackOnly=process.argv[2]==='--rollback-only'
assert.deepEqual(process.argv.slice(2),[rollbackOnly?'--rollback-only':'--isolated-local-sql'])
assert.equal(process.platform,'win32')
const directory=path.resolve(rollbackOnly?'artifacts/cloudflare-static-cutover-implementation':'artifacts/cloudflare-static-cutover-final')
await mkdir(directory,{recursive:true})
const image='sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f'
const label='jnq.visibility.local='+randomUUID()
const env={...process.env}
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key]
const report={startedAt:new Date().toISOString(),image,tests:[],productionConnections:0,storageHttp:'NOT_TESTED',success:false}
function docker(args,input){
  const result=spawnSync('docker',['--host','npipe:////./pipe/docker_engine',...args],{input,env,encoding:'utf8',windowsHide:true,timeout:25000})
  if(result.error)throw result.error
  return {exit:result.status,stdout:result.stdout.trim(),stderr:result.stderr.trim()}
}
function must(args){
  const result=docker(args)
  assert.equal(result.exit,0,result.stderr)
  return result.stdout
}
let id
function sql(statement){
  return docker(['exec','-i',id,'psql','-XqAtw','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','/var/run/postgresql','-U','postgres','-d','postgres','-f','-'],statement)
}
function pass(name,statement,expected){
  const result=sql(statement)
  assert.equal(result.exit,0,result.stderr)
  if(expected!==undefined)assert.equal(result.stdout,expected)
  report.tests.push({name,pass:true})
  return result.stdout
}
function deny(name,statement,expected){
  const result=sql(statement)
  assert.notEqual(result.exit,0,'unexpected SQL success')
  assert.match(result.stderr,expected)
  report.tests.push({name,pass:true,sqlstate:result.stderr.match(/ERROR:\s+(\w{5})/)?.[1]})
}
const base=await readFile('cloudflare/spot-loop/review/local-postgres/fixtures.sql','utf8')
const projection=await readFile('cloudflare/spot-loop/review/public-read-gate.draft.sql','utf8')
const boundary=await readFile('cloudflare/static-recovery/review/static-read-boundary.draft.sql','utf8')
const apply=`set app.jnq_static_reader_verified='true';\n${boundary}`
try {
  assert.equal(must(['info','--format','{{.OSType}}']),'linux')
  assert.equal(must(['image','inspect',image,'--format','{{.Id}}']),image)
  id=must(['run','--pull=never','--rm','-d','--network=none','--tmpfs','/var/lib/postgresql/data:rw','--label',label,
    '-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'-c','listen_addresses=','-c','statement_timeout=15000'])
  assert.match(id,/^[a-f0-9]{64}$/)
  const [inspect]=JSON.parse(must(['inspect',id]))
  assert.equal(inspect.HostConfig.NetworkMode,'none')
  assert.equal(Object.keys(inspect.HostConfig.PortBindings||{}).length,0)
  assert.ok(inspect.Mounts.every(mount=>mount.Type==='tmpfs'&&mount.Destination==='/var/lib/postgresql/data'))
  report.isolation={network:'none',ports:0,tmpfsOnly:true}
  for(let attempt=0;attempt<25;attempt++){
    if(sql('select 1;').exit===0)break
    if(attempt===24)throw Error('LOCAL_POSTGRES_NOT_READY')
    await delay(600)
  }
  report.version=pass('database-version','show server_version;')
  pass('synthetic-baseline',base+`
    drop policy synthetic_public_read on public.locations;
    grant select on public.locations to authenticated;
    create policy "Public can read locations" on public.locations for select to public using (true);
    update public.locations set status='temporarily_closed',review_jayden='synthetic internal value' where id=2;
    update public.locations set publication_status=null where id=3;
    create schema storage;
    create table storage.buckets(id text primary key, public boolean not null);
    create table storage.objects(id integer primary key,bucket_id text references storage.buckets(id),name text not null);
    insert into storage.buckets values ('location-images',true),('unrelated-public',true);
    insert into storage.objects values (1,'location-images','_system/notes-latest.webp'),(2,'location-images','_system/guides-latest.webp'),(3,'unrelated-public','other.png');
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select on storage.objects to anon,authenticated;
    grant select,insert,update on storage.objects to service_role;
    create policy old_read on storage.objects for select to public using (true);
  `)
  if(rollbackOnly){
    const rollback=await readFile('cloudflare/static-recovery/review/static-read-boundary.rollback.sql','utf8')
    deny('rollback-aborts-before-protections',rollback,/SAFE_ROLLBACK_BOUNDARY_NOT_PRESENT/)
    pass('existing-projection',projection)
    pass('private-bucket-fixture',"update storage.buckets set public=false where id='location-images';")
    pass('apply-scoped-boundaries',apply)
    pass('simulate-acl-drift',`grant select on table public.locations to anon,authenticated;
      grant execute on function public.jnq_public_spots(bigint[]) to public;`)
    pass('safe-rollback',rollback)
    deny('rollback-still-denies-table','set role anon; select id from public.locations;',/42501/)
    deny('rollback-still-denies-rpc','set role authenticated; select public.jnq_public_spots(array[1]::bigint[]);',/42501/)
    pass('rollback-retains-private-policy',"set role authenticated; select count(*) from storage.objects where bucket_id='location-images';",'0')
    pass('rollback-retains-service-reader','set role service_role; select jsonb_array_length(public.jnq_public_spots(array[1,2,3]::bigint[]));','2')
  }else{
  pass('reproduce-table-leak','set role anon; select review_jayden from public.locations where id=2;','synthetic internal value')
  pass('reproduce-storage-rls-leak',"set role anon; select count(*) from storage.objects where bucket_id='location-images';",'2')
  pass('apply-existing-projection',projection)
  deny('public-storage-flag-must-be-closed',apply,/STORAGE_PRIVATE_OR_RLS_PRECONDITION_FAILED/)
  // In the synthetic cluster only. Hosted bucket updates use the Storage API.
  pass('private-bucket-fixture',"update storage.buckets set public=false where id='location-images';")
  pass('dependent-view-negative-control','create view public.synthetic_read_leak as select id,review_jayden from public.locations; grant select on public.synthetic_read_leak to anon;')
  deny('owner-view-causes-transaction-abort',apply,/DEPENDENT_VIEW_READ_BYPASS/)
  pass('remove-view-fixture','drop view public.synthetic_read_leak;')
  pass('definer-negative-control','create function public.synthetic_read_leak() returns bigint language sql security definer set search_path=pg_catalog as $$ select count(*) from public.locations $$;')
  deny('default-execute-definer-aborts',apply,/DEFINER_RPC_READ_BYPASS/)
  pass('remove-function-fixture','drop function public.synthetic_read_leak();')
  pass('service-missing-update-negative-control','revoke update on public.locations from service_role;')
  deny('missing-service-update-aborts',apply,/SERVICE_PATH_NOT_AVAILABLE/)
  pass('restore-test-service-update','grant update on public.locations to service_role;')
  pass('apply-scoped-boundaries',apply)
  for(const role of ['anon','authenticated']){
    deny(`${role}-closed-table`,`set role ${role}; select id from public.locations;`,/42501/)
    deny(`${role}-closed-internal-column`,`set role ${role}; select review_jayden from public.locations;`,/42501/)
    deny(`${role}-projection-denied`,`set role ${role}; select public.jnq_public_spots(array[2]::bigint[]);`,/42501/)
    pass(`${role}-target-storage-denied`,`set role ${role}; select count(*) from storage.objects where bucket_id='location-images';`,'0')
    pass(`${role}-unrelated-storage-preserved`,`set role ${role}; select count(*) from storage.objects where bucket_id='unrelated-public';`,'1')
  }
  pass('future-grant-does-not-reopen-rows','begin; grant select on public.locations to anon; set role anon; select count(*) from public.locations; rollback;','0')
  const values=JSON.parse(pass('service-build-projection',`set role service_role; select public.jnq_public_spots(array[1,2,3]::bigint[]);`))
  assert.deepEqual(values.map(row=>row.id),[1,3]);assert.ok(values.every(row=>!Object.hasOwn(row,'review_jayden')))
  pass('service-admin-read-and-write',"set role service_role; update public.locations set review_jayden='synthetic edit' where id=2; select review_jayden from public.locations where id=2;",'synthetic edit')
  pass('service-storage-read-and-write',"set role service_role; update storage.objects set name='_system/new.webp' where id=2; insert into storage.objects values (4,'location-images','draft.webp'); select count(*) from storage.objects where bucket_id='location-images';",'3')
  }
  report.success=true
}catch(error){report.failure=String(error.message).slice(0,600);process.exitCode=1}
finally{
  if(id&&/^[a-f0-9]{64}$/.test(id)){
    const [info]=JSON.parse(must(['inspect',id]))
    assert.equal(info.Id,id)
    assert.equal(info.Config.Labels[label.split('=')[0]],label.split('=')[1])
    must(['stop',id])
    report.cleaned=must(['ps','-aq','--filter',`label=${label}`])===''
  }
  report.finishedAt=new Date().toISOString()
  await writeFile(path.join(directory,rollbackOnly?'rollback-local.json':'visibility-local.json'),JSON.stringify(report,null,2))
}
console.log(JSON.stringify({success:report.success,tests:report.tests.length,version:report.version,cleaned:report.cleaned,failure:report.failure}))
