// This program accepts an explicit owner-only connection file. Credentials enter
// a disposable libpq password file through stdin and never appear in arguments.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { FORMAL_REF } from './formal-read-source.mjs'

const run = promisify(execFile)
const root = path.resolve(process.env.JNQ_RECOVERY_WORKSPACE || '.')
const [mode, ref] = process.argv.slice(2)
const json = file => readFile(file, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, '')))
const fields = ['formal.dump', 'schema.sql', 'roles.sql', 'source-inventory.json', 'connection-proof.json']
const stamp = () => new Date().toISOString().replaceAll(/[:.]/g, '-')
const inventoryPath = path.resolve('scripts/cloudflare/formal-postgres-inventory.sql')

async function sha(file) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length }
  assert.ok(bytes > 0, 'EMPTY_BACKUP_FILE')
  return { bytes, sha256: hash.digest('hex') }
}

async function assertPrivate(file) {
  const acl = String.raw`
    $ErrorActionPreference = 'Stop'
    $a = Get-Acl -LiteralPath $env:JNQ_CUTOVER_ACL_TARGET
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $owner = ([Security.Principal.NTAccount]::new($a.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $me) { exit 3 }
    foreach ($rule in $a.Access) {
      if ($rule.AccessControlType -eq 'Allow') {
        $id = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($id -notin @($me,'S-1-5-18')) { exit 4 }
      }
    }`
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', acl], {
    env: { ...process.env, JNQ_CUTOVER_ACL_TARGET: file }, windowsHide: true, timeout: 10000,
  }).catch(() => { throw Error('OWNER_ONLY_BACKUP_OR_CREDENTIAL_ACL_REQUIRED') })
}

function connection(text) {
  const input = text.trim().replace(/^\uFEFF/, '')
  let config
  if (input.startsWith('postgresql://') || input.startsWith('postgres://')) {
    const url = new URL(input)
    config = { host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
  } else config = JSON.parse(input)
  const { host, user, password, port = 5432, database = 'postgres', caFile } = config
  const direct = host === `db.${FORMAL_REF}.supabase.co` && /^[a-z_][a-z0-9_]*$/.test(user)
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) &&
    new RegExp(`^[a-z_][a-z0-9_]*\\.${FORMAL_REF}$`).test(user)
  assert.ok((direct || pooler) && database === 'postgres' && port === 5432, 'FORMAL_DIRECT_OR_SESSION_POOLER_REQUIRED')
  assert.ok(typeof password === 'string' && password.length > 0 && !/[\u0000\r\n]/.test(password) && !/^\[.*\]$/.test(password),
    'DATABASE_PASSWORD_MISSING')
  if (caFile !== undefined) assert.ok(typeof caFile === 'string' && path.isAbsolute(caFile) && !caFile.includes(','))
  return { host, user, password, port, database, pooler, role: user.split('.')[0], caFile }
}

