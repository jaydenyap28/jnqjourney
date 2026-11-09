import assert from 'node:assert/strict'
import {execFile, spawn} from 'node:child_process'
import {createHash, createHmac, randomBytes, randomUUID} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {createConnection, createServer} from 'node:net'
import {setTimeout as delay} from 'node:timers/promises'
import {promisify} from 'node:util'
import {SPOT_FIELDS} from '../../spot-contract.mjs'

assert.deepEqual(process.argv.slice(2), ['--approved-local-http'])
assert.equal(process.platform, 'win32')
const engine = ['--host','npipe:////./pipe/docker_engine']
const childEnv = {...process.env}
for (const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete childEnv[name]
const images = {
  postgres:['docker.io/library/postgres:17','sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f','postgres'],
  postgrest:['docker.io/postgrest/postgrest:v14.12','sha256:54000f24847d01a2c2302e0041cf0618b875c57fb48507d743cfa9aaa50bf43c','postgrest/postgrest'],
}
const uuid = randomUUID()
const owner = 'jnq-postgrest-'+uuid
const label = 'jnq.local-postgrest.run='+uuid
const report = {runId:uuid, status:'POSTGREST_LOCAL_FAIL', images:{}, http:[], database:{}, cleanup:{}}
const secrets = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), randomBytes(32).toString('hex')]
const [rootPassword, authPassword, signingKey] = secrets
const exec = promisify(execFile)
const [fixtures,draft] = await Promise.all([
  readFile(new URL('./fixtures.sql',import.meta.url),'utf8'),
  readFile(new URL('../trusted-media-registry.draft.sql',import.meta.url),'utf8'),
])
const sanitize = value => secrets.reduce((out, secret)=>out.split(secret).join('[redacted]'), String(value))
async function docker(args, privateEnv={}) {
  try {
    return (await exec('docker',[...engine,...args],{env:{...childEnv,...privateEnv},timeout:25000,windowsHide:true})).stdout.trim()
  } catch (error) {
    throw Error(sanitize(error.stderr || error.code || 'Docker command failed').slice(0,1000))
  }
}
let db, rest, network, port
let relay
const relaySockets=new Set()
function openLoopbackRelay() {
  // Docker Desktop does not publish ports on an internal-only bridge. Carry
  // bytes over local docker exec into the internal network, preserving HTTP.
  const bridge='exec 3<>/dev/tcp/jnq-http/3000 || exit 1; exec 4<&0; cat <&3 & rx=$!; cat <&4 >&3 & tx=$!; wait -n; kill "$rx" "$tx" 2>/dev/null || true'
  relay=createServer(socket=>{
    relaySockets.add(socket)
    const child=spawn('docker',[...engine,'exec','-i',db,'bash','-c',bridge],
      {env:childEnv,windowsHide:true,stdio:['pipe','pipe','ignore']})
    child.stdin.on('error',()=>socket.destroy())
    child.once('error',()=>socket.destroy())
    child.once('close',()=>socket.end())
    socket.on('error',()=>child.stdin.end())
    socket.once('close',()=>{relaySockets.delete(socket);child.stdin.end()})
    socket.pipe(child.stdin)
    child.stdout.pipe(socket)
  })
  return new Promise((resolve,reject)=>{
    relay.once('error',reject)
    relay.listen(0,'127.0.0.1',()=>{
      const binding=relay.address()
      assert.equal(binding.address,'127.0.0.1')
      resolve(binding.port)
    })
  })
}
function sql(statement, appName='jnq_http_monitor') {
  const child=spawn('docker',[...engine,'exec','-i','-e','PGAPPNAME='+appName,db,
    'psql','-XqAtw','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U','postgres','-d','postgres','-f','-'],
    {env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']})
  return new Promise((resolve,reject)=>{
    let out='', err=''
    const timer=setTimeout(()=>child.kill(),18000)
    child.stdout.setEncoding('utf8').on('data',chunk=>{out+=chunk})
    child.stderr.setEncoding('utf8').on('data',chunk=>{err+=chunk})
    child.stdin.on('error',reject)
    child.once('error',reject)
    child.once('close',code=>{
      clearTimeout(timer)
      if(code===0)resolve(out.trim())
      else reject(Error(sanitize(err || 'psql failed').slice(0,1400)))
    })
    child.stdin.end(statement)
  })
}
async function until(fn, failure, timeout=10000) {
  const end=Date.now()+timeout
  while(Date.now()<end){
    const value=await fn()
    if(value)return value
    await delay(100)
  }
  throw Error(failure)
}
function token(role, {wrong=false, expired=false}={}) {
  const pack=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const input=pack({alg:'HS256',typ:'JWT'})+'.'+pack({role,exp:Math.floor(Date.now()/1000)+(expired?-7200:1800)})
  const jwt=input+'.'+createHmac('sha256',wrong?rootPassword:signingKey).update(input).digest('base64url')
  secrets.push(jwt)
  return jwt
}
const rpc = name => '/rpc/jnq_media_'+name
const key = (id,n=1) => 'media/candidate/'+id+'/00000000-0000-4000-8000-'+String(n).padStart(12,'0')+'.png'
const identity = k => ({key:k,size:68,mime:'image/png',etag:'object-etag',version:'object-version',receipt_size:120,receipt_etag:'receipt-etag',receipt_version:'receipt-version'})
const reg = (id,k=key(id),insert=true) => ({p_spot:id,p_key:k,p_size:68,p_mime:'image/png',p_etag:'object-etag',p_version:'object-version',
  p_receipt_size:120,p_receipt_etag:'receipt-etag',p_receipt_version:'receipt-version',p_can_insert:insert})
const byKey = (id,k=key(id)) => ({p_spot:id,p_key:k})
const byVersion = (id,version=null) => ({p_spot:id,p_expected_updated_at:version})
const save = (id,version,patch,observed=[]) => ({...byVersion(id,version),p_patch:patch,p_observed:observed})
const attachment = keys => ({image_url:'/'+keys[0],images:keys.map(k=>'/'+k)})
const origin = () => 'http://127.0.0.1:'+port
let service
async function http(path, body, jwt=service, headers={}, method=body===undefined?'GET':'POST') {
  const response=await fetch(origin()+path,{method,redirect:'error',signal:AbortSignal.timeout(5000),
    headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(jwt?{Authorization:'Bearer '+jwt}:{}),...headers},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})})
  const bytes=await response.text()
  return {status:response.status, body:bytes?JSON.parse(bytes):null, bodyBytes:Buffer.byteLength(bytes),
    server:response.headers.get('server')}
}
function check(name, result, statuses, code) {
  const observed=result.body?.code || null
  const allowed=Array.isArray(statuses)?statuses:[statuses]
  const codeMatches=code instanceof RegExp ? code.test(observed||'') : code===undefined || code===observed
  const pass=allowed.includes(result.status)&&codeMatches
  report.http.push({scenario:name,status:result.status,code:observed,pass,
    ...(!pass?{bodyBytes:result.bodyBytes,postgrestServer:/^postgrest\b/i.test(result.server||''),
      diagnostic:sanitize(JSON.stringify(result.body)).slice(0,160)}:{}),
    ...(/^JNQ_[A-Z_]+$/.test(result.body?.message||'')?{message:result.body.message}:{})})
  assert.ok(pass,name+' returned HTTP '+result.status+' / '+observed)
  return result.body
}
async function call(name, path, body, status=200, code, jwt=service, headers, method) {
  return check(name,await http(path,body,jwt,headers,method),status,code)
}
const rpcCall = (name,method,body,status=200,code) => call(name,rpc(method),body,status,code)
const snapshot = () => sql("select md5(concat_ws('|',(select jsonb_agg(to_jsonb(l) order by id) from public.locations l),(select jsonb_agg(to_jsonb(r) order by spot_id,object_key) from jnq_media_private.registry r),(select jsonb_agg(spot_id order by spot_id) from jnq_media_private.enabled_spots)));")
async function discardCommittedResponse(body) {
  const response=await fetch(origin()+rpc('register'),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
    headers:{Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(body)})
  // Drain at the transport boundary so the relay stays healthy. The calling
  // application receives neither the result body nor a success decision.
  await response.arrayBuffer()
  return response.status
}

