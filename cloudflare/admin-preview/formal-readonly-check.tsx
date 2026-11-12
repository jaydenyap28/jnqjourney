'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ADMIN_API } from '@/lib/admin-preview-config'

// Runs inside the existing signed-in application. Tokens never enter a URL,
// receipt, console, download, or test-tool output.
export default function FormalReadonlyCheck() {
  const [running, setRunning] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [readyToLogout, setReadyToLogout] = useState(false)
  const add = (line: string) => setLines(previous => [...previous, line])
  async function verify() {
    setRunning(true); setLines([]); setReadyToLogout(false)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw Error('请使用现有管理员会话打开本页。')
      const token = data.session.access_token
      const call = (route: string, method = 'GET') => fetch(ADMIN_API + route, {
        method, headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', redirect: 'error',
        credentials: 'omit', signal: AbortSignal.timeout(45000),
      })
      const session = await call('/session')
      const capability = await session.json()
      if (session.status !== 200 || capability.writesEnabled !== false) throw Error('只读权限核验失败。')
      add('PASS 管理员鉴权 200；正式写入 OFF')
      const payloads: Record<string, unknown> = {}
      for (const [route, field, count] of [['/admin/locations', 'data', 586], ['/admin/notes', 'notes', 6], ['/admin/guides', 'guides', 7]] as const) {
        const response = await call(route)
        const value = await response.json()
        if (response.status !== 200 || !Array.isArray(value[field]) || value[field].length !== count) throw Error('资料读取或数量不符：' + field)
        payloads[route] = value
        add(`PASS ${field} HTTP 200；${count} 条`)
      }
      const rows = (payloads['/admin/locations'] as { data: { id: number }[] }).data
      const detail = await call('/admin/locations?id=' + rows[0].id)
      const detailValue = await detail.json()
      if (detail.status !== 200 || detailValue.data?.id !== rows[0].id) throw Error('景点详细资料不一致。')
      add('PASS 景点详细资料 HTTP 200；ID 与列表一致')
      for (const [route, method] of [['/admin/locations', 'POST'], ['/admin/locations', 'PATCH'],
        ['/admin/locations', 'DELETE'], ['/admin/notes', 'POST'], ['/admin/guides', 'POST'],
        ['/upload/r2', 'POST'], ['/publication', 'POST']] as const) {
        const response = await call(route, method)
        await response.body?.cancel()
        if (response.status !== 405) throw Error('正式写入拦截异常：' + method + ' ' + route)
        add(`PASS ${method} ${route} 服务端 405`)
      }
      // Compare actual read-back bytes, not merely successful mutation errors.
      for (const [route, expected] of Object.entries(payloads)) {
        const response = await call(route)
        const actual = await response.json()
        if (!response.ok || JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('拒绝请求后资料发生变化：' + route)
      }
      add('PASS 拒绝请求前后三类资料完全一致')
      setReadyToLogout(true)
    } catch (error) { add('FAIL ' + (error instanceof Error ? error.message : '核验失败')) }
    finally { setRunning(false) }
  }
  async function logoutAndReplay() {
    setRunning(true)
    let token = ''
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session || (data.session.expires_at || 0) * 1000 < Date.now() + 30000) throw Error('需有仍有效的会话，避免将过期误认为退出保护。')
      token = data.session.access_token
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw Error('退出服务端会话失败。')
      const response = await fetch(ADMIN_API + '/admin/locations', {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', redirect: 'error',
        credentials: 'omit', signal: AbortSignal.timeout(45000),
      })
      await response.body?.cancel()
      if (response.status !== 401) throw Error('旧会话重放未被拒绝，HTTP ' + response.status)
      add('PASS 登出成功；未到期旧会话重放 HTTP 401')
      setReadyToLogout(false)
    } catch (error) { add('FAIL ' + (error instanceof Error ? error.message : '退出核验失败')) }
    finally { token = ''; setRunning(false) }
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-8 text-white">
    <h1 className="text-2xl">正式后台 · 只读安全验收</h1>
    <p>只读取资料并发送空的拒绝请求，不提交修改。最后一步会退出当前登录。</p>
    <a href="/admin" className="underline">返回资料列表</a>
    <div className="flex gap-4">
      <button className="rounded border p-3 disabled:opacity-40" disabled={running} onClick={verify}>检查读取与服务端拒绝</button>
      <button className="rounded border p-3 disabled:opacity-40" disabled={running || !readyToLogout} onClick={logoutAndReplay}>最后：退出并核验旧会话</button>
    </div>
    <pre role="status" className="whitespace-pre-wrap rounded border p-4">{lines.join('\n') || '等待运行'}</pre>
  </main>
}