async function dockerImage() {
  const context = (await run('docker', ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'])).stdout.trim()
  assert.match(context, /^npipe:\/\//, 'LOCAL_DOCKER_ENGINE_REQUIRED')
  const image = process.env.JNQ_RESTORE_POSTGRES_IMAGE || 'postgres:17'
  assert.ok(image === 'postgres:17' || /^sha256:[a-f0-9]{64}$/.test(image))
  const result = (await run('docker', ['image', 'inspect', image, '--format', '{{.Id}} {{.Os}}'])).stdout.trim()
  const [digest, os] = result.split(' ')
  assert.match(digest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(os, 'linux')
  return digest
}

function docker(args, stdin, label) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    let tail = ''
    child.stderr.on('data', chunk => { tail = (tail + chunk).slice(-4000) })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    child.on('error', () => reject(Error(label + '_ENGINE_FAILED')))
    child.on('close', code => {
      if (code === 0) return resolve()
      const category = /certificate verify|SSL error|certificate authority/i.test(tail) ? 'TLS_VERIFY_FAILED' :
        /password authentication|no password supplied/i.test(tail) ? 'AUTH_FAILED' :
        /permission denied|row-level security/i.test(tail) ? 'INSUFFICIENT_READ_PERMISSIONS' :
        /extension .*not available|could not open extension/i.test(tail) ? 'RESTORE_EXTENSION_UNAVAILABLE' : 'FAILED'
      reject(Error(label + '_' + category))
    })
  })
}

const mount = (from, to, readOnly = true) => ['--mount', `type=bind,src=${from},dst=${to}${readOnly ? ',readonly' : ''}`]
const inventory = mount(inventoryPath, '/jnq-inventory.sql')

async function backup() {
  const file = process.env.JNQ_FORMAL_PG_CONNECTION_FILE
  assert.ok(file && path.isAbsolute(file), 'CONNECT_FILE_REQUIRED')
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4096, 'INVALID_CONNECT_FILE')
  await assertPrivate(file)
  let cfg
  try { cfg = connection(await readFile(file, 'utf8')) }
  catch { throw Error('FORMAL_DIRECT_OR_SESSION_POOLER_CONNECTION_INVALID') }
  const image = await dockerImage()
  if (cfg.caFile) {
    const cert = await lstat(cfg.caFile)
    assert.ok(cert.isFile() && !cert.isSymbolicLink() && cert.size <= 256 * 1024, 'DATABASE_CA_FILE_INVALID')
    const pem = await readFile(cfg.caFile, 'utf8')
    assert.ok(pem.includes('-----BEGIN CERTIFICATE-----') && !pem.includes('PRIVATE KEY'), 'DATABASE_CA_FILE_INVALID')
  }
  const out = path.join(root, 'postgres-logical-' + stamp())
  await mkdir(out)
  await assertPrivate(out)
  const pgpass = [cfg.host, cfg.port, cfg.database, cfg.user, cfg.password].map(value =>
    String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:')).join(':') + '\n'
  const script = String.raw`
umask 077
cat >/tmp/jnq.pgpass
export PGPASSFILE=/tmp/jnq.pgpass
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=10000'
psql -X -w -At -v ON_ERROR_STOP=1 <<'SQL' > /backup/connection-proof.json
select jsonb_build_object('database',current_database(),'role',current_user,'readOnly',current_setting('transaction_read_only'),
  'backendSsl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'serverMajor',current_setting('server_version_num')::int/10000,
  'requiredReadAccess',has_table_privilege(current_user,'public.locations','SELECT') and has_table_privilege(current_user,'auth.users','SELECT') and
  has_table_privilege(current_user,'auth.identities','SELECT') and has_table_privilege(current_user,'storage.objects','SELECT') and
  has_table_privilege(current_user,'storage.buckets','SELECT'));
SQL
test "$(psql -X -w -At -v ON_ERROR_STOP=1 -c "select current_user = '$JNQ_EXPECTED_ROLE' and current_database()='postgres' and current_setting('transaction_read_only')='on' and has_table_privilege(current_user,'public.locations','SELECT') and has_table_privilege(current_user,'auth.users','SELECT') and has_table_privilege(current_user,'auth.identities','SELECT') and has_table_privilege(current_user,'storage.objects','SELECT') and has_table_privilege(current_user,'storage.buckets','SELECT')")" = t
cat >/tmp/jnq-dump.sh <<'SH'
set -eu
pg_dump -w -Fc --lock-wait-timeout=10000 --snapshot="$(cat /tmp/jnq.snapshot)" --file=/backup/formal.dump
pg_dumpall -w --roles-only --no-role-passwords --file=/backup/roles.sql
pg_restore --schema-only --file=/backup/schema.sql /backup/formal.dump
touch /tmp/jnq-complete
SH
psql -X -w -Aqt -v ON_ERROR_STOP=1 <<'SQL'
begin isolation level repeatable read read only;
\o /tmp/jnq.snapshot
select pg_export_snapshot();
\o /backup/source-inventory.json
\i /jnq-inventory.sql
\o
\! sh /tmp/jnq-dump.sh
rollback;
SQL
test -f /tmp/jnq-complete`
  const pg = { PGHOST: cfg.host, PGPORT: cfg.port, PGUSER: cfg.user, PGDATABASE: cfg.database,
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: cfg.caFile ? '/jnq-ca.pem' : 'system', PGCONNECT_TIMEOUT: 12, JNQ_EXPECTED_ROLE: cfg.role }
  await docker(['run', '--rm', '-i', '--pull', 'never', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    ...mount(out, '/backup', false), ...inventory, ...(cfg.caFile ? mount(cfg.caFile, '/jnq-ca.pem') : []),
    ...Object.entries(pg).flatMap(([key, value]) => ['-e', key + '=' + value]),
    '--entrypoint', 'sh', image, '-ceu', script], pgpass, 'FORMAL_PG_DUMP')
  const proof = await json(path.join(out, 'connection-proof.json'))
  assert.ok(proof.database === cfg.database && proof.role === cfg.role && proof.readOnly === 'on' &&
    proof.requiredReadAccess && (cfg.pooler || proof.backendSsl), 'FORMAL_CONNECTION_PROOF_FAILED')
  const details = { projectRef: FORMAL_REF, capturedAt: new Date().toISOString(), tlsMode: 'verify-full',
    connection: cfg.pooler ? 'session-pooler' : 'direct', serverMajor: proof.serverMajor,
    files: Object.fromEntries(await Promise.all(fields.map(async name => [name, await sha(path.join(out, name))]))), offMachine: false }
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(details, null, 2), { flag: 'wx' })
  return { backup: true, directory: out, serverMajor: proof.serverMajor, hashedFiles: fields.length, offMachine: false }
}

