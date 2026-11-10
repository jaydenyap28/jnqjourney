import { PUBLIC_SPOT_FIELDS } from './publication-gate.mjs'
import { integrationImage } from './worker.mjs'

export const ORIGIN = 'https://codex-snapshot-poc.jnqjourney-spot-loop-migration-candidate.pages.dev'
export const SOURCE = 'https://rnamstwwbzknwbjwdgrf.supabase.co'
export const SPOT_ID = 92061
export const SLUG = 'consumer-fixture-92061-92061'
export const ZH = `/spot/${SLUG}`
export const EN = `/en${ZH}`
export const STATIC_EXCLUDES = ['/_next/static/*', '/fonts/*', '/icon.png', '/apple-icon.png', '/favicon.ico']
const media = /^\/media\/candidate\/92061\/[a-f0-9-]{36}\.png$/
const hex = /^[a-f0-9]{64}$/
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-JnQ-Snapshot-Gate': '1',
  'Vary': 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

export async function projectionHash(row) {
  const input = new TextEncoder().encode(JSON.stringify(canonical(row)))
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function verifiedProjection(rows) {
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid public projection')
  if (rows.length === 0) return null
  const [row] = rows
  if (!row || row.id !== SPOT_ID || row.status !== 'active' || ![null, 'published'].includes(row.publication_status) ||
      row.redirect_url || !row.updated_at || !Number.isFinite(Date.parse(row.updated_at)) ||
      Object.keys(row).length !== PUBLIC_SPOT_FIELDS.length || PUBLIC_SPOT_FIELDS.some(key => !Object.hasOwn(row, key))) {
    throw new Error('Unexpected Spot projection')
  }
  return row
}

function route(request, url, buildId) {
  const isRsc = request.headers.get('RSC') === '1'
  if (url.search && (!isRsc || !/^\?_rsc=[a-zA-Z0-9_-]{1,32}$/.test(url.search))) return null
  const page = url.pathname
  if (page === '/' || page === ZH) return { name: (page === '/' ? 'home' : 'zh') + (isRsc ? '-rsc' : '-html'), home: page === '/' }
  if (url.search || isRsc) return null
  if (page === EN) return { name: 'en-html' }
  if (page === `/_next/data/${buildId}${EN}.json`) return { name: 'en-json' }
  if (page === `/spot/spot-${SPOT_ID}`) return { alias: ZH }
  if (page === `/en/spot/spot-${SPOT_ID}`) return { alias: EN }
  if (page === '/api/locations') return { name: 'locations-json', home: true }
  if (page === `/api/spots/${SLUG}`) return { name: 'spot-json' }
  if (media.test(page)) return { media: page }
  return null
}

function response(status, text) { return new Response(text, { status, headers }) }
const unavailable = () => response(503, 'Publication snapshot unavailable')

export function createSnapshotGateway(transport = (...args) => fetch(...args)) {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url)
        if (url.origin !== ORIGIN || !['GET', 'HEAD'].includes(request.method)) return response(404, 'Not Found')
        const selected = route(request, url, env.SNAPSHOT_BUILD_ID)
        if (!selected) return response(404, 'Not Found')
        if (env.SUPABASE_URL !== SOURCE || !env.SUPABASE_SERVICE_ROLE_KEY || !env.TEST_MEDIA ||
            !/^snapshot-poc\/\d{13}$/.test(env.SNAPSHOT_PREFIX || '') ||
            !/^[a-zA-Z0-9_-]{1,40}$/.test(env.SNAPSHOT_BUILD_ID || '') ||
            !/^\d{10}$/.test(env.SNAPSHOT_EXPIRES_AT || '') || Date.now() >= Number(env.SNAPSHOT_EXPIRES_AT) * 1000) return unavailable()

        // The dedicated Preview fault probe can only substitute a nonexistent
        // RPC. It cannot select a dataset or grant publication eligibility.
        const rpc = request.headers.get('X-JnQ-Snapshot-Fault') === '1' ? 'jnq_snapshot_intentionally_missing' : 'jnq_public_spots'
        const upstream = await transport(`${SOURCE}/rest/v1/rpc/${rpc}`, {
          method: 'POST', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(5000),
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_ids: [SPOT_ID] }),
        })
        if (!upstream.ok) { await upstream.body?.cancel(); return unavailable() }
        const row = verifiedProjection(await upstream.json())
        if (!row) return selected.home ? unavailable() : response(404, 'Not Found')
        if (selected.media) {
          if (row.image_url !== selected.media && !row.images?.includes(selected.media)) return response(404, 'Not Found')
          const image = await integrationImage(request, env, null, String(SPOT_ID), selected.media.slice(1), transport)
          const imageHeaders = new Headers(image.headers)
          for (const [key, value] of Object.entries(headers)) imageHeaders.set(key, value)
          return new Response(image.body, { status: image.status, headers: imageHeaders })
        }

        // A revision is addressed by the complete current public projection.
        // Old objects stay private, including changes that omit updated_at.
        const revision = await projectionHash(row)
        const prefix = `${env.SNAPSHOT_PREFIX}/${revision}`
        const manifest = await env.TEST_MEDIA.get(`${prefix}/manifest.json`)
        if (!manifest || manifest.size > 8192) { await manifest?.body.cancel(); return unavailable() }
        const release = await manifest.json()
        if (release.revision !== revision || release.spotId !== SPOT_ID || release.buildId !== env.SNAPSHOT_BUILD_ID || release.updatedAt !== row.updated_at) return unavailable()
        if (selected.alias) return new Response(null, { status: 301, headers: { ...headers, Location: selected.alias } })
        const entry = release.objects?.[selected.name]
        if (!entry || !hex.test(entry.sha256) || !entry.version || !entry.etag || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 2 * 1024 * 1024) return unavailable()
        const body = await env.TEST_MEDIA.get(`${prefix}/${selected.name}-${entry.sha256}`)
        if (!body || body.version !== entry.version || body.etag !== entry.etag || body.size !== entry.bytes) {
          await body?.body.cancel()
          return unavailable()
        }
        const type = selected.name.endsWith('-rsc') ? 'text/x-component' : selected.name.endsWith('-json') ? 'application/json' : 'text/html'
        if (request.method === 'HEAD') await body.body.cancel()
        return new Response(request.method === 'HEAD' ? null : body.body, {
          headers: { ...headers, 'Content-Type': selected.name.endsWith('-rsc') ? type : `${type}; charset=utf-8`, 'Content-Length': String(body.size), 'X-JnQ-Snapshot-Revision': revision },
        })
      } catch (error) {
        return error?.status === 404 ? response(404, 'Not Found') : unavailable()
      }
    },
  }
}

export default createSnapshotGateway()
