// Shared formal handler. Only explicit release entry points choose capabilities.
import { createClient } from 'npm:@supabase/supabase-js@2.93.3'
import { createFormalPreparedApi } from './formal-api.mjs'
import { createFormalServices } from './formal-services'
import { FORMAL_PRIVATE_SCOPE, FORMAL_RELEASE_GATES } from './formal-runtime.mjs'
import { verifiedFormalIdentity } from './formal-session.mjs'

const env = (name: string) => Deno.env.get(name) || ''
const scope = FORMAL_PRIVATE_SCOPE
const origin = `https://${scope.projectRef}.supabase.co`
if (env('SUPABASE_URL') !== origin) throw Error('FORMAL_PROJECT_MISMATCH')
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) }),
} }
const anonKey = env('SUPABASE_ANON_KEY')
const auth = createClient(origin, anonKey, options).auth
const db = createClient(origin, env('SUPABASE_SERVICE_ROLE_KEY'), options)
const settings = { writes: env('JNQ_FORMAL_WRITES_ENABLED') === 'true', uploads: env('JNQ_FORMAL_UPLOADS_ENABLED') === 'true',
  publication: env('JNQ_FORMAL_PUBLICATION_ENABLED') === 'true',
  privateAuthorityReady: env('JNQ_FORMAL_PRIVATE_AUTHORITY_READY') === 'true',
  privateMediaReady: env('JNQ_FORMAL_PRIVATE_MEDIA_READY') === 'true', anonymousBoundaryReady: env('JNQ_FORMAL_ANON_BOUNDARY_READY') === 'true' }
const services = createFormalServices({ db, anonKey, scope, settings, env })
const ids = (name: string) => env(name).split(',').map(value => value.trim()).filter(Boolean)
export function createFormalHandler(gates: Readonly<{ writes: boolean, uploads: boolean, publication: boolean }> = FORMAL_RELEASE_GATES) { return createFormalPreparedApi({ scope, settings, gates,
  editors: ids('JNQ_FORMAL_EDITOR_IDS'), publishers: ids('JNQ_FORMAL_PUBLISHER_IDS'),
  async getIdentity(token: string) {
    return verifiedFormalIdentity(token, async (value: string) => {
      const { data, error } = await auth.getUser(value); return error ? null : data.user
    })
  },
  async load(route: string, query: any) {
    // Until approved private bootstrap, keep the accepted read-only Edge live;
    // this OFF bundle is not a replacement for its verified read source.
    if (route === '/admin/locations') {
      if (query.resource === 'affiliate-links') {
        const rows = []
        for (let offset = 0; offset < 10000; offset += 200) {
          const result = await db.from('affiliate_links').select('*').order('id').range(offset, offset + 199)
          if (result.error || !result.data) throw Error('FORMAL_AFFILIATES_UNAVAILABLE')
          rows.push(...result.data); if (result.data.length < 200) return { data: rows, hasMore: false }
        }
        throw Error('FORMAL_AFFILIATES_LIMIT')
      }
      const rows = await services.allSpots()
      if (query.id === null) return { data: rows, hasMore: false }
      const row = rows.find(row => row.id === query.id)
      return row ? { data: row, hasMore: false } : null
    }
    if (route === '/admin/regions') {
      const result = await db.from('regions').select('id,name,name_cn,country,parent_id').order('name').limit(1000)
      if (result.error) throw result.error
      return { data: result.data }
    }
    if (route === '/admin/location-slugs') {
      const result = await db.storage.from(scope.storageBucket).download('_system/location-slugs.webp')
      if (result.error || !result.data || result.data.size > 1024 * 1024) throw Error('FORMAL_SLUG_MAP_UNAVAILABLE')
      const map = JSON.parse(await result.data.text())
      const edits: any[] = await services.store.read('location-slug-edits')
      const edit = edits.find(row => row.id === query.id)
      return { slug: edit ? edit.slug : map[String(query.id)] || '' }
    }
    if (route === '/admin/notes') return { notes: await services.store.read('notes') }
    if (route === '/admin/guides') return { guides: await services.store.read('guides') }
    throw Error('FORMAL_PREPARED_READ_ROUTE_NOT_ENABLED')
  }, ...services,
}) }
