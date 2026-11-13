// This program accepts an explicit owner-only connection file. Credentials enter
// a disposable libpq password file through stdin and never appear in arguments.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'
import { FORMAL_REF } from './formal-read-source.mjs'

const run = promisify(execFile)
const powershell = 'pwsh.exe'
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
  await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', acl], {
    env: { ...process.env, JNQ_CUTOVER_ACL_TARGET: file }, windowsHide: true, timeout: 10000,
  }).catch(() => { throw Error('OWNER_ONLY_BACKUP_OR_CREDENTIAL_ACL_REQUIRED') })
}

function connection(text, dpapi = false) {
  const input = text.trim().replace(/^\uFEFF/, '')
  let config
  if (input.startsWith('postgresql://') || input.startsWith('postgres://')) {
    const url = new URL(input)
    config = { host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
  } else config = JSON.parse(input)
  const { host, user, password, port = 5432, database = 'postgres' } = config
  const caFile = process.env.JNQ_FORMAL_PG_CA_FILE || config.caFile
  const direct = host === `db.${FORMAL_REF}.supabase.co` && /^[a-z_][a-z0-9_]*$/.test(user)
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) &&
    new RegExp(`^[a-z_][a-z0-9_]*\\.${FORMAL_REF}$`).test(user)
  assert.ok((direct || pooler) && database === 'postgres' && port === 5432, 'FORMAL_DIRECT_OR_SESSION_POOLER_REQUIRED')
  if (dpapi) {
    assert.equal(config.projectRef, FORMAL_REF, 'FORMAL_PROJECT_REF_MISMATCH')
    assert.equal(config.method, pooler ? 'session_pooler' : 'direct', 'FORMAL_CONNECTION_METHOD_MISMATCH')
    assert.ok(['require', 'verify-full'].includes(config.sslmode) && !Object.hasOwn(config, 'password'), 'FORMAL_DPAPI_CONFIG_INVALID')
  } else assert.ok(typeof password === 'string' && password.length > 0 && !/[\u0000\r\n]/.test(password) && !/^\[.*\]$/.test(password),
    'DATABASE_PASSWORD_MISSING')
  if (caFile !== undefined) assert.ok(typeof caFile === 'string' && path.isAbsolute(caFile) && !caFile.includes(','))
  return { host, user, password, port, database, pooler, role: user.split('.')[0], caFile, passwordFile: config.passwordFile }
}

async function checkedFile(file, size) {
  assert.ok(file && path.isAbsolute(file) && await realpath(file) === file, 'INVALID_CONNECT_FILE')
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= size, 'INVALID_CONNECT_FILE')
  await assertPrivate(file)
}

async function loadConnection() {
  if (process.env.JNQ_FORMAL_PG_DPAPI_DIR) {
    const directory = path.resolve(process.env.JNQ_FORMAL_PG_DPAPI_DIR)
    assert.equal(await realpath(directory), directory, 'DPAPI_DIRECTORY_MUST_BE_REAL')
    const file = path.join(directory, 'production-db.json')
    const encrypted = path.join(directory, 'production-db-password.dpapi')
    await Promise.all([checkedFile(file, 4096), checkedFile(encrypted, 8192)])
    const cfg = connection(await readFile(file, 'utf8'), true)
    assert.equal(path.resolve(directory, cfg.passwordFile), encrypted, 'UNEXPECTED_DPAPI_PASSWORD_FILE')
    return { ...cfg, encrypted }
  }
  const file = process.env.JNQ_FORMAL_PG_CONNECTION_FILE
  assert.ok(file, 'CONNECT_FILE_REQUIRED')
  await checkedFile(file, 4096)
  return connection(await readFile(file, 'utf8'))
}

async function passwordInput(cfg) {
  let secret
  if (cfg.encrypted) {
    const script = String.raw`
      $ErrorActionPreference = 'Stop'
      $encrypted = [IO.File]::ReadAllText($env:JNQ_CUTOVER_DPAPI_FILE).Trim()
      if ($encrypted -notmatch '^01000000[0-9a-f]+$') { exit 3 }
      $secure = ConvertTo-SecureString -String $encrypted
      $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try {
        $bytes = [Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
        try {
          $stream = [Console]::OpenStandardOutput()
          $stream.Write($bytes, 0, $bytes.Length)
          $stream.Flush()
        } finally { [Array]::Clear($bytes, 0, $bytes.Length) }
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
      }`
    const result = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, JNQ_CUTOVER_DPAPI_FILE: cfg.encrypted }, encoding: 'buffer', windowsHide: true,
      timeout: 10000, maxBuffer: 8192,
    }).catch(() => { throw Error('DPAPI_DECRYPTION_FAILED_FOR_CURRENT_WINDOWS_USER') })
    secret = result.stdout
  } else secret = Buffer.from(cfg.password)
  try {
    assert.ok(Buffer.isBuffer(secret) && secret.length > 0 && secret.length <= 4096 &&
      ![0, 10, 13].some(value => secret.includes(value)), 'DPAPI_PASSWORD_ENCODING_INVALID')
    const prefix = Buffer.from([cfg.host, cfg.port, cfg.database, cfg.user].join(':') + ':')
    const escapes = secret.reduce((count, value) => count + Number(value === 58 || value === 92), 0)
    const result = Buffer.alloc(prefix.length + secret.length + escapes + 1)
    prefix.copy(result)
    let offset = prefix.length
    for (const value of secret) {
      if (value === 58 || value === 92) result[offset++] = 92
      result[offset++] = value
    }
    result[offset] = 10
    return result
  } finally { secret.fill(0) }
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

