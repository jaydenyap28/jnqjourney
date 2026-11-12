'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Choice = { kind: string, key: string, title: string, version: string, status: string, eligible: boolean }
type Selection = Pick<Choice, 'kind' | 'key' | 'version'>
type Release = { deploymentId: string, url: string, id: string }
type Status = { state: string, online: boolean, live?: Release, job?: {
  id: string, attempt: number, approvals: Selection[], retryable?: boolean, reason?: string, deploymentId?: string, url?: string,
} }
const stateLabel: Record<string, string> = {
  draft: '保存草稿', waiting: '等待执行器', queued: '排队中', building: '构建中',
  verifying: '部署验证中', published: '发布成功', failed: '发布失败',
}
const kindLabel: Record<string, string> = { spot: 'Spot', note: 'Note', guide: 'Guide' }
const itemKey = (item: Selection) => item.kind + ':' + item.key

async function load<T>(route: string, payload?: unknown): Promise<T> {
  const response = await adminFetch(route, payload === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '发布请求未确认，请刷新。')
  return data
}

export default function PublicationPanel() {
  const [status, setStatus] = useState<Status>()
  const [items, setItems] = useState<Choice[]>()
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const locked = useRef(false)
  const refresh = useCallback(async () => {
    try { setStatus(await load<Status>('/publication')) }
    catch { setNotice('发布状态暂不可读。') }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, 15000)
    return () => clearInterval(timer)
  }, [refresh])
  async function prepare() {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setNotice('')
    try {
      const [next, current] = await Promise.all([
        load<{ items: Choice[] }>('/publication/catalog'), load<Status>('/publication'),
      ])
      setStatus(current)
      const approvals = current.job?.approvals ?? []
      setItems(next.items)
      setSelected(next.items.filter(item => item.eligible &&
        approvals.some(row => itemKey(row) === itemKey(item) && row.version === item.version)).map(itemKey))
    } catch (error) { setNotice((error as Error).message) }
    finally { locked.current = false; setBusy(false) }
  }
  async function submit(retry = false) {
    if (locked.current) return
    const selection = items?.filter(item => selected.includes(itemKey(item)))
      .map(({ kind, key, version }) => ({ kind, key, version }))
    if (!retry && (!selection || !window.confirm(`将 ${selection.length} 条选定版本作为新的隔离公开网站。未选内容将从新版本撤下。继续？`))) return
    locked.current = true
    setBusy(true)
    setNotice('')
    try {
      const result = retry
        ? await load<{ id: string, duplicate?: boolean }>('/publication/retry', { id: status?.job?.id })
        : await load<{ id: string, duplicate?: boolean }>('/publication', { selection })
      setNotice(result.duplicate ? '此版本已有发布任务。' : '发布申请已保存。')
      await refresh()
    } catch (error) { setNotice((error as Error).message) }
    finally { locked.current = false; setBusy(false) }
  }
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}
    className="mx-auto mb-3 max-w-7xl rounded-lg border border-white/15 bg-slate-900 p-3 text-sm text-white">
    <summary className="cursor-pointer" aria-label="网站发布">网站发布 · {stateLabel[status?.state || ''] || '读取状态中'}</summary>
    <div className="mt-3 space-y-3">
      <p role="status" data-publication-state={status?.state}>
        {stateLabel[status?.state || ''] || '读取状态中'}{status?.online ? ' · 执行器在线' : ' · 执行器未连接'}
      </p>
      {status?.job && <p className="break-all">任务 {status.job.id} · 第 {status.job.attempt} 次 · {status.job.reason || ''}</p>}
      {status?.live && <p className="break-all">
        <a className="text-sky-200 underline" href={status.live.url} target="_blank" rel="noreferrer">打开已验证的公开 Preview</a>
        {' · Deployment '}{status.live.deploymentId}
      </p>}
      <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={prepare}>准备发布</button>
      {items && <fieldset className="space-y-2">
        <legend>本次批准的公开内容（完整替换上次范围）</legend>
        <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
          {items.map(item => <label key={itemKey(item)} className="flex gap-2 break-words">
            <input type="checkbox" disabled={!item.eligible || busy} checked={selected.includes(itemKey(item))}
              onChange={event => setSelected(event.target.checked ? [...selected, itemKey(item)] : selected.filter(key => key !== itemKey(item)))} />
            <span>{kindLabel[item.kind]} · {item.title} · {item.status === 'approval-required' ? '需明确批准' : item.status}</span>
          </label>)}
        </div>
        <button type="button" disabled={busy} onClick={() => void submit()} className="rounded bg-emerald-700 px-3 py-1 text-white">发布网站</button>
      </fieldset>}
      {status?.state === 'failed' && status.job?.retryable &&
        <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={() => void submit(true)}>重试发布</button>}
      {notice && <p role="alert">{notice}</p>}
    </div>
  </details>
}
