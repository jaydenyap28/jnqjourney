// Server-side read boundary for the standalone formal Admin.
export const FORMAL_PROJECT = 'vrufunuomioczocdsoer'
export const FORMAL_ADMIN_API = 'jnq-admin-formal'
export const FORMAL_STORAGE_BUCKET = 'location-images'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const reads = new Set(['/session', '/publication', '/admin/locations', '/admin/location-slugs',
  '/admin/regions', '/admin/notes', '/admin/guides'])

export function createFormalAdminRead({ projectRef, origin, editors, publishers, getIdentity, load }) {
  if (projectRef !== FORMAL_PROJECT || !origin || new URL(origin).origin !== origin ||
      !origin.startsWith('https://') || !editors.length ||
      ![...editors, ...publishers].every(id => uuid.test(id))) throw Error('FORMAL_ADMIN_SCOPE_INVALID')
  const editorSet = new Set(editors), publisherSet = new Set(publishers)
  return async request => {
    const allowed = request.headers.get('origin') === origin
    const headers = {
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Origin, Authorization', 'X-Content-Type-Options': 'nosniff',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    }
    const json = (data, status = 200) => Response.json(data, { status, headers })
    if (!allowed) return json({ error: '不允许此来源。' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization',
    } })
    const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/i)?.[1]
    if (!token || token.length > 8192) return json({ error: '请先登录。' }, 401)
    try {
      // Only the project Auth server can assert a user ID. Browser metadata is ignored.
      const id = await getIdentity(token)
      if (!id) return json({ error: '会话失效，请重新登录。' }, 401)
      if (!editorSet.has(id) && !publisherSet.has(id)) return json({ error: '这个账号没有后台权限。' }, 403)
      if (request.method !== 'GET') return json({ error: '正式后台仍处于只读准备阶段。' }, 405)
      const url = new URL(request.url)
      const route = url.pathname.replace(new RegExp(`^/(?:functions/v1/)?${FORMAL_ADMIN_API}(?=/|$)`), '')
      if (!reads.has(route)) return json({ error: '未知后台请求。' }, 404)
      if (route === '/session') return json({ authorized: true, canEdit: editorSet.has(id), canPublish: publisherSet.has(id), writesEnabled: false })
      if (route === '/publication') return json({ state: 'disabled', canPublish: publisherSet.has(id) })
      const recordId = url.searchParams.get('id')
      if (recordId !== null && (!/^\d{1,15}$/.test(recordId) || !Number.isSafeInteger(Number(recordId)) || Number(recordId) < 1)) {
        return json({ error: '景点 ID 无效。' }, 400)
      }
      const recordSlug = url.searchParams.get('slug')
      if (recordSlug !== null && (recordSlug.length > 120 || !slug.test(recordSlug))) return json({ error: '别名无效。' }, 400)
      const resource = url.searchParams.get('resource')
      if (resource !== null && (route !== '/admin/locations' || resource !== 'affiliate-links' || recordId !== null)) {
        return json({ error: '读取资源无效。' }, 400)
      }
      const result = await load(route, { id: recordId === null ? null : Number(recordId), slug: recordSlug,
        ...(resource === null ? {} : { resource }) })
      return result === null ? json({ error: '资料不存在。' }, 404) : json(result)
    } catch { return json({ error: '正式资料暂不可用。' }, 503) }
  }
}
