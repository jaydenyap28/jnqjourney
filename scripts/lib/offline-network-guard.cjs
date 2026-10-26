// Preloaded only by validate-offline.mjs and inherited by Next build workers.
// Explicitly deny external network before dotenv/SDK initialization. Loopback is
// retained for Next worker IPC; no production URL or credential is printed.
const net = require('node:net')
const tls = require('node:tls')
const http = require('node:http')
const https = require('node:https')
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase())
const denied = () => Object.assign(new Error('External network disabled for offline validation'), { code: 'OFFLINE_VALIDATION' })
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  // Optional runtime-only synthetic Auth/PostgREST transport. The fixture lives
  // under artifacts; no production host is eligible and mutations stay denied.
  if (process.env.JNQ_OFFLINE_RUNTIME_FIXTURE && url.hostname === 'offline-validation.invalid') {
    const fs = require('node:fs')
    const path = require('node:path')
    const target = path.resolve(process.env.JNQ_OFFLINE_RUNTIME_FIXTURE)
    const allowed = path.resolve(process.cwd(), 'artifacts') + path.sep
    if (!target.startsWith(allowed)) throw denied()
    const request = new Request(input, init)
    fs.appendFileSync(`${target}.requests.jsonl`, JSON.stringify({ method:request.method, pathname:url.pathname }) + '\n')
    if (request.method !== 'GET') throw denied()
    const runtimeState = JSON.parse(fs.readFileSync(target, 'utf8'))
    const publicAux = runtimeState.freezePublicAux && request.headers.get('x-jnq-publication-read') !== 'authoritative' ? runtimeState.frozenAux : runtimeState
    if (url.pathname === '/rest/v1/affiliate_links') {
      let rows = publicAux.affiliates || []
      if (url.searchParams.get('is_active') === 'eq.true') rows = rows.filter(row=>row.is_active)
      const ids = url.searchParams.get('id')?.match(/^in\.\(([^)]+)\)$/)?.[1].split(',').map(Number)
      if (ids) rows = rows.filter(row=>ids.includes(row.id))
      const fields = url.searchParams.get('select')
      if (fields && fields !== '*') rows = rows.map(row=>Object.fromEntries(fields.split(',').map(field=>[field,row[field] ?? null])))
      return Response.json(rows)
    }
    if (url.pathname.endsWith('/_system/guide-price-highlights.json') && runtimeState.prices) return new Response(JSON.stringify(publicAux.prices))
    if (url.pathname.endsWith('/_system/klook-widgets-latest.webp') && runtimeState.widgets) return new Response('_system/klook-widgets/rc-fixture.webp')
    if (url.pathname.endsWith('/_system/klook-widgets/rc-fixture.webp') && runtimeState.widgets) return new Response(JSON.stringify(publicAux.widgets))
    if (url.pathname === '/auth/v1/user') {
      if (request.headers.get('authorization') !== 'Bearer offline-runtime-token') return Response.json({ message:'Invalid fixture token' }, { status:401 })
      return Response.json({ id:'offline-admin', aud:'authenticated', role:'authenticated', email:'offline-admin@example.test', app_metadata:{}, user_metadata:{}, created_at:'2026-10-18T00:00:00Z' })
    }
    if (url.pathname === '/rest/v1/locations') {
      const state = JSON.parse(fs.readFileSync(target, 'utf8'))
      if (state.failRouting) return Response.json({ message:'Synthetic origin unavailable' }, { status:503 })
      if (state.strictSpotFilters) {
        let rows = state.spots
        for (const key of ['id', 'status', 'region_id', 'publication_status']) {
          const filter = url.searchParams.get(key)
          if (filter?.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === filter.slice(3))
          if (filter?.startsWith('neq.')) rows = rows.filter(row => String(row[key]) !== filter.slice(4))
        }
        return Response.json((request.headers.get('accept') || '').includes('vnd.pgrst.object') ? rows[0] || null : rows)
      }
      if (!url.searchParams.has('id')) return Response.json(state.spots)
      const id = Number(url.searchParams.get('id')?.replace('eq.', ''))
      const spot = state.spots.find(spot => spot.id === id) || null
      return Response.json(spot)
    }
    // Synthetic empty/absent optional data must be an HTTP response, not a
    // thrown transport error (the locked SDK retries the latter exponentially).
    if (url.pathname === '/rest/v1/travel_packages' || url.pathname === '/rest/v1/travel_package_options') {
      let rows = url.pathname.endsWith('travel_package_options') ? runtimeState.packageOptions || [] : runtimeState.packages || []
      for (const key of ['id','package_id','slug','status']) if (url.searchParams.has(key)) rows=rows.filter(row=>String(row[key])===url.searchParams.get(key).replace(/^eq\./,''))
      if (url.searchParams.has('limit')) rows=rows.slice(0,Number(url.searchParams.get('limit')))
      return Response.json((request.headers.get('accept') || '').includes('vnd.pgrst.object') ? rows[0] || null : rows)
    }
    if (url.pathname.startsWith('/storage/v1/object/location-images/_system/')) return Response.json({ message:'Synthetic optional object absent' }, { status:404 })
    throw denied()
  }
  if (!local(url.hostname)) throw denied()
  return originalFetch(input, init)
}
for (const api of [http, https]) {
  for (const name of ['request', 'get']) {
    const original = api[name]
    api[name] = function (target, ...args) {
      const host = typeof target === 'string' || target instanceof URL ? new URL(target).hostname : target?.hostname || target?.host || 'localhost'
      if (!local(host)) throw denied()
      return original.call(this, target, ...args)
    }
  }
}
function checkSocketArgs(args) {
  // net.connect supports a normalized [options, callback] array internally.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const host = typeof first === 'object' && first !== null ? first.host || 'localhost'
    : typeof args[1] === 'string' ? args[1] : 'localhost'
  if (!local(host)) throw denied()
}
const socketConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) { checkSocketArgs(args); return socketConnect.apply(this, args) }
const tlsConnect = tls.connect
tls.connect = function (...args) { checkSocketArgs(args); return tlsConnect.apply(this, args) }
