// Prepare-only runner. Run after approval against a new networkless container.
import assert from 'node:assert/strict'
import {execFile, spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import {promisify} from 'node:util'
import {SPOT_FIELDS} from '../../spot-contract.mjs'

const [gate, image, ...extra] = process.argv.slice(2)
if (gate !== '--approved-local-sql' || !/^sha256:[0-9a-f]{64}$/.test(image || '') || extra.length) {
  throw Error('After explicit local SQL approval: node run.mjs --approved-local-sql sha256:<reviewed-local-postgres-17-image-id>')
}
if (process.platform !== 'win32') throw Error('This harness is pinned to the Windows local Docker Engine pipe')
const env = {...process.env}
for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete env[name]
const dockerArgs = ['--host', 'npipe:////./pipe/docker_engine']
const exec = promisify(execFile)
const docker = async (...args) => (await exec('docker', [...dockerArgs, ...args], {env, timeout:30000, windowsHide:true})).stdout.trim()
const launch = args => spawn('docker', [...dockerArgs, ...args], {env, windowsHide:true, stdio:['pipe','pipe','pipe']})
const psql = ['psql','-X','-q','-A','-t','-w','-h','/var/run/postgresql','-U','postgres','-d','postgres']
const draft = await readFile(new URL('../trusted-media-registry.draft.sql', import.meta.url), 'utf8')
const fixtures = await readFile(new URL('./fixtures.sql', import.meta.url), 'utf8')
const sessions = new Set()
let container

async function until(check, message, limitMs=10000) {
  const deadline = Date.now() + limitMs
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(80)
  }
  throw Error(message)
}

async function batch(sql, expectedError) {
  const child = launch(['exec','-i',container,...psql,'-v','ON_ERROR_STOP=1','-f','-'])
  let diagnostic = ''
  child.stderr.setEncoding('utf8').on('data', value => {diagnostic += value})
  child.stdout.resume()
  const result = new Promise((resolve,reject) => {
    child.once('error',reject)
    child.once('close',resolve)
    child.stdin.once('error',reject)
  })
  const timer = setTimeout(() => child.kill(), 25000)
  try {
    child.stdin.end(sql)
    const code = await result
    if (expectedError) {
      assert.notEqual(code, 0)
      assert.ok(diagnostic.includes(expectedError), diagnostic)
    } else assert.equal(code, 0, diagnostic)
  } finally {clearTimeout(timer)}
}

function session() {
  const child = launch(['exec','-i',container,...psql])
  sessions.add(child)
  child.stdin.on('error', () => {})
  let active, sequence=0, output='', diagnostic='', closed=false
  child.stdout.setEncoding('utf8').on('data', chunk => {
    output += chunk
    if (!active) return
    const match = output.match(new RegExp('^'+active.marker+' ([A-Z0-9]{5})\\r?\\n','m'))
    if (!match) return
    const result = {state:match[1], value:output.slice(0,match.index).trim()}
    const {finish} = active
    active = undefined
    output = output.slice(match.index+match[0].length)
    finish(null,result)
  })
  child.stderr.setEncoding('utf8').on('data', chunk => {diagnostic += chunk})
  function disconnected(error) {
    closed = true
    if (active) {
      const {finish} = active
      active = undefined
      finish(error)
    }
  }
  child.once('error', disconnected)
  child.once('close', code => disconnected(Error('psql closed '+code+' '+diagnostic)))
  return {
    run(sql) {
      assert.ok(!closed&&!active, 'Session must be idle')
      diagnostic = ''
      return new Promise((resolve,reject) => {
        const marker = '__JNQ_SQL_'+ ++sequence +'__'
        const timer = setTimeout(() => disconnected(Error('psql command timed out '+diagnostic)), 20000)
        active = {marker,finish(error,result){clearTimeout(timer);if(error)reject(error);else resolve(result)}}
        child.stdin.write(sql+'\n\\echo '+marker+' :SQLSTATE\n')
      })
    }
  }
}

async function q(client, sql, state='00000') {
  const result = await client.run(sql)
  assert.equal(result.state,state,sql)
  return result.value
}
const literal = value => value === null ? 'null' : "'"+String(value).replaceAll("'","''")+"'"
const json = value => literal(JSON.stringify(value))+'::jsonb'
const media = (id,n=1) => 'media/candidate/'+id+'/00000000-0000-4000-8000-'+String(n).padStart(12,'0')+'.png'
const register = (id,key=media(id),insert=true,version='version-1') =>
  'select public.jnq_media_register('+[id,literal(key),68,"'image/png'","'etag-1'",literal(version),120,"'receipt-etag'","'receipt-version'",insert].join(',')+');'
const entry = key => ({key,size:68,mime:'image/png',etag:'etag-1',version:'version-1',receipt_size:120,receipt_etag:'receipt-etag',receipt_version:'receipt-version'})
const save = (id,version,patch,observed=[]) =>
  'select public.jnq_media_save('+[id,literal(version),json(patch),json(observed)].join(',')+');'
