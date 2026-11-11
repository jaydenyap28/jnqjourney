'use client'

import { supabase } from '@/lib/supabase'
import { ADMIN_API } from '@/lib/admin-preview-config'

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const route = typeof input === 'string' ? input : ''
  const target = new URL(route, 'https://editor.invalid')
  if (target.origin !== 'https://editor.invalid' || !route.startsWith('/') ||
      !/^\/(?:api\/(?:admin\/|upload\/r2$)|session$|publication$)/.test(target.pathname)) {
    throw new Error('后台请求路径不受支持。')
  }
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session?.access_token) headers.set('Authorization', 'Bearer ' + data.session.access_token)
  const response = await fetch(ADMIN_API + target.pathname.replace(/^\/api(?=\/)/, '') + target.search, {
    ...init, headers, cache: 'no-store', redirect: 'error', credentials: 'omit',
  })
  if (response.status === 401 && data.session) {
    // A failed server session must not leave the editor active.
    await supabase.auth.signOut({ scope: 'local' })
  }
  return response
}

export async function readPreviewRegions() {
  const response = await adminFetch('/api/admin/regions')
  const result = await response.json()
  if (!response.ok || !Array.isArray(result.data)) return {
    data: null, error: { message: result.error || '地区资料暂不可用。', code: String(response.status) },
  }
  return { data: result.data, error: null }
}
