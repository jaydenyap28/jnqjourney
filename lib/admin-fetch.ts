'use client'

import { supabase } from '@/lib/supabase'

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  const headers = new Headers(init.headers || {})
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })
  // A Route Handler's revalidateTag is flushed after it returns in Next 14.
  // Read-back must be a separate request, not a read inside the writer.
  if (response.headers.get('X-JNQ-Publication-Verification') === 'required') {
    const payload = await response.clone().json()
    const receipt = payload.publication
    try {
      const verification = await fetch('/api/admin/publication-verify', {
        method: 'POST', headers: { Authorization: headers.get('Authorization') || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: receipt.checks, englishPaths: receipt.plan?.englishPaths || [], ...(receipt.noHtmlConsumers ? {sourceOnly:receipt.change} : {}) }),
      })
      const result = await verification.json()
      if (!verification.ok || !result.ok) throw new Error('Public read-back did not confirm the submitted version')
      return Response.json({ ...payload, publication: { ...receipt, state: 'verified', verification: result } }, { status: response.status, headers: response.headers })
    } catch {
      return Response.json({ ...payload, ok: false, partial: true, persisted: true,
        error: `资料已保存${payload.mutation ? `（确认 ${payload.mutation.affected}/${payload.mutation.expected} 行）` : ''}，但公开页面独立复核未通过。请只重试 publication，不要重复数据库提交。`,
        publication: { ...receipt, state: 'partial' },
      }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
    }
  }
  return response
}