const attach = key => ({image_url:'/'+key,images:['/'+key]})
const lookup = id => 'select public.jnq_media_lookup('+id+','+literal(media(id))+');'
const revoke = id => 'select public.jnq_media_revoke('+id+','+literal(media(id))+');'
const withdraw = (id,version) => 'select public.jnq_media_withdraw('+id+','+literal(version)+');'
const remove = (id,version) => 'select public.jnq_media_delete('+id+','+literal(version)+');'
const begin = client => q(client,'begin isolation level read committed;')
const finish = (client,commit=true) => q(client,commit?'commit;':'rollback;')
function pending(client,sql){const promise=client.run(sql);promise.catch(()=>{});return promise}

try {
  // --pull=never and an image ID require a reviewed image already present locally.
  await docker('image','inspect',image)
  container = await docker('run','--pull=never','--rm','--detach','--network=none',
    '--tmpfs','/var/lib/postgresql/data:rw','--label','jnq.local-postgres=true',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'-c','listen_addresses=',
    '-c','statement_timeout=15000','-c','idle_in_transaction_session_timeout=20000')
  assert.match(container,/^[a-f0-9]{64}$/)
  assert.equal(await docker('inspect','--format','{{.HostConfig.NetworkMode}}',container),'none')
  await until(async()=>{
    try {
      return await docker('exec',container,'cat','/proc/1/comm')==='postgres'
        && !!await docker('exec',container,'pg_isready','-h','/var/run/postgresql')
    } catch {return false}
  },'PostgreSQL startup timeout',20000)
  const version = await docker('exec',container,...psql,'-c','show server_version_num')
  assert.match(version,/^17\d{4}$/)
  await batch(fixtures)
  const monitor = session()
  // Adversarial inherited default EXECUTE must reject the entire draft.
  await batch('create role jnq_test_acl_parent nologin; grant jnq_test_acl_parent to anon; alter default privileges grant execute on functions to jnq_test_acl_parent;')
  await batch(draft,'JNQ_RPC_EXECUTE_EXPOSED')
  assert.equal(await q(monitor,"select to_regnamespace('jnq_media_private') is null and to_regprocedure('public.jnq_media_lookup(bigint,text)') is null;"),'t')
  await batch('alter default privileges revoke execute on functions from jnq_test_acl_parent; drop role jnq_test_acl_parent;')
  await batch(draft)
  await batch('insert into jnq_media_private.enabled_spots select id from public.locations where id < 16;')

  for (const role of ['anon','authenticated','jnq_public_only']) {
    if (role==='jnq_public_only') await q(monitor,'create role jnq_public_only nologin;')
    const client = session()
    await q(client,'set role '+role+';')
    for (const sql of [register(1),save(1,null,{name:'forged'}),withdraw(1,null),revoke(1),remove(1,null),lookup(1),
      'select * from jnq_media_private.registry;',
      'insert into jnq_media_private.enabled_spots values (16);']) await q(client,sql,'42501')
  }
  const a=session(), b=session()
  for (const client of [a,b]) await q(client,'set role service_role;')
  const bPid=Number(await q(b,'select pg_backend_pid();'))
  assert.ok(Number.isSafeInteger(bPid)&&bPid>0)
  const waitB=()=>until(async()=>Number(await q(monitor,'select cardinality(pg_blocking_pids('+bPid+'));'))>0,'Second session did not wait on a real PostgreSQL lock')
  async function ordered(first,second,expected,{commit=true}={}) {
    await begin(a)
    await q(a,first)
    const blocked=pending(b,second)
    await waitB()
    await finish(a,commit)
    assert.equal((await blocked).state,expected)
  }

  await q(a,register(16),'PT404')
  await q(a,register(1,media(1),false),'PT409')
  await q(a,register(1))
  await q(a,register(1,media(1),false))
  await q(a,register(1,media(1),true,'changed'),'PT409')
  await q(a,register(2,media(1)),'23514')
  await q(a,'update jnq_media_private.registry set object_version = \'forged\';','42501')
  await q(a,'delete from jnq_media_private.registry;','42501')
  assert.equal(JSON.parse(await q(a,lookup(1))).publiclyReferenced,false)
  const row = JSON.parse(await q(a,save(1,null,attach(media(1)),[entry(media(1))])))
  assert.deepEqual(Object.keys(row).sort(),[...SPOT_FIELDS].sort())
  assert.ok(row.updated_at)
  await q(a,save(1,null,{name:'stale'},[entry(media(1))]),'PT409')
  await q(a,save(1,row.updated_at,{name:'omitted snapshot'}),'PT409')
  const hidden=JSON.parse(await q(a,withdraw(1,row.updated_at)))
  assert.equal(hidden.publication_status,'hidden')
  assert.equal(JSON.parse(await q(a,lookup(1))).publiclyReferenced,false)
  await q(a,save(1,hidden.updated_at,{publication_status:'published'},[entry(media(1))]))
  assert.equal(JSON.parse(await q(a,lookup(1))).publiclyReferenced,true)
  await q(a,revoke(1))
  await q(a,revoke(1))
  await q(a,"update jnq_media_private.registry set revoked_at = null where spot_id = 1;",'PT409')
  assert.equal(await q(a,lookup(1)),'')
  await q(a,register(1),'PT409')
  assert.equal(await q(a,"select publication_status from public.locations where id = 1;"),'hidden')

  await ordered(save(2,null,{name:'first'}),save(2,null,{name:'second'}),'PT409')
  await q(a,register(3))
  await ordered(save(3,null,attach(media(3)),[entry(media(3))]),revoke(3),'00000')
  assert.equal(await q(a,"select publication_status from public.locations where id = 3;"),'hidden')
  await q(a,register(4))
  await ordered(revoke(4),save(4,null,{...attach(media(4)),publication_status:'published'},[entry(media(4))]),'PT409')
  await ordered(remove(5,null),register(5),'PT404')
  await ordered(register(6),remove(6,null),'00000')
  assert.equal(await q(a,'select count(*) from jnq_media_private.registry where spot_id = 6;'),'0')
  await q(a,register(7))
  await q(a,remove(7,null))
  assert.equal(await q(monitor,'select count(*) from public.synthetic_location_children where location_id = 7;'),'0')
  await ordered(register(8),register(8,media(8),false),'PT409',{commit:false})
  await ordered(register(9),register(9,media(9),false),'00000')
  assert.equal(await q(a,'select count(*) from jnq_media_private.registry where spot_id = 9;'),'1')

  await q(a,register(10))
  await q(a,register(10,media(10,2)))
  await q(a,save(10,null,{images:['/'+media(10),'/'+media(10,2)]},[entry(media(10)),entry(media(10))]),'PT409')
  await q(a,save(10,null,attach(media(10)),[{...entry(media(10)),receipt_version:'replaced'}]),'PT409')
  const spot10=JSON.parse(await q(a,save(10,null,attach(media(10)),[entry(media(10))])))
  await q(a,"set jnq.test_fault = 'skip';")
  await q(a,withdraw(10,spot10.updated_at),'PT503')
  await q(a,remove(10,spot10.updated_at),'PT503')
  await q(a,revoke(10),'PT503')
  assert.equal(JSON.parse(await q(a,lookup(10))).publiclyReferenced,true)
  await q(a,"set jnq.test_fault = 'rewrite';")
  await q(a,save(10,spot10.updated_at,{name:'must roll back'},[entry(media(10))]),'PT503')
  await q(a,"set jnq.test_fault = 'after_rewrite';")
  await q(a,save(10,spot10.updated_at,{name:'after-trigger rewrite must roll back'},[entry(media(10))]),'PT503')
  await q(a,'reset jnq.test_fault;')
  assert.equal(await q(a,"select name from public.locations where id = 10;"),'Synthetic Spot 10')
  await q(a,withdraw(10,spot10.updated_at))

  const galleryKeys=Array.from({length:30},(_,index)=>media(14,index+1))
  for(const key of galleryKeys) await q(a,register(14,key))
  let galleryVersion=null
  for(const count of [1,5,17,30]) {
    const keys=galleryKeys.slice(0,count)
    const patch={image_url:'/'+keys[0],images:keys.map(key=>'/'+key)}
    for(const phase of ['first','unchanged']) {
      const saved=JSON.parse(await q(a,save(14,galleryVersion,patch,keys.map(entry))))
      assert.deepEqual(saved.images,patch.images,phase)
      assert.notEqual(saved.updated_at,galleryVersion)
      galleryVersion=saved.updated_at
    }
  }
  await q(a,save(15,null,{images:['/legacy.jpg']}),'PT400')
  await q(a,save(15,null,attach(media(15)),[entry(media(15))]),'PT409')
  assert.equal(await q(a,lookup(15)),'')

  await begin(a)
  await q(a,save(11,null,{name:'held'}))
  await q(b,"set lock_timeout = '250ms';")
  await q(b,save(11,null,{name:'must time out'}),'55P03')
  await finish(a,false)
  await q(b,'reset lock_timeout;')
  await q(b,save(11,null,{name:'recovered'}))

  // Negative control. Two calls in one transaction reverse Spot order.
  await begin(a); await begin(b)
  await q(a,save(12,null,{name:'A holds 12'}))
  await q(b,save(13,null,{name:'B holds 13'}))
  const bWait=pending(b,save(12,null,{name:'B waits on 12'}))
  await waitB()
  const aWait=pending(a,save(13,null,{name:'A waits on 13'}))
  const settle=async(client,result)=>{
    const outcome=await result
    await finish(client,false)
    return outcome.state
  }
  assert.deepEqual((await Promise.all([settle(a,aWait),settle(b,bWait)])).sort(),['00000','40P01'])
  await q(a,save(12,null,{name:'usable after deadlock'}))
  console.log(JSON.stringify({status:'PASS_LOCAL_POSTGRES',serverVersionNum:version,
    covered:['six RPCs','real role ACL','inherited default ACL rollback','read committed lock waits',
      'save/revoke/delete/registration','null and stale versions','timeout','deadlock recovery','trigger suppression rollback']}))
} finally {
  for (const child of sessions) child.stdin.end()
  if (/^[a-f0-9]{64}$/.test(container || '')) {
    await docker('rm','-f',container).catch(error=>{
      if(!String(error.stderr).includes('No such container'))throw error
    })
  }
}