function docker(args, stdin, label, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', capture ? 'pipe' : 'ignore', 'pipe'] })
    let tail = ''
    let output = ''
    child.stdout?.on('data', chunk => { output = (output + chunk).slice(-16000) })
    child.stderr.on('data', chunk => { tail = (tail + chunk).slice(-4000) })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    child.on('error', () => reject(Error(label + '_ENGINE_FAILED')))
    child.on('close', code => {
      if (code === 0) return resolve(output)
      const category = /certificate verify|SSL error|certificate authority/i.test(tail) ? 'TLS_VERIFY_FAILED' :
        /password authentication|no password supplied/i.test(tail) ? 'AUTH_FAILED' :
        /permission denied|row-level security/i.test(tail) ? 'INSUFFICIENT_READ_PERMISSIONS' :
        /extension .*not available|could not open extension/i.test(tail) ? 'RESTORE_EXTENSION_UNAVAILABLE' :
        /timeout expired|connection timed out/i.test(tail) ? 'CONNECT_TIMEOUT' : 'FAILED'
      const stage = [...tail.matchAll(/^JNQ_RESTORE_PHASE:([A-Z_]+)$/gm)].at(-1)?.[1]
      const object = /(?:permission denied for (?:table|schema|relation) |(?:schema|relation|role|extension) ")([a-z0-9_.]+)(?:" (?:does not exist|already exists|is not available)|[\r\n])/i.exec(tail)?.[1]
      reject(Error([label, stage, category, stage && object?.toUpperCase().replaceAll('.', '_')].filter(Boolean).join('_')))
    })
  })
}

const mount = (from, to, readOnly = true) => ['--mount', `type=bind,src=${from},dst=${to}${readOnly ? ',readonly' : ''}`]
const inventory = mount(inventoryPath, '/jnq-inventory.sql')

const proofSql = `select jsonb_build_object('database',current_database(),'role',current_user,'readOnly',current_setting('transaction_read_only'),
  'backendSsl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'serverMajor',current_setting('server_version_num')::int/10000,
  'serverVersion',current_setting('server_version'),
  'extensions',(select jsonb_object_agg(extname,extversion) from pg_extension),
  'requiredReadAccess',has_table_privilege(current_user,'public.locations','SELECT') and has_table_privilege(current_user,'auth.users','SELECT') and
  has_table_privilege(current_user,'auth.identities','SELECT') and has_table_privilege(current_user,'storage.objects','SELECT') and
  has_table_privilege(current_user,'storage.buckets','SELECT'));`
const setupClient = String.raw`
umask 077
cat >/tmp/jnq.pgpass
export PGPASSFILE=/tmp/jnq.pgpass
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=10000'`

async function remoteClient(cfg, args, script, label, capture = false) {
  const image = await dockerImage()
  if (cfg.caFile) {
    const cert = await lstat(cfg.caFile)
    assert.ok(cert.isFile() && !cert.isSymbolicLink() && cert.size <= 256 * 1024, 'DATABASE_CA_FILE_INVALID')
    const pem = await readFile(cfg.caFile, 'utf8')
    assert.ok(pem.includes('-----BEGIN CERTIFICATE-----') && !pem.includes('PRIVATE KEY'), 'DATABASE_CA_FILE_INVALID')
  }
  const pg = { PGHOST: cfg.host, PGPORT: cfg.port, PGUSER: cfg.user, PGDATABASE: cfg.database,
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: cfg.caFile ? '/jnq-ca.pem' : 'system', PGCONNECT_TIMEOUT: 12, JNQ_EXPECTED_ROLE: cfg.role }
  const pass = await passwordInput(cfg)
  try {
    return await docker(['run', '--rm', '-i', '--pull', 'never', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      ...args, ...(cfg.caFile ? mount(cfg.caFile, '/jnq-ca.pem') : []),
      ...Object.entries(pg).flatMap(([key, value]) => ['-e', key + '=' + value]),
      '--entrypoint', 'sh', image, '-ceu', setupClient + '\n' + script], pass, label, capture)
  } finally { pass.fill(0) }
}