async function permissionsAndContract() {
  const first=1
  const key1=key(first)
  const calls={
    register:reg(first), save:save(first,null,attachment([key1]),[identity(key1)]),
    withdraw:byVersion(first), revoke:byKey(first), delete:byVersion(first), lookup:byKey(first),
  }
  const actors=[
    ['no_jwt',null,[401,403],'42501'],
    ['authenticated',token('authenticated'),403,'42501'],
    ['wrong_signature',token('service_role',{wrong:true}),401,/^PGRST3\d\d$/],
    ['expired',token('service_role',{expired:true}),401,/^PGRST3\d\d$/],
  ]
  const before=await snapshot()
  for(const [actor,jwt,status,code] of actors){
    for(const [name,body] of Object.entries(calls))await call('acl_'+actor+'_'+name,rpc(name),body,status,code,jwt)
  }
  const ordinary=actors[1][1]
  await call('acl_signed_ungranted_postgres_role',rpc('register'),calls.register,[401,403],'42501',token('postgres'))
  await call('acl_authenticator_self_has_no_rpc_grant',rpc('register'),calls.register,[401,403],'42501',token('authenticator'))
  await call('acl_role_claim_in_body',rpc('register'),{...calls.register,role:'service_role'},[401,403,404],/^(42501|PGRST202)$/,ordinary)
  await call('acl_spoof_role_headers',rpc('register'),calls.register,403,'42501',ordinary,{'X-Role':'service_role','X-User-Role':'service_role'})
  await call('acl_authenticated_direct_spot_patch','/locations?id=eq.1',{name:'unauthorized'},403,'42501',ordinary,{},'PATCH')
  for (const [actor,jwt] of [['anon',null],['authenticated',ordinary],['service',service]]) {
    await call('private_table_'+actor,'/registry',undefined,404,'PGRST205',jwt)
    await call('private_accept_profile_'+actor,'/registry',undefined,406,'PGRST106',jwt,{'Accept-Profile':'jnq_media_private'})
    await call('private_content_profile_'+actor,rpc('register'),calls.register,406,'PGRST106',jwt,{'Content-Profile':'jnq_media_private'})
  }
  const after=await snapshot()
  assert.equal(after,before)
  report.database.deniedRequestsStateUnchanged={before,after}

  assert.equal(await rpcCall('service_lookup_unregistered_null','lookup',calls.lookup),null)
  assert.equal(await rpcCall('service_register_first','register',calls.register),true)
  assert.equal(await rpcCall('service_register_confirm','register',reg(first,key1,false)),true)
  await rpcCall('service_register_identity_conflict','register',{...calls.register,p_version:'forged-version'},409,'PT409')
  await rpcCall('service_register_confirm_without_entry','register',reg(2,key(2),false),409,'PT409')
  const unreferenced=await rpcCall('service_lookup_unreferenced','lookup',calls.lookup)
  assert.equal(unreferenced.publiclyReferenced,false)
  assert.equal(unreferenced.version,'object-version')
  assert.equal(unreferenced.receiptVersion,'receipt-version')
  const row=await rpcCall('service_save_explicit_null_version','save',calls.save)
  assert.deepEqual(Object.keys(row).sort(),[...SPOT_FIELDS].sort())
  assert.equal(row.id,first)
  assert.ok(row.updated_at)
  await rpcCall('service_save_wrong_legacy_media_path','save',save(first,row.updated_at,{image_url:'/legacy.jpg'}),400,'PT400')
  await rpcCall('service_save_old_null_version','save',calls.save,409,'PT409')
  await rpcCall('service_save_missing_snapshot','save',save(first,row.updated_at,{name:'Missing proof'}),409,'PT409')
  assert.equal((await rpcCall('service_lookup_referenced_public','lookup',calls.lookup)).publiclyReferenced,true)
  await rpcCall('service_withdraw_stale','withdraw',calls.withdraw,409,'PT409')
  const withdrawn=await rpcCall('service_withdraw','withdraw',byVersion(first,row.updated_at))
  assert.equal(withdrawn.publication_status,'hidden')
  assert.equal((await rpcCall('service_lookup_withdrawn','lookup',calls.lookup)).publiclyReferenced,false)
  assert.deepEqual(await call('anon_hidden_spot_filtered','/locations?id=eq.1&select=id',undefined,200,undefined,null),[])
  const published=await rpcCall('service_republish','save',save(first,withdrawn.updated_at,{publication_status:'published'},[identity(key1)]))
  assert.equal(published.publication_status,'published')
  assert.equal(await rpcCall('service_revoke','revoke',calls.revoke),true)
  assert.equal(await sql('select publication_status from public.locations where id=1;'),'hidden')
  assert.equal(await sql('select revoked_at is not null from jnq_media_private.registry where spot_id=1;'),'t')
  assert.equal(await rpcCall('service_revoke_idempotent','revoke',calls.revoke),true)
  assert.equal(await rpcCall('service_lookup_revoked_null','lookup',calls.lookup),null)
  await rpcCall('service_register_after_revoke','register',calls.register,409,'PT409')
  const revokedVersion=await sql('select updated_at from public.locations where id=1;')
  await rpcCall('service_republish_revoked_denied','save',save(first,revokedVersion,{publication_status:'published'},[identity(key1)]),409,'PT409')
  await rpcCall('service_delete_stale','delete',byVersion(first,published.updated_at),409,'PT409')
  assert.equal(await rpcCall('service_delete','delete',byVersion(first,revokedVersion)),true)
  await rpcCall('service_delete_already_absent','delete',byVersion(first,revokedVersion),404,'PT404')
  assert.equal(await rpcCall('service_lookup_deleted_null','lookup',calls.lookup),null)
  assert.equal(await sql('select count(*) from jnq_media_private.registry where spot_id=1;'),'0')
  report.database.revokeAndCascadeVerified=true

  for(const [id,n] of [[3,1],[4,5],[5,17],[6,30]]){
    const keys=Array.from({length:n},(_,i)=>key(id,i+1))
    for(const [index,k] of keys.entries()){
      assert.equal(await rpcCall('gallery_'+n+'_register_'+(index+1),'register',reg(id,k)),true)
    }
    const patch={...attachment(keys),name:'Synthetic HTTP gallery '+n,is_visited:false,opening_hours:null,tags:['gallery'],
      image_metadata:{[keys[0]]:{caption:'synthetic'}},price_info:{amount:0}}
    const firstSave=await rpcCall('gallery_'+n+'_first_null','save',save(id,null,patch,keys.map(identity)))
    const repeated=await rpcCall('gallery_'+n+'_unchanged','save',save(id,firstSave.updated_at,patch,keys.map(identity)))
    for(const version of [firstSave,repeated]){
      assert.deepEqual(Object.keys(version).sort(),[...SPOT_FIELDS].sort())
      for(const [field,value] of Object.entries(patch))assert.deepEqual(version[field],value)
    }
    assert.notEqual(repeated.updated_at,firstSave.updated_at)
  }
  const beforeFault=await snapshot()
  await rpcCall('service_trigger_skip_rollback','save',save(13,null,{name:'Synthetic force failure'}),503,'PT503')
  await rpcCall('service_bad_json_patch_shape','save',save(13,null,[]),400,'PT400')
  await rpcCall('service_forged_observed_identity','save',save(13,null,attachment([key(13)]),[identity(key(13))]),409,'PT409')
  assert.equal(await snapshot(),beforeFault)
  report.database.failedSaveStateUnchanged=true
}