async function restore() {
  const name = process.env.JNQ_FORMAL_PG_BACKUP_NAME || ''
  assert.match(name, /^postgres-logical-[0-9TZ-]+$/)
  const directory = path.join(root, name)
  assert.equal(await realpath(directory), directory)
  const manifest = await json(path.join(directory, 'manifest.json'))
  assert.equal(manifest.projectRef, FORMAL_REF)
  for (const name of fields) assert.deepEqual(await sha(path.join(directory, name)), manifest.files[name], 'DATABASE_BACKUP_CHANGED')
  const image = await dockerImage()
  const output = path.join(root, 'postgres-restore-' + stamp())
  await mkdir(output)
  await assertPrivate(output)
  const script = String.raw`
export PGHOST=/tmp PGUSER=jnq_cutover_restore PGDATA=/tmp/pgdata
initdb --no-sync -A trust -U "$PGUSER" -D "$PGDATA" >/dev/null
pg_ctl -D "$PGDATA" -o "-k /tmp -c listen_addresses=''" -w start >/dev/null
trap 'pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null' EXIT
psql -X -v ON_ERROR_STOP=1 -d postgres -f /backup/roles.sql >/dev/null
createdb --template=template0 jnq_recovered
if pg_restore --list /backup/formal.dump | grep -Eq ' SCHEMA - public '; then
  psql -X -v ON_ERROR_STOP=1 -d jnq_recovered -c 'drop schema public' >/dev/null
fi
pg_restore --exit-on-error --single-transaction --dbname=jnq_recovered /backup/formal.dump
psql -X -Aqt -v ON_ERROR_STOP=1 -d jnq_recovered -f /jnq-inventory.sql > /result/restore-inventory.json`
  await docker(['run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--user', 'postgres',
    '--tmpfs', '/tmp:rw,nosuid,size=4g', ...mount(directory, '/backup'), ...mount(output, '/result', false), ...inventory,
    '--entrypoint', 'sh', image, '-ceu', script], '', 'ISOLATED_PG_RESTORE')
  const [before, after] = await Promise.all([json(path.join(directory, 'source-inventory.json')), json(path.join(output, 'restore-inventory.json'))])
  assert.deepEqual(after, before, 'RESTORE_CATALOG_OR_DATA_COUNTS_DIFFER')
  const authority = await json(path.join(root, 'authority-backup/manifest.json'))
  for (const name of ['notes', 'guides']) {
    const key = '_system/' + name + '-latest.webp'
    const target = (await readFile(path.join(root, 'authority-backup/supabase-storage', key), 'utf8')).trim()
    assert.ok(authority.files['supabase-storage/' + target] && after.authorityStorageKeys.includes(key) &&
      after.authorityStorageKeys.includes(target), 'RESTORED_AUTHORITY_POINTER_TARGET_MISSING')
  }
  return { restored: true, tables: Object.keys(after.tables).length, policies: after.policies.length,
    authUsers: after.tables['auth.users'].rows, authIdentities: after.tables['auth.identities'].rows,
    roles: Object.keys(after.roles).length, storageAuthorityTargetsVerified: true, network: 'none' }
}

try {
  assert.equal(process.argv.length, 4)
  assert.ok(['--backup', '--restore'].includes(mode) && ref === FORMAL_REF)
  if (mode === '--backup') assert.ok(process.env.JNQ_FORMAL_PG_CONNECTION_FILE, 'CONNECT_FILE_REQUIRED')
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(root) === root)
  await assertPrivate(root)
  await json(path.join(root, 'static-backup-result.json'))
  console.log(JSON.stringify(await (mode === '--backup' ? backup() : restore())))
} catch (error) {
  const message = String(error.message)
  console.error(/^[A-Z0-9_]+$/.test(message) ? message : 'FORMAL_POSTGRES_OPERATION_FAILED')
  process.exitCode = 1
}
