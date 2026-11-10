// Persist bounded event metadata from a deployment-scoped native Tail.
// Keep its URL, token, request headers and raw frames in memory.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { ACCOUNT, PROJECT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { ORIGIN } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

export function snapshotTailEvent(raw) {
  const req = raw?.event?.request
  if (!req) return null
  const url = new URL(req.url)
  if (url.origin !== ORIGIN) return null
  const header = name => Object.entries(req.headers || {}).find(([key]) => key.toLowerCase() === name)?.[1]
  const marker = header('x-jnq-acceptance')
  const pathMarker = url.pathname.match(/^\/__jnq_snapshot_observe\/(\d+-\d+)$/)?.[1]
  const headerMarker = /^\d+-\d+$/.test(marker || '') ? marker : null
  const markerConflict = Boolean(headerMarker && pathMarker && headerMarker !== pathMarker)
  const ray = header('cf-ray')
  return {
    acceptanceId: markerConflict ? null : headerMarker || pathMarker || null,
    correlation: markerConflict ? 'CONFLICT' : headerMarker ? 'header' : pathMarker ? 'diagnostic-path' : 'NONE',
    path: url.pathname.replace(/(\/media\/candidate\/92061\/)[a-f0-9-]{36}(\.png)/g, '$1REDACTED$2'),
    method: req.method, status: raw.event?.response?.status ?? null,
    cpuTime: Number.isFinite(raw.cpuTime) && raw.cpuTime >= 0 ? raw.cpuTime : 'UNKNOWN',
    outcome: raw.outcome ?? null, truncated: Boolean(raw.truncated),
    cfRay: typeof ray === 'string' && /^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/i.test(ray) ? ray : null,
    nativeTraceId: typeof raw.id === 'number' || typeof raw.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(raw.id) ? raw.id : null,
    eventTimestamp: Number.isFinite(raw.eventTimestamp) ? raw.eventTimestamp : null,
    receivedAt: new Date().toISOString(),
  }
}

export async function openSnapshotTail(deployment, output, { diagnostic = false } = {}) {
  assert.ok(deployment.environment === 'preview' && deployment.origin === ORIGIN && deployment.success)
  assert.match(deployment.deploymentId, /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/)
  const token = await privateWranglerToken()
  const WebSocket = createRequire(pathToFileURL(process.env.JNQ_WRANGLER_CLI))('ws')
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}/deployments/${deployment.deploymentId}/tails`
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const created = await fetch(endpoint, {
    method: 'POST', headers: auth, body: JSON.stringify({ filters: [] }), redirect: 'manual', signal: AbortSignal.timeout(12000),
  })
  const payload = await created.json().catch(() => null)
  assert.ok(created.ok && payload?.success && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.result?.id || ''), `PAGES_TAIL_CREATE_HTTP_${created.status}`)
  const sessionUrl = `${endpoint}/${payload.result.id}`
  const record = { deploymentId: deployment.deploymentId, openedAt: null, deleted: false, ignoredEvents: 0, malformed: 0, events: [], unassociatedEvents: [],
    frames: 0, controlFrames: 0, samplingNotice: false, errorCount: 0, closedAt: null, closeCode: null, pongConfirmed: false,
    requestedSampling: 'NO_SAMPLING_FILTER', nativeExpiration: payload.result.expires_at ?? null, sessionId: payload.result.id }
  const active = new Map()
  let socket, socketError, save = Promise.resolve()
  const persist = () => {
    const contents = JSON.stringify(record, null, 2) + '\n'
    save = save.then(() => writeFile(output, contents))
    return save
  }
  async function close() {
    record.clientInitiatedClose = !record.closedAt
    socket?.terminate()
    const deleted = await fetch(sessionUrl, { method: 'DELETE', headers: auth, redirect: 'manual', signal: AbortSignal.timeout(10000) })
    record.deleted = deleted.ok
    await deleted.body?.cancel()
    await persist()
    assert.ok(record.deleted, `PAGES_TAIL_DELETE_HTTP_${deleted.status}`)
  }
  try {
    const url = new URL(payload.result.url)
    assert.ok(url.protocol === 'wss:' && !url.username && !url.password, 'INVALID_TAIL_SOCKET')
    socket = new WebSocket(url, 'trace-v1', { handshakeTimeout: 12000, followRedirects: false, maxPayload: 2 * 1024 * 1024 })
    socket.on('error', () => { socketError = 'NATIVE_TAIL_SOCKET_ERROR'; record.errorCount++ })
    socket.on('close', code => { record.closeCode = code; record.closedAt = new Date().toISOString() })
    socket.on('message', bytes => {
      record.frames++
      let raw
      try { raw = JSON.parse(bytes.toString('utf8')) } catch { record.malformed++; return }
      if (/sampl|overload|rate.limit/i.test(JSON.stringify([raw?.logs, raw?.message, raw?.type]))) record.samplingNotice = true
      let event
      try { event = snapshotTailEvent(raw) } catch { record.malformed++; return }
      if (!event) { record.controlFrames++; return }
      if (!active.has(event.acceptanceId)) {
        record.ignoredEvents++
        if (record.unassociatedEvents.length < 40) record.unassociatedEvents.push(event)
        return
      }
      record.events.push(event)
      active.get(event.acceptanceId)(event)
    })
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('NATIVE_TAIL_OPEN_TIMEOUT')), 13000)
      const done = error => { clearTimeout(timeout); if (error) reject(Error('NATIVE_TAIL_OPEN_FAILED')); else resolve() }
      socket.once('error', done)
      socket.once('close', () => done(true))
      socket.once('open', () => socket.send(JSON.stringify({ debug: false }), { mask: false, compress: false }, done))
    })
    assert.equal(socket.readyState, WebSocket.OPEN, 'NATIVE_TAIL_NOT_OPEN')
    record.openedAt = new Date().toISOString()
    if (diagnostic) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('NATIVE_TAIL_PONG_TIMEOUT')), 6000)
      socket.once('pong', () => { clearTimeout(timeout); record.pongConfirmed = true; resolve() })
      socket.ping()
    })
    await persist()
  } catch (error) {
    await close().catch(() => {})
    throw Error(error.message.startsWith('NATIVE_TAIL_') ? error.message : 'NATIVE_TAIL_HANDSHAKE_FAILED')
  }

  function track(id) {
    assert.ok(socket.readyState === WebSocket.OPEN && !socketError && !record.malformed, 'NATIVE_TAIL_NOT_OPEN')
    assert.ok(!active.has(id) && /^\d+-\d+$/.test(id))
    let timer
    const event = new Promise(resolve => {
      timer = setTimeout(() => resolve(null), diagnostic ? 45000 : 24000)
      active.set(id, resolve)
    })
    return {
      async result() {
        const value = await event
        await persist()
        assert.equal(record.malformed, 0, 'NATIVE_TAIL_MALFORMED')
        return value
      },
      cancel() { clearTimeout(timer); active.delete(id) },
    }
  }
  return { openedAt: record.openedAt, track, close }
}