async function timeoutAndUncertainResult() {
  const before=await snapshot()
  const blocker=sql('begin; select id from public.locations where id=11 for update; select pg_sleep(3); rollback;','jnq_http_timeout_holder')
  blocker.catch(()=>{})
  try {
    await until(async()=>await sql("select exists(select 1 from pg_stat_activity where application_name='jnq_http_timeout_holder' and wait_event='PgSleep');")==='t','Could not observe timeout lock holder')
    await rpcCall('database_statement_timeout','register',reg(11),[400,408,500,503,504],'57014')
  } finally {await blocker}
  assert.equal(await snapshot(),before)
  await rpcCall('timeout_confirm_missing','register',reg(11,key(11),false),409,'PT409')
  assert.equal(await rpcCall('timeout_fresh_request_recovers','register',reg(11)),true)
  assert.equal(await sql('select count(*) from jnq_media_private.registry where spot_id=11;'),'1')
  report.database.timeoutRolledBack=true

  const status=await discardCommittedResponse(reg(12))
  check('register_response_body_discarded',{status,body:null},200)
  const registered=()=>sql("select coalesce(jsonb_agg(to_jsonb(r) order by object_key),'[]'::jsonb) from jnq_media_private.registry r where spot_id=12;")
  const original=await registered()
  assert.equal(JSON.parse(original).length,1)
  assert.equal(await rpcCall('lost_response_confirm_only_retry','register',reg(12,key(12),false)),true)
  await rpcCall('lost_response_retry_changed_version','register',{...reg(12,key(12),false),p_version:'forged-version'},409,'PT409')
  assert.equal(await registered(),original)
  report.database.responseBodyLossIdempotent=true
}

