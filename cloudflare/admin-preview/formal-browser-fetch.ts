'use client'
import { supabase } from '@/lib/supabase'
import { ADMIN_API } from '@/lib/admin-preview-config'
import { formalCanPublish, formalCanUpload, formalCanWrite, setFormalCapabilities } from '@/lib/formal-browser-capabilities'

const denied = (error: string, status = 405) => Response.json({ error }, { status })
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const route = typeof input === 'string' ? input : ''
  const target = new URL(route, 'https://editor.invalid')
  if (target.origin !== 'https://editor.invalid' || !route.startsWith('/') ||
      !/^\/(?:api\/(?:admin\/|upload\/r2$)|session$|publication(?:\/(?:catalog|retry))?$)/.test(target.pathname)) throw Error('后台请求路径不受支持。')
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    const allowed = route.startsWith('/publication') ? formalCanPublish() : route === '/api/upload/r2' ? formalCanUpload() : formalCanWrite()
    if (!allowed) return denied('正式功能尚未启用。')
  }
  const { data } = await supabase.auth.getSession()
  if (!data.session) { setFormalCapabilities({}); return denied('请重新登录。', 401) }
  const headers = new Headers(init.headers)
  headers.set('Authorization', 'Bearer ' + data.session.access_token)
  let intentKey = '', createKey = ''
  if (method !== 'GET' && typeof init.body === 'string' && route.startsWith('/api/admin/')) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(method + route + init.body))
    const hash = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
    intentKey = 'jnq:formal-intent:' + data.session.user.id + ':' + hash
    createKey = method === 'POST' && target.pathname === '/api/admin/locations' ? 'jnq:formal-newspot:' + data.session.user.id : ''
    try {
      const previous = createKey && localStorage.getItem(createKey)
      if (previous && previous !== intentKey) {
        const previousId = localStorage.getItem(previous)
        const checked = previousId && await adminFetch('/api/admin/mutations/' + previousId)
        const receipt = checked && checked.ok ? await checked.json() : null
        if (receipt?.state === 'committed') {
          const savedId = receipt.result?.data?.id
          if (window.confirm(`上次新增已保存为景点 ID ${savedId}。此次修改尚未发送。确认清除已核实回执，并先打开该景点继续编辑？`)) {
            localStorage.removeItem(previous); localStorage.removeItem(createKey)
          }
          return denied(`上次已保存为景点 ID ${savedId}。请先打开该景点编辑；此次内容未发送。`, 409)
        }
        return denied('上次新增景点结果待核对，请勿再次新增。当前内容已保留，此次未发送。', 409)
      }
      const id = localStorage.getItem(intentKey) || crypto.randomUUID()
      localStorage.setItem(intentKey, id)
      if (createKey) localStorage.setItem(createKey, intentKey)
      headers.set('X-JnQ-Mutation-Id', id)
    } catch { return denied('浏览器无法保留保存回执，本次未发送。', 503) }
  }
  let body = init.body
  if (route === '/api/upload/r2' && body instanceof FormData && !body.has('rightsEvidence')) {
    const rights = window.prompt('请输入图片来源，并确认你拥有用于 JnQ Journey 的公开使用权。未发布草稿图片仍保持私有。')
    if (!rights?.trim()) return denied('未确认图片来源，本次未上传。', 400)
    body.set('rightsEvidence', rights.trim())
  }
  const response = await fetch(ADMIN_API + target.pathname.replace(/^\/api(?=\/)/, '') + target.search, {
    ...init, body, headers, cache: 'no-store', redirect: 'error', credentials: 'omit',
  })
  if (target.pathname === '/session' && response.ok) setFormalCapabilities(await response.clone().json())
  if (response.status === 401) { setFormalCapabilities({}); await supabase.auth.signOut({ scope: 'local' }) }
  if (intentKey) {
    const result = await response.clone().json().catch(() => ({}))
    const terminal = response.ok || [400,404,409,415,422].includes(response.status) && !/RECONCILE|UNCONFIRMED/.test(result.error || '')
    if (terminal) { localStorage.removeItem(intentKey); if (createKey) localStorage.removeItem(createKey) }
  }
  return response
}
export async function readPreviewRegions() {
  const response = await adminFetch('/api/admin/regions'), result = await response.json()
  return response.ok && Array.isArray(result.data) ? { data: result.data, error: null } :
    { data: null, error: { message: result.error || '地区资料暂不可用。', code: String(response.status) } }
}
