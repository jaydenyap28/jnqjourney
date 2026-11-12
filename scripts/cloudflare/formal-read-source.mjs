import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { ACCOUNT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { SUPABASE } from './recovery-sources.mjs'

export const FORMAL_REF = 'vrufunuomioczocdsoer'
export const FORMAL_BUCKET = 'jnqjourney-img'
export const FORMAL_STORAGE = 'location-images'
const r2 = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${FORMAL_BUCKET}`
const tables = new Set(['locations', 'regions', 'travel_packages', 'travel_package_options', 'affiliate_links'])
const feedKeys = new Set(['i18n/en/records.json', 'guide-trip-costs.json', 'spots/index.json'])
export const authorityKey = /^_system\/(?:location-slugs\.webp|(?:notes|guides)(?:-latest|\/\d+(?:-[a-f0-9-]{36})?)\.webp)$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function objectKey(key) {
  assert.ok(typeof key === 'string' && key.length > 0 && key.length <= 1024 &&
    !key.includes('\\') && !/[\u0000-\u001f]/.test(key) &&
    key.split('/').every(part => part !== '.' && part !== '..' && part), 'INVALID_OBJECT_KEY')
  return key.split('/').map(encodeURIComponent).join('/')
}

export function validateFormalKey(key) {
  const parts = typeof key === 'string' ? key.split('.') : []
  let claims
  if (parts.length === 3) {
    try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) } catch {}
  }
  assert.ok(claims?.ref === FORMAL_REF && claims.role === 'service_role', 'FORMAL_PROJECT_SERVICE_CREDENTIAL_REQUIRED')
}

async function getFormalKey() {
  const cli = process.env.JNQ_SUPABASE_CLI
  assert.ok(cli, 'EXISTING_SUPABASE_CLI_REQUIRED')
  let result
  try {
    result = await promisify(execFile)(process.execPath,
      [cli, 'projects', 'api-keys', '--project-ref', FORMAL_REF, '--output', 'json'], {
        env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }, windowsHide: true,
        timeout: 30000, maxBuffer: 512 * 1024,
      })
  } catch { throw Error('FORMAL_CLI_AUTH_FAILED') }
  const key = JSON.parse(result.stdout).find(row => row.name === 'service_role')?.api_key
  validateFormalKey(key)
  return key
}

export function formalReadTransport({ key, token, fetcher = fetch }) {
  validateFormalKey(key)
  assert.ok(typeof token === 'string' && token, 'FORMAL_R2_READ_CREDENTIAL_REQUIRED')
  const supabaseHeaders = { apikey: key, Authorization: `Bearer ${key}` }
  const r2Headers = { Authorization: `Bearer ${token}` }
  async function read(label, url, headers, body) {
    const response = await fetcher(url, {
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000),
    })
    assert.ok(response.ok && response.body, `FORMAL_${label}_HTTP_${response.status}`)
    let size = 0
    const chunks = []
    for await (const chunk of response.body) {
      size += chunk.byteLength
      assert.ok(size <= 25 * 1024 * 1024, 'FORMAL_SOURCE_BYTE_LIMIT')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), etag: response.headers.get('etag') }
  }
  async function confirmedOperator(account) {
    assert.ok(typeof account === 'string' && account === account.trim() && account.length <= 254, 'EXPLICIT_OPERATOR_REQUIRED')
    let match
    if (uuid.test(account)) {
      const { bytes } = await read('AUTH_ADMIN', `${SUPABASE}/auth/v1/admin/users/${account}`, supabaseHeaders)
      match = JSON.parse(bytes)
      assert.equal(match.id, account.toLowerCase(), 'FORMAL_AUTH_UUID_MISMATCH')
    } else {
      assert.match(account, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'EXACT_OPERATOR_EMAIL_REQUIRED')
      for (let page = 1; page <= 30; page++) {
        const { bytes } = await read('AUTH_ADMIN', `${SUPABASE}/auth/v1/admin/users?page=${page}&per_page=100`, supabaseHeaders)
        const { users } = JSON.parse(bytes)
        assert.ok(Array.isArray(users))
        for (const user of users) {
          if (typeof user.email !== 'string' || user.email.toLowerCase() !== account.toLowerCase()) continue
          assert.ok(!match, 'FORMAL_OPERATOR_EMAIL_NOT_UNIQUE')
          match = user
        }
        if (users.length < 100) break
        assert.notEqual(page, 30, 'FORMAL_OPERATOR_LOOKUP_LIMIT')
      }
    }
    assert.ok(uuid.test(match?.id || '') && match.role === 'authenticated' && !match.is_anonymous &&
      match.email_confirmed_at && !(Date.parse(match.banned_until) > Date.now()), 'FORMAL_OPERATOR_NOT_ACTIVE')
    return match.id
  }
  return {
    database(resource) {
      const url = new URL(resource, SUPABASE)
      assert.ok(url.origin === SUPABASE && !url.hash && !url.username && !url.password
        && tables.has(url.pathname.split('/').at(-1)) && /^\/rest\/v1\/\w+$/.test(url.pathname), 'FORMAL_DATABASE_READ_SCOPE')
      return read('DATABASE', url, supabaseHeaders)
    },
    storage(key) {
      assert.match(key, authorityKey, 'FORMAL_AUTHORITY_STORAGE_SCOPE')
      return read('STORAGE', `${SUPABASE}/storage/v1/object/authenticated/${FORMAL_STORAGE}/${key}`, supabaseHeaders)
    },
    feed(key) {
      assert.ok(feedKeys.has(key), 'FORMAL_R2_FEED_SCOPE')
      return read('R2', `${r2}/objects/${encodeURIComponent('public-data/' + key)}`, r2Headers)
    },
    async listAuthority(name, offset) {
      assert.ok(['notes', 'guides'].includes(name) && Number.isSafeInteger(offset) && offset >= 0 && offset < 10000)
      const { bytes } = await read('STORAGE_LIST', `${SUPABASE}/storage/v1/object/list/${FORMAL_STORAGE}`, supabaseHeaders, {
        prefix: `_system/${name}`, limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
      })
      return JSON.parse(bytes)
    },
    async verifyOperator(id) {
      assert.match(id, uuid, 'EXPLICIT_OPERATOR_AUTH_ID_REQUIRED')
      await confirmedOperator(id)
      return { activeAuthUser: true, allowlistEnabled: false }
    },
    confirmedOperator,
    async storageConfig() {
      const storage = await read('STORAGE_CONFIG', `${SUPABASE}/storage/v1/bucket/${FORMAL_STORAGE}`, supabaseHeaders)
      const config = JSON.parse(storage.bytes)
      assert.equal(config.id, FORMAL_STORAGE)
      return config
    },
    async authClientConfig() {
      return JSON.parse((await read('AUTH_CONFIG', `${SUPABASE}/auth/v1/settings`, supabaseHeaders)).bytes)
    },
    backupR2Image(key) {
      objectKey(key)
      assert.match(key, /\.(?:png|webp|jpe?g|gif|avif)$/i, 'FORMAL_BACKUP_IMAGE_REQUIRED')
      return read('R2_IMAGE', `${r2}/objects/${encodeURIComponent(key)}`, r2Headers)
    },
    backupStorageImage(key) {
      const encoded = objectKey(key)
      assert.ok(!key.startsWith('_system/'))
      assert.match(key, /\.(?:png|webp|jpe?g|gif|avif)$/i, 'FORMAL_BACKUP_IMAGE_REQUIRED')
      return read('STORAGE_IMAGE', `${SUPABASE}/storage/v1/object/authenticated/${FORMAL_STORAGE}/${encoded}`, supabaseHeaders)
    },
    async r2Config() {
      const endpoint = key => read('R2_CONFIG', r2 + key, r2Headers).then(({ bytes }) => JSON.parse(bytes).result)
      const [bucket, managed, custom] = await Promise.all([endpoint(''), endpoint('/domains/managed'), endpoint('/domains/custom')])
      assert.equal(bucket?.name, FORMAL_BUCKET)
      return { bucket, managed, custom }
    },
  }
}

export async function connectFormalReadSource() {
  const [key, token] = await Promise.all([getFormalKey(), privateWranglerToken()])
  return formalReadTransport({ key, token })
}