async function stack() {
  report.draftLfSha256=createHash('sha256').update(draft.replaceAll('\r\n','\n')).digest('hex')
  for(const [name,[tag,id,repo]] of Object.entries(images)){
    const [data]=JSON.parse(await docker(['image','inspect',tag]))
    assert.equal(data.Id,id)
    assert.equal(data.Os+'/'+data.Architecture,'linux/amd64')
    assert.ok(data.RepoDigests.includes(repo+'@'+id))
    report.images[name]={tag,id,digest:repo+'@'+id,platform:'linux/amd64'}
  }
  network=await docker(['network','create','--driver','bridge','--internal','--label',label,owner])
  assert.match(network,/^[a-f0-9]{64}$/)
  db=await docker(['run','--pull=never','--rm','-d','--name',owner+'-db','--label',label,
    '--network',network,'--network-alias','jnq-db','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_PASSWORD',
    images.postgres[1]],{POSTGRES_PASSWORD:rootPassword})
  await until(async()=>{
    try {return await docker(['exec',db,'cat','/proc/1/comm'])==='postgres'
      && !!await docker(['exec',db,'pg_isready','-h','/var/run/postgresql'])}catch{return false}
  },'PostgreSQL startup timeout',20000)
  report.postgresVersion=await sql('show server_version;')
  assert.match(report.postgresVersion,/^17\.11\b/)
  const [dbInfo]=JSON.parse(await docker(['inspect',db]))
  assert.equal(dbInfo.Config.Labels['jnq.local-postgrest.run'],uuid)
  assert.deepEqual(Object.keys(dbInfo.NetworkSettings.Networks),[owner])
  assert.equal(dbInfo.HostConfig.PublishAllPorts,false)
  assert.equal(Object.keys(dbInfo.HostConfig.PortBindings||{}).length,0)
  assert.deepEqual(Object.keys(dbInfo.HostConfig.Tmpfs||{}),['/var/lib/postgresql/data'])
  assert.ok(dbInfo.Mounts.every(m=>m.Type==='tmpfs'&&m.Destination==='/var/lib/postgresql/data'))
  await sql(fixtures+"create role authenticator login noinherit password '"+authPassword+"';"+
    "grant anon,authenticated,service_role to authenticator; alter role authenticator set statement_timeout='700ms';"+
    "create function public.synthetic_http_skip() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$ begin return null; end $$;"+
    "create trigger synthetic_http_skip before update on public.locations for each row when (new.id=13 and new.name='Synthetic force failure') execute function public.synthetic_http_skip();")
  const settableRoles=await sql("select rolname from pg_roles where rolname <> 'authenticator' and pg_has_role('authenticator',oid,'SET') order by 1;")
  assert.deepEqual(settableRoles.split(/\r?\n/),['anon','authenticated','service_role'])
  report.database.authenticatorCanSet=settableRoles.split(/\r?\n/)
  rest=await docker(['run','--pull=never','--rm','-d','--name',owner+'-http','--label',label,'--network',network,
    '--network-alias','jnq-http','-e','PGRST_DB_URI','-e','PGRST_JWT_SECRET','-e','PGRST_DB_SCHEMAS=public',
    '-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_DB_CHANNEL_ENABLED=true','-e','PGRST_LOG_LEVEL=crit',images.postgrest[1]],
    {PGRST_DB_URI:'postgres://authenticator:'+authPassword+'@jnq-db:5432/postgres',PGRST_JWT_SECRET:signingKey})
  const [restInfo]=JSON.parse(await docker(['inspect',rest]))
  assert.equal(restInfo.Config.Labels['jnq.local-postgrest.run'],uuid)
  assert.deepEqual(Object.keys(restInfo.NetworkSettings.Networks),[owner])
  assert.equal(restInfo.Mounts.length,0)
  assert.equal(restInfo.HostConfig.PublishAllPorts,false)
  assert.equal(Object.keys(restInfo.HostConfig.PortBindings||{}).length,0)
  const [netInfo]=JSON.parse(await docker(['network','inspect',network]))
  assert.equal(netInfo.Internal,true)
  assert.deepEqual(Object.keys(netInfo.Containers).sort(),[db,rest].sort())
  port=await openLoopbackRelay()
  report.isolation={dbContainer:db,httpContainer:rest,network,networkInternal:true,postgresPublishedPorts:0,
    postgrestPublishedPorts:0,httpBinding:'127.0.0.1:'+port,httpTransport:'loopback TCP relay via local docker exec',
    postgresDataMount:'tmpfs',persistentMounts:0}
  report.postgrestVersion=await docker(['exec',rest,'/bin/postgrest','--version'])
  assert.match(report.postgrestVersion,/\b14\.12\b/)
  service=token('service_role')
  await until(async()=>{
    try {return (await http('/locations?select=id&limit=1',undefined,null)).status===200}catch{return false}
  },'Loopback HTTP readiness timed out',15000)
  await rpcCall('cache_before_sql','lookup',byKey(1),404,'PGRST202')
  await sql(draft+'insert into jnq_media_private.enabled_spots select id from public.locations where id < 16;')
  await rpcCall('cache_stale_after_sql','lookup',byKey(1),404,'PGRST202')
  await sql("notify pgrst, 'reload schema';")
  const ready=await until(async()=>{
    const value=await http(rpc('lookup'),byKey(1))
    return value.status===200 ? value : false
  },'Schema cache did not refresh')
  assert.equal(check('cache_after_notify',ready,200),null)
  await rpcCall('exact_signature_extra_argument','lookup',{...byKey(1),unknown_argument:true},404,'PGRST202')
  await rpcCall('exact_signature_missing_argument','save',{p_spot:1,p_patch:{name:'missing version'},p_observed:[]},404,'PGRST202')
  report.database.exactRpcSignatures=(await sql("select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'jnq_media_%' order by 1;")).split(/\r?\n/)
  assert.equal(report.database.exactRpcSignatures.length,6)
  await permissionsAndContract()
  await timeoutAndUncertainResult()
}

