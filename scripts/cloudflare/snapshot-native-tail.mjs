// Open a bounded, deployment-scoped native Tail. Keep its URL, token and raw
// events in memory. The report includes only requests we registered ourselves.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { ACCOUNT, PROJECT, privateWranglerToken } from './candidate-cloudflare.mjs'
import { ORIGIN } from '../../cloudflare/spot-loop/snapshot-gateway.mjs'

export async function openSnapshotTail(deployment, output) {
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
  const record = { deploymentId: deployment.deploymentId, openedAt: null, deleted: false, ignoredEvents: 0, malformed: 0, events: [] }
  const active = new Map()
  let socket, socketError, save = Promise.resolve()
  const persist = () => {
    const contents = JSON.stringify(record, null, 2) + '\n'
    save = save.then(() => writeFile(output, contents))
    return save
  }
  async function close() {
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
    socket.on('error', () => { socketError = 'NATIVE_TAIL_SOCKET_ERROR' })
    socket.on('message', bytes => {
      let raw
      try { raw = JSON.parse(bytes.toString('utf8')) } catch { record.malformed++; return }
      const req = raw?.event?.request
      const id = Object.entries(req?.headers || {}).find(([key]) => key.toLowerCase() === 'x-jnq-acceptance')?.[1]
      if (!active.has(id)) { record.ignoredEvents++; return }
      let path
      try { path = new URL(req.url).pathname } catch { record.malformed++; return }
      const event = { acceptanceId: id, path, method: req.method, status: raw.event?.response?.status ?? null,
        cpuTime: typeof raw.cpuTime === 'number' ? raw.cpuTime : 'UNKNOWN', outcome: raw.outcome ?? null, truncated: Boolean(raw.truncated) }
      record.events.push(event)
      active.get(id)(event)
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
      timer = setTimeout(() => resolve(null), 24000)
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