function verifyProof(cfg, proof) {
  assert.ok(proof.database === cfg.database && proof.role === cfg.role, 'FORMAL_DATABASE_OR_ROLE_MISMATCH')
  assert.equal(proof.readOnly, 'on', 'FORMAL_READ_ONLY_TRANSACTION_NOT_ENFORCED')
  assert.ok(proof.requiredReadAccess, 'FORMAL_REQUIRED_TABLE_READ_PERMISSIONS_MISSING')
  assert.ok(cfg.pooler || proof.backendSsl, 'FORMAL_DIRECT_BACKEND_TLS_NOT_OBSERVED')
}

async function probe() {
  const cfg = await loadConnection()
  const proof = JSON.parse(await remoteClient(cfg, [],
    `psql -X -w -Aqt -v ON_ERROR_STOP=1 <<'SQL'\nbegin read only;\n${proofSql}\nrollback;\nSQL`,
    'FORMAL_PG_PROBE', true))
  verifyProof(cfg, proof)
  return { projectRef: FORMAL_REF, connection: cfg.pooler ? 'session-pooler' : 'direct', tlsMode: 'verify-full',
    readOnly: true, requiredReadAccess: true, serverVersion: proof.serverVersion, extensions: proof.extensions }
}

async function backup() {
  const cfg = await loadConnection()
  const out = path.join(root, 'postgres-logical-' + stamp())
  await mkdir(out)
  await assertPrivate(out)
  const script = String.raw`
psql -X -w -Aqt -v ON_ERROR_STOP=1 <<'SQL' > /backup/connection-proof.json
begin read only;
${proofSql}
rollback;
SQL
test "$(psql -X -w -Aqt -v ON_ERROR_STOP=1 -c "begin read only; select current_user = '$JNQ_EXPECTED_ROLE' and current_database()='postgres' and current_setting('transaction_read_only')='on' and has_table_privilege(current_user,'public.locations','SELECT') and has_table_privilege(current_user,'auth.users','SELECT') and has_table_privilege(current_user,'auth.identities','SELECT') and has_table_privilege(current_user,'storage.objects','SELECT') and has_table_privilege(current_user,'storage.buckets','SELECT'); rollback;")" = t
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
  await remoteClient(cfg, [...mount(out, '/backup', false), ...inventory], script, 'FORMAL_PG_DUMP')
  const proof = await json(path.join(out, 'connection-proof.json'))
  verifyProof(cfg, proof)
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
echo JNQ_RESTORE_PHASE:READ_ARCHIVE >&2
mkdir -m 0700 /tmp/jnq-input
cp /backup/formal.dump /tmp/jnq-input/
# Hosted grants name supabase_admin, the bootstrap superuser. Seed that
# exact identity with initdb and retain its ALTER ROLE and GRANTED BY SQL.
test "$(grep -cx 'CREATE ROLE supabase_admin;' /backup/roles.sql)" = 1
sed '/^CREATE ROLE supabase_admin;$/d' /backup/roles.sql > /tmp/jnq-input/roles.sql
chmod 600 /tmp/jnq-input/roles.sql
chown postgres:postgres /tmp/jnq-input /tmp/jnq-input/formal.dump /tmp/jnq-input/roles.sql
exec gosu postgres sh -eu <<'RESTORE'
export PGHOST=/tmp PGUSER=supabase_admin PGDATA=/tmp/pgdata
echo JNQ_RESTORE_PHASE:START_POSTGRES >&2
initdb --no-sync -A trust -U "$PGUSER" -D "$PGDATA" >/dev/null
pg_ctl -D "$PGDATA" -o "-k /tmp -c listen_addresses='' -c shared_preload_libraries=pg_stat_statements,pg_cron,pg_net -c cron.database_name=jnq_recovered -c cron.launch_active_jobs=off" -w start >/dev/null
trap 'pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null' EXIT
echo JNQ_RESTORE_PHASE:LOAD_ROLES >&2
psql -X -v ON_ERROR_STOP=1 -d postgres -f /tmp/jnq-input/roles.sql >/dev/null
echo JNQ_RESTORE_PHASE:LOAD_ARCHIVE >&2
createdb --template=template0 jnq_recovered
if pg_restore --list /tmp/jnq-input/formal.dump | grep -Eq ' SCHEMA - public '; then
  psql -X -v ON_ERROR_STOP=1 -d jnq_recovered -c 'drop schema public' >/dev/null
fi
pg_restore --exit-on-error --single-transaction --dbname=jnq_recovered /tmp/jnq-input/formal.dump
echo JNQ_RESTORE_PHASE:INVENTORY >&2
psql -X -Aqt -v ON_ERROR_STOP=1 -d jnq_recovered -c 'set search_path to public, extensions' -f /jnq-inventory.sql > /result/restore-inventory.json
RESTORE`
  await docker(['run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--user', 'root',
    '--security-opt', 'no-new-privileges',
    '--tmpfs', '/tmp:rw,nosuid,size=4g', ...mount(directory, '/backup'), ...mount(output, '/result', false), ...inventory,
    '--entrypoint', 'sh', image, '-ceu', script], '', 'ISOLATED_PG_RESTORE')
  const [before, after] = await Promise.all([json(path.join(directory, 'source-inventory.json')), json(path.join(output, 'restore-inventory.json'))])
  before.authorityStorageKeys.sort()
  after.authorityStorageKeys.sort()
  assert.ok(isDeepStrictEqual(after, before), 'RESTORE_CATALOG_OR_DATA_COUNTS_DIFFER')
  const authority = await json(path.join(root, 'authority-backup/manifest.json'))
  for (const name of ['notes', 'guides']) {
    const key = '_system/' + name + '-latest.webp'
    const target = (await readFile(path.join(root, 'authority-backup/supabase-storage', key), 'utf8')).trim()
    assert.ok(authority.files['supabase-storage/' + target] && after.authorityStorageKeys.includes(key) &&
      after.authorityStorageKeys.includes(target), 'RESTORED_AUTHORITY_POINTER_TARGET_MISSING')
  }
  const result = { restored: true, verifiedAt: new Date().toISOString(), sourceBackup: name,
    archiveSha256: manifest.files['formal.dump'].sha256, image, tables: Object.keys(after.tables).length, policies: after.policies.length,
    authUsers: after.tables['auth.users'].rows, authIdentities: after.tables['auth.identities'].rows,
    spots: after.tables['public.locations'].rows, storageObjects: after.tables['storage.objects'].rows,
    roles: Object.keys(after.roles).length, extensionVersionsMatch: true,
    storageAuthorityTargetsVerified: true, network: 'none', scheduledJobsDisabled: true }
  await writeFile(path.join(output, 'restore-result.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
  return { ...result, directory: output }
}

// Reuse the reviewed DPAPI/TLS/read-only transport for a narrow private
// configuration snapshot; no password/cron command is returned to stdout.
export async function formalPrivateReadSnapshot({ directory, filename, sql }) {
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(root) === root)
  assert.ok(path.isAbsolute(directory) && directory.startsWith(root + path.sep))
  assert.match(filename, /^[a-z0-9-]+\.json$/)
  await mkdir(directory, { recursive: true }); await assertPrivate(directory)
  const cfg = await loadConnection()
  const result = path.join(directory, filename)
  try { await lstat(result); throw Error('PRIVATE_SNAPSHOT_ALREADY_EXISTS') } catch (error) { if (error.code !== 'ENOENT') throw error }
  await remoteClient(cfg, mount(directory, '/backup', false),
    `psql -X -w -Aqt -v ON_ERROR_STOP=1 <<'SQL' > /backup/${filename}\nbegin isolation level repeatable read read only;\n${sql}\nrollback;\nSQL`, 'FORMAL_PRIVATE_READ_SNAPSHOT')
  const value = await json(result)
  assert.equal(value.identity.database, cfg.database)
  assert.equal(value.identity.role, cfg.role)
  return { path: result, ...(await sha(result)) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  assert.equal(process.argv.length, 4)
  assert.ok(['--probe', '--backup', '--restore'].includes(mode) && ref === FORMAL_REF)
  if (mode !== '--restore') assert.ok(process.env.JNQ_FORMAL_PG_DPAPI_DIR || process.env.JNQ_FORMAL_PG_CONNECTION_FILE, 'CONNECT_FILE_REQUIRED')
  assert.ok(process.env.JNQ_RECOVERY_WORKSPACE && await realpath(root) === root)
  await assertPrivate(root)
  await json(path.join(root, 'static-backup-result.json'))
  console.log(JSON.stringify(await (mode === '--probe' ? probe() : mode === '--backup' ? backup() : restore())))
} catch (error) {
  const message = String(error.message)
  console.error(/^[A-Z0-9_]+$/.test(message) ? message : 'FORMAL_POSTGRES_OPERATION_FAILED')
  process.exitCode = 1
}