async function cleanup() {
  const failures=[]
  if(relay){
    for(const socket of relaySockets)socket.destroy()
    await new Promise(resolve=>relay.close(resolve))
  }
  for(const [name,id] of [['postgrest',rest],['postgres',db]]){
    if(!/^[a-f0-9]{64}$/.test(id||''))continue
    try {
      try {await docker(['rm','-f',id])} catch(error){if(!/No such container/.test(error.message))throw error}
      assert.equal(await docker(['ps','-aq','--no-trunc','--filter','id='+id]),'')
      report.cleanup[name+'Removed']=true
    } catch(error){failures.push(error.message)}
  }
  if(/^[a-f0-9]{64}$/.test(network||'')){
    try {
      await docker(['network','rm',network])
      assert.equal(await docker(['network','ls','-q','--no-trunc','--filter','id='+network]),'')
      report.cleanup.networkRemoved=true
    } catch(error){failures.push(error.message)}
  }
  if(port){
    try {
      await until(()=>new Promise(resolve=>{
        const conn=createConnection({host:'127.0.0.1',port})
        conn.setTimeout(500,()=>{conn.destroy();resolve(false)})
        conn.once('connect',()=>{conn.destroy();resolve(false)})
        conn.once('error',error=>resolve(error.code==='ECONNREFUSED'))
      }),'Loopback port still reachable',3500)
      report.cleanup.loopbackPortClosed=true
    } catch(error){failures.push(error.message)}
  }
  if(failures.length)throw Error(failures.join(' | '))
}

let passed=false
try {await stack();passed=true}
catch(error){
  report.failure=sanitize(error.message);process.exitCode=1
  if(db){
    try {
      report.database.diagnosticErrors=(await docker(['logs','--tail','40',db])).split(/\r?\n/)
        .filter(line=>/\b(ERROR|FATAL):/.test(line)).slice(-8).map(line=>sanitize(line).slice(0,220))
    } catch {}
  }
}
finally {
  try {await cleanup()}catch(error){report.cleanup.failure=sanitize(error.message);passed=false;process.exitCode=1}
  if(passed)report.status='POSTGREST_LOCAL_PASS'
  await mkdir('artifacts/cloudflare-local-postgrest',{recursive:true})
  const evidence='artifacts/cloudflare-local-postgrest/'+uuid+'.json'
  await writeFile(evidence,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify({status:report.status,httpChecks:report.http.length,evidence,cleanup:report.cleanup,failure:report.failure}))
}
