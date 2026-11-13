import { FORMAL_PROJECT, createFormalAdminRead } from './formal-admin-read.mjs'
import { assertFormalScope, FORMAL_RELEASE_GATES, requireCapability, FormalError } from './formal-runtime.mjs'

export function createFormalPreparedApi({ scope, settings, editors, publishers, getIdentity, load,
  mutations, mutationStatus, media, publication, runner, gates = FORMAL_RELEASE_GATES }) {
  assertFormalScope(scope)
  const readOnly = createFormalAdminRead({ projectRef: FORMAL_PROJECT, origin: scope.origin,
    editors, publishers, getIdentity, load })
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Origin, Authorization',
      ...(origin === scope.origin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const json = (body, status = 200) => Response.json(body, { status, headers })
    const route = new URL(request.url).pathname.replace(/^\/(?:functions\/v1\/)?jnq-admin-formal(?=\/|$)/, '')
    if (route.startsWith('/publication/runner/')) {
      try {
        requireCapability('publication', gates, settings)
        if (origin || request.method !== 'GET' || !runner) throw new FormalError(403, 'FORMAL_RUNNER_ONLY')
        return await runner(request)
      } catch (error) { return json({ error: error instanceof FormalError ? error.code : 'FORMAL_RUNNER_FAILED' }, error instanceof FormalError ? error.status : 503) }
    }
    if (origin !== scope.origin) return json({ error: 'FORMAL_ORIGIN_DENIED' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-JnQ-Mutation-Id' } })
    if (request.method === 'GET' && !route.startsWith('/admin/mutations/') && !['/session', '/publication', '/publication/catalog', '/publication/review', '/admin/media'].includes(route)) return readOnly(request)
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/i)?.[1]
      const id = token && token.length <= 8192 ? await getIdentity(token) : null
      if (!id) throw new FormalError(401, 'FORMAL_SESSION_INVALID')
      if (!editors.includes(id) && !publishers.includes(id)) throw new FormalError(403, 'FORMAL_ADMIN_REQUIRED')
      if (request.method === 'GET' && /^\/admin\/mutations\/[a-f0-9-]{36}$/.test(route)) {
        if (!editors.includes(id)) throw new FormalError(403, 'FORMAL_EDITOR_REQUIRED')
        return json(await mutationStatus(route.split('/').at(-1), id))
      }
      if (route === '/session' && request.method === 'GET') return json({ authorized: true,
        canEdit: editors.includes(id), canPublish: publishers.includes(id),
        writesEnabled: editors.includes(id) && gates.writes === true && settings.writes === true,
        uploadsEnabled: editors.includes(id) && gates.uploads === true && settings.uploads === true,
        publishingEnabled: publishers.includes(id) && gates.publication === true && settings.publication === true })
      if (route.startsWith('/publication')) {
        if (!publishers.includes(id)) throw new FormalError(403, 'FORMAL_PUBLISHER_REQUIRED')
        requireCapability('publication', gates, settings)
        return json(await publication(request, id))
      }
      if (route === '/admin/media' && request.method === 'GET') {
        requireCapability('uploads', gates, settings)
        const asset = await media.get(new URL(request.url).searchParams.get('name') || '', id)
        return new Response(asset.bytes, { headers: { ...headers, 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff' } })
      }
      if (!editors.includes(id)) throw new FormalError(403, 'FORMAL_EDITOR_REQUIRED')
      if (route.startsWith('/upload/r2') && request.method === 'POST') {
        requireCapability('uploads', gates, settings)
        if(!['/upload/r2/presign','/upload/r2/complete','/upload/r2/cancel'].includes(route))throw new FormalError(405,'FORMAL_USE_PRESIGNED_UPLOAD')
        if(!request.headers.get('content-type')?.startsWith('application/json'))throw new FormalError(415,'FORMAL_UPLOAD_JSON_REQUIRED')
        const reader=request.body?.getReader();if(!reader)throw new FormalError(400,'FORMAL_BODY_REQUIRED')
        const parts=[];let bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new FormalError(413,'FORMAL_UPLOAD_GRANT_BODY_LIMIT')};parts.push(value)}
        let body;try{body=JSON.parse(await new Blob(parts).text())}catch{throw new FormalError(400,'FORMAL_JSON_INVALID')}
        if(route.endsWith('/presign'))return json(await media.start(body,id),201)
        const uploaded=await media.finish(body,id,route.endsWith('/cancel'))
        return json({items:[uploaded],files:[uploaded],...uploaded},201)
      }
      requireCapability('writes', gates, settings)
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new FormalError(415, 'FORMAL_JSON_REQUIRED')
      const reader = request.body?.getReader()
      if (!reader) throw new FormalError(400, 'FORMAL_BODY_REQUIRED')
      const chunks = []; let size = 0
      for (;;) { const { done, value } = await reader.read(); if (done) break
        size += value.byteLength; if (size > 1024 * 1024) { await reader.cancel(); throw new FormalError(413, 'FORMAL_BODY_LIMIT') }; chunks.push(value) }
      let body
      try { body = JSON.parse(await new Blob(chunks).text()) } catch { throw new FormalError(400, 'FORMAL_JSON_INVALID') }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new FormalError(400, 'FORMAL_JSON_INVALID')
      const context = { actor: id, id: request.headers.get('x-jnq-mutation-id') }
      if (route === '/admin/locations' && ['POST', 'PATCH'].includes(request.method)) return json(await mutations.spot(request.method, body, context))
      if (route === '/admin/location-slugs' && request.method === 'POST') return json(await mutations.slug(body, context))
      if (route === '/admin/locations' && request.method === 'DELETE') throw new FormalError(405, 'FORMAL_HARD_DELETE_NOT_ENABLED_USE_HIDE')
      if (['/admin/notes', '/admin/guides'].includes(route) && request.method === 'POST') return json(await mutations.document(route.endsWith('/notes') ? 'notes' : 'guides', body, context))
      throw new FormalError(405, 'FORMAL_ROUTE_NOT_ENABLED')
    } catch (error) {
      return json({ error: error instanceof FormalError ? error.code : 'FORMAL_REQUEST_FAILED',
        ...(error instanceof FormalError && error.removalDigest ? { removed: error.removed, removalDigest: error.removalDigest } : {}) },
      error instanceof FormalError ? error.status : error?.constructor?.name === 'NoteConflictError' ? 409 :
        error?.constructor?.name === 'AdminError' && [400,404,409,413,415,503].includes(error.status) ? error.status : 503)
    }
  }
}
