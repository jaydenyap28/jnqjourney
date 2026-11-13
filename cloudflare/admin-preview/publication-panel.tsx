'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Choice = { kind: string, key: string, title: string, version: string | null, status: string, eligible: boolean, change?: string, action?: 'publish' | 'withdraw' }
type Selection = Pick<Choice, 'kind' | 'key' | 'version'>
type Release = { deploymentId: string, url: string, id: string, revision?: string, at?: string }
type Status = { state: string, online: boolean, releaseHeld?: boolean, live?: Release, job?: {
  id: string, attempt: number, approvals: Selection[], retryable?: boolean, reason?: string, deploymentId?: string, url?: string, updatedAt?: string,
} }
const stateLabel: Record<string, string> = {
  draft: '保存草稿', waiting: '等待执行器', queued: '排队中', building: '构建中',
  verifying: '部署验证中', published: '发布成功', failed: '发布失败',
  succeeded: '发布成功', disabled: '正式发布未启用',
  held: 'Production HOLD · 等待首次发布批准',
  unavailable: '发布状态暂不可读',
}
const kindLabel: Record<string, string> = { spot: 'Spot', note: 'Note', guide: 'Guide' }
const itemKey = (item: Selection) => item.kind + ':' + item.key

async function load<T>(route: string, payload?: unknown): Promise<T> {
  const response = await adminFetch(route, payload === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || '发布请求未确认，请刷新。'), { status: response.status, removalDigest: data.removalDigest, removed: data.removed })
  return data
}

export default function PublicationPanel({ formal = false }: { formal?: boolean }) {
  const [status, setStatus] = useState<Status>()
  const [items, setItems] = useState<Choice[]>()
  const [counts, setCounts] = useState<{added:number,modified:number,hidden:number}>()
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState<{ removalDigest: string, removed: Record<string, unknown[]> }>()
  const locked = useRef(false)
  const refresh = useCallback(async () => {
    try { setStatus(await load<Status>('/publication')) }
    catch (error) { if (formal) setStatus({ state: (error as { status?: number }).status === 405 ? 'disabled' : 'unavailable', online: false }); setNotice('发布尚未启用或状态暂不可读。') }
  }, [formal])
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
        load<{ items: Choice[], counts?: {added:number,modified:number,hidden:number} }>('/publication/catalog'), load<Status>('/publication'),
      ])
      setStatus(current)
      const approvals = current.job?.approvals ?? []
      setItems(next.items)
      setCounts(next.counts)
      setSelected(next.items.filter(item => item.eligible &&
        approvals.some(row => itemKey(row) === itemKey(item) && row.version === item.version)).map(itemKey))
    } catch (error) { setNotice((error as Error).message) }
    finally { locked.current = false; setBusy(false) }
  }
  async function submit(retry = false, approvedRemovalDigest?: string) {
    if (locked.current) return
    const selection = items?.filter(item => selected.includes(itemKey(item)))
      .map(({ kind, key, version, action }) => ({ kind, key, version, ...(formal ? { action: action || 'publish' } : {}) }))
    if (!retry && (!selection || !window.confirm(formal ? `将 ${selection.length} 条获批变更合入完整网站。其他合法内容保留；撤销会要求单独确认。继续？` : `将 ${selection.length} 条选定版本作为新的隔离公开网站。未选内容将从新版本撤下。继续？`))) return
    locked.current = true
    setBusy(true)
    setNotice('')
    try {
      const result = retry
        ? await load<{ id: string, duplicate?: boolean }>('/publication/retry', { id: status?.job?.id })
        : await load<{ id: string, duplicate?: boolean }>('/publication', { selection, ...(approvedRemovalDigest ? { approvedRemovalDigest } : {}) })
      setReview(undefined)
      setNotice(result.duplicate ? formal ? '所选版本已在当前网站，无需重复构建。' : '此版本已有发布任务。' : '发布申请已保存。')
      await refresh()
    } catch (error) { const detail = error as Error & { removalDigest?: string, removed?: Record<string, unknown[]> }
      if (formal && detail.removalDigest && detail.removed) setReview({ removalDigest: detail.removalDigest, removed: detail.removed })
      setNotice(detail.message) }
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
      {status?.releaseHeld && <p role="note">可以提交发布申请；执行器保持停用。取得首次 Production 批准并解除服务端 HOLD 后才会构建和发布。保存草稿不会入队。</p>}
      {counts && <p>待审批：新增 {counts.added} · 修改 {counts.modified} · 隐藏 {counts.hidden}</p>}
      {status?.job?.deploymentId && <p className="break-all">发布回执：{status.job.deploymentId} · {status.job.updatedAt || '完成时间未确认'}</p>}
      {status?.live && <p className="break-all">
        <a className="text-sky-200 underline" href={status.live.url} target="_blank" rel="noreferrer">{formal ? '打开当前正式网站' : '打开已验证的公开 Preview'}</a>
        {' · Deployment '}{status.live.deploymentId}
        {status.live.at && <> · 发布完成 {status.live.at}</>}
        {status.live.revision && <><br />公开版本 {status.live.revision}</>}
      </p>}
      <button type="button" disabled={busy || ['disabled', 'unavailable'].includes(status?.state || '')} className="rounded border px-3 py-1" onClick={prepare}>准备发布</button>
      {items && <fieldset className="space-y-2">
        <legend>{formal ? '本次批准的变更（合并完整公开基线）' : '本次批准的公开内容（完整替换上次范围）'}</legend>
        <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
          {items.map(item => <label key={itemKey(item)} className="flex gap-2 break-words">
            <input type="checkbox" disabled={!item.eligible || busy} checked={selected.includes(itemKey(item))}
              onChange={event => setSelected(event.target.checked ? [...selected, itemKey(item)] : selected.filter(key => key !== itemKey(item)))} />
            <span>{kindLabel[item.kind]} · {item.title} · {item.status === 'approval-required' ? '需明确批准' : item.status}</span>
          </label>)}
        </div>
        <button type="button" disabled={busy || !selected.length} onClick={() => void submit()} className="rounded bg-emerald-700 px-3 py-1 text-white">发布网站</button>
      </fieldset>}
      {status?.state === 'failed' && status.job?.retryable &&
        <button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={() => void submit(true)}>重试发布</button>}
      {notice && <p role="alert">{notice}</p>}
      {review && <div role="alert">将撤下 {Object.values(review.removed).reduce((total, rows) => total + rows.length, 0)} 条内容。
        <button type="button" disabled={busy} className="ml-3 rounded border px-3 py-1" onClick={() => {
          if (window.confirm('确认按服务器列出的精确差异撤下内容？')) void submit(false, review.removalDigest)
        }}>确认撤下并发布</button>
      </div>}
    </div>
  </details>
}
