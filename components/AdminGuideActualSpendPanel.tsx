'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, RefreshCw, RotateCcw, Send, ShieldAlert, X } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import {
  formatSnapshotMoney,
  type GuideBudgetSnapshotRecord,
} from '@/lib/guide-budget'
import type { TravelGuide } from '@/lib/guides'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function estimatedTotal(guide: TravelGuide) {
  const declared = Number(String(guide.budget || '').replace(/[^0-9.-]/g, ''))
  if (Number.isFinite(declared) && declared) return declared
  return guide.budgetItems.reduce((sum, item) => {
    const amount = Number(String(item.amount || '').replace(/[^0-9.-]/g, ''))
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

function statusLabel(status: GuideBudgetSnapshotRecord['review_status']) {
  return {
    imported: '待审核',
    reviewed: '已审核',
    published: '已发布',
    rejected: '已拒绝',
  }[status]
}

export default function AdminGuideActualSpendPanel({ guide }: { guide: TravelGuide }) {
  const [snapshots, setSnapshots] = useState<GuideBudgetSnapshotRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const baseline = useMemo(() => estimatedTotal(guide), [guide])

  const load = useCallback(async () => {
    if (!guide.slug) {
      setSnapshots([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await adminFetch(
        `/api/admin/guide-budget-snapshots?guide_slug=${encodeURIComponent(guide.slug)}`,
        { cache: 'no-store' }
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || '无法读取实际花费快照。')
      setSnapshots(body.snapshots || [])
    } catch (reason: any) {
      setError(reason?.message || '无法读取实际花费快照。')
    } finally {
      setLoading(false)
    }
  }, [guide.slug])

  useEffect(() => {
    void load()
  }, [load])

  async function act(snapshot: GuideBudgetSnapshotRecord, action: string) {
    setBusyId(snapshot.id)
    setError('')
    try {
      const response = await adminFetch('/api/admin/guide-budget-snapshots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: snapshot.id, action }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || '快照操作失败。')
      await load()
    } catch (reason: any) {
      setError(reason?.message || '快照操作失败。')
    } finally {
      setBusyId('')
    }
  }

  return (
    <Card className="border-emerald-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>实际花费</CardTitle>
          <CardDescription className="mt-2">
            MoneyBot 导入只会进入待审核，不会覆盖手填预算，也不会自动公开。
          </CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          手动刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}
        {!guide.slug ? (
          <p className="text-sm text-slate-500">请先保存 Guide，才能接收对应的实际花费快照。</p>
        ) : loading && !snapshots.length ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />读取快照…
          </div>
        ) : snapshots.length ? (
          snapshots.map((snapshot) => {
            const categoryTotal = Object.values(snapshot.categories).reduce((sum, value) => sum + Number(value), 0)
            const delta = baseline ? Number(snapshot.total) - baseline : null
            const busy = busyId === snapshot.id
            return (
              <article key={snapshot.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        {statusLabel(snapshot.review_status)}
                      </span>
                      <span className="text-xs text-slate-500">
                        MoneyBot Project「{snapshot.source_project_name}」· v{snapshot.snapshot_version}
                      </span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-950">
                      {formatSnapshotMoney(snapshot.currency, snapshot.total)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {snapshot.transaction_count} 笔 · {snapshot.scope} · 同步于{' '}
                      {new Date(snapshot.received_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="text-right text-xs leading-5 text-slate-500">
                    <p>分类合计：{formatSnapshotMoney(snapshot.currency, categoryTotal)}</p>
                    <p>未分类：{formatSnapshotMoney(snapshot.currency, snapshot.unclassified_amount)}</p>
                    {delta !== null ? (
                      <p>与手填预算差异：{formatSnapshotMoney(snapshot.currency, delta.toFixed(2))}</p>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(snapshot.categories).map(([category, amount]) => (
                    <div key={category} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm">
                      <dt className="text-slate-600">{category}</dt>
                      <dd className="font-medium tabular-nums text-slate-900">{amount}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {snapshot.review_status === 'imported' && Number(snapshot.unclassified_amount) === 0 ? (
                    <Button type="button" size="sm" onClick={() => act(snapshot, 'review')} disabled={busy}>
                      <Check className="mr-2 h-4 w-4" />采用为实际花费
                    </Button>
                  ) : null}
                  {snapshot.review_status === 'imported' && Number(snapshot.unclassified_amount) !== 0 ? (
                    <Button type="button" size="sm" onClick={() => act(snapshot, 'merge_unclassified')} disabled={busy}>
                      <Check className="mr-2 h-4 w-4" />确认并入 Other
                    </Button>
                  ) : null}
                  {snapshot.review_status === 'imported' ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => act(snapshot, 'reject')} disabled={busy}>
                      <X className="mr-2 h-4 w-4" />拒绝
                    </Button>
                  ) : null}
                  {snapshot.review_status === 'reviewed' ? (
                    <>
                      <Link href={`/admin/guides/${encodeURIComponent(guide.slug)}/actual-spend-preview`}>
                        <Button type="button" size="sm" variant="outline">审核预览</Button>
                      </Link>
                      <Button type="button" size="sm" onClick={() => act(snapshot, 'publish')} disabled={busy}>
                        <Send className="mr-2 h-4 w-4" />发布
                      </Button>
                    </>
                  ) : null}
                  {snapshot.review_status === 'reviewed' && snapshots.some((item) => item.review_status === 'published') ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => act(snapshot, 'restore')} disabled={busy}>
                      <RotateCcw className="mr-2 h-4 w-4" />恢复这个旧快照
                    </Button>
                  ) : null}
                </div>
              </article>
            )
          })
        ) : (
          <p className="text-sm text-slate-500">尚未收到 MoneyBot 快照。</p>
        )}
      </CardContent>
    </Card>
  )
}
