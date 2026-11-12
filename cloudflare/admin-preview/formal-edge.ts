import { createClient } from 'npm:@supabase/supabase-js@2.93.3'
import { SPOT_FIELDS } from '../spot-loop/spot-contract.mjs'
import { createFormalAdminRead, FORMAL_PROJECT, FORMAL_STORAGE_BUCKET } from './formal-admin-read.mjs'

const origin = `https://${FORMAL_PROJECT}.supabase.co`
const readEnv = (name: string) => Deno.env.get(name) || ''
const anonKey = readEnv('SUPABASE_ANON_KEY')
const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
if (readEnv('SUPABASE_URL') !== origin || !anonKey || !serviceKey) throw Error('FORMAL_PROJECT_SCOPE_INVALID')
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
    ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  }),
} }
const auth = createClient(origin, anonKey, options).auth
const db = createClient(origin, serviceKey, options)
const bucket = db.storage.from(FORMAL_STORAGE_BUCKET)
const ids = (name: string) => readEnv(name).split(',').map(value => value.trim()).filter(Boolean)

async function download(key: string) {
  const { data, error } = await bucket.download(key, {}, { cache: 'no-store' })
  if (error || !data || data.size > 8 * 1024 * 1024) throw Error('FORMAL_AUTHORITY_NOT_READABLE')
  return data.text()
}

async function collection(name: 'notes' | 'guides') {
  const pointerKey = `_system/${name}-latest.webp`
  const pointer = (await download(pointerKey)).trim()
  if (!new RegExp(`^_system/${name}/[0-9]{13}(?:-[a-f0-9-]{36})?\\.webp$`).test(pointer)) throw Error('FORMAL_AUTHORITY_POINTER')
  const rows = JSON.parse(await download(pointer))
  if (!Array.isArray(rows) || (await download(pointerKey)).trim() !== pointer) throw Error('FORMAL_AUTHORITY_CHANGED')
  return rows
}

async function load(route: string, { id, slug }: { id: number | null, slug: string | null }) {
  if (route === '/admin/notes') return { notes: await collection('notes') }
  if (route === '/admin/guides') return { guides: await collection('guides') }
  if (route === '/admin/location-slugs') {
    if (id === null) return null
    const record = await db.from('locations').select('id').eq('id', id).maybeSingle()
    if (record.error) throw record.error
    if (!record.data) return null
    const map = JSON.parse(await download('_system/location-slugs.webp'))
    return { slug: typeof map[String(id)] === 'string' ? map[String(id)] : '' }
  }
  if (route === '/admin/regions') {
    const { data, error } = await db.from('regions').select('id,name,name_cn,country,parent_id').order('name').limit(1000)
    if (error) throw error
    return { data }
  }
  if (slug !== null) return null
  const fields = SPOT_FIELDS.join(',') + ',regions:region_id(id,name,name_cn,country,parent_id)'
  if (id !== null) {
    const { data, error } = await db.from('locations').select(fields).eq('id', id).maybeSingle()
    if (error) throw error
    return data && { data, hasMore: false }
  }
  const all: unknown[] = []
  for (let offset = 0; offset < 10000; offset += 200) {
    const { data, error } = await db.from('locations').select(fields).order('id', { ascending: false }).range(offset, offset + 199)
    if (error || !data) throw Error('FORMAL_LOCATIONS_NOT_READABLE')
    all.push(...data)
    if (data.length < 200) return { data: all, hasMore: false }
  }
  throw Error('FORMAL_LOCATIONS_LIMIT')
}

Deno.serve(createFormalAdminRead({
  projectRef: FORMAL_PROJECT,
  origin: readEnv('JNQ_FORMAL_ADMIN_ORIGIN'),
  editors: ids('JNQ_FORMAL_EDITOR_IDS'),
  publishers: ids('JNQ_FORMAL_PUBLISHER_IDS'),
  async getIdentity(token: string) {
    const { data, error } = await auth.getUser(token)
    return error || data.user?.role !== 'authenticated' || data.user.is_anonymous ? null : data.user.id
  },
  load,
}))
