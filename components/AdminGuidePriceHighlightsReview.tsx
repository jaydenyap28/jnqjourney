'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, PencilLine, ShieldAlert, X } from 'lucide-react'

import GuidePriceHighlightsSection from '@/components/GuidePriceHighlightsSection'
import { adminFetch } from '@/lib/admin-fetch'
import {
  GUIDE_PRICE_EVIDENCE_STATUSES,
  GUIDE_PRICE_UNITS,
  formatPriceHighlightAmount,
  type GuidePriceHighlight,
  type PublicGuidePriceHighlight,
} from '@/lib/guide-price-highlights'

const evidenceLabels = {
  confirmed: 'confirmed / 资料一致',
  conflict: 'conflict / 金额冲突',
  missing: 'missing / 缺少字段',
}

function previewRecord(record: GuidePriceHighlight): PublicGuidePriceHighlight {
  const {
    sources: _sources,
    confidence: _confidence,
    evidenceStatus: _evidenceStatus,
    reviewStatus: _reviewStatus,
    conflictGroup: _conflictGroup,
    conflictDetails: _conflictDetails,
    ...publicRecord
  } = record
  return publicRecord
}

function canApprove(record: GuidePriceHighlight) {
  return Boolean(
    record.evidenceStatus === 'confirmed' &&
      record.amountMinor > 0 &&
      record.unit !== 'unspecified' &&
      record.paidDate
  )
}

function toneFor(record: GuidePriceHighlight) {
  if (record.reviewStatus === 'approved') return 'border-emerald-300/24 bg-emerald-300/[0.055]'
  if (record.reviewStatus === 'rejected') return 'border-red-300/20 bg-red-400/[0.045]'
  if (record.evidenceStatus === 'conflict') return 'border-orange-300/22 bg-orange-300/[0.055]'
  if (record.evidenceStatus === 'missing') return 'border-sky-300/20 bg-sky-300/[0.045]'
  return 'border-white/10 bg-white/[0.035]'
}

export function GuidePriceHighlightsReviewPanel({
  initialRecords,
  onSave,
}: {
  initialRecords: GuidePriceHighlight[]
  onSave?: (records: GuidePriceHighlight[]) => Promise<void>
}) {
  const [records, setRecords] = useState(initialRecords)
  const [savingId, setSavingId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => setRecords(initialRecords), [initialRecords])

  const preview = useMemo(
    () =>
      records
        .filter(
          (record) =>
            record.isKeyPrice &&
            record.confidence === 'high' &&
            record.evidenceStatus === 'confirmed' &&
            record.amountMinor > 0 &&
            record.unit !== 'unspecified' &&
            record.paidDate &&
            record.reviewStatus !== 'rejected'
        )
        .map(previewRecord),
    [records]
  )

  function updateRecord(id: string, patch: Partial<GuidePriceHighlight>) {
    setRecords((current) =>
      current.map((record) => (record.id === id ? { ...record, ...patch } : record))
    )
  }

  async function persist(id: string, nextStatus?: GuidePriceHighlight['reviewStatus']) {
    if (!onSave) return
    const next = records.map((record) =>
      record.id === id && nextStatus ? { ...record, reviewStatus: nextStatus } : record
    )
    setSavingId(id)
    setMessage('')
    try {
      await onSave(next)
      setRecords(next)
      setMessage('审核状态已保存。只有 approved 且字段完整的价格才会进入公开读取层。')
    } catch (error: any) {
      setMessage(error?.message || '无法保存价格审核结果。')
    } finally {
      setSavingId('')
    }
  }

  const counts = records.reduce(
    (total, record) => {
      total[record.evidenceStatus] += 1
      return total
    },
    { confirmed: 0, conflict: 0, missing: 0 }
  )

  return (
    <div className="space-y-10">
      <section className="grid gap-3 sm:grid-cols-3">
        {GUIDE_PRICE_EVIDENCE_STATUSES.map((status) => (
          <div key={status} className="border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/42">{evidenceLabels[status]}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{counts[status]}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="border-b border-white/10 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-200/70">
            Admin preview / 可靠候选版面
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">
            此预览只选取证据一致、单位与日期完整的高置信候选；它们仍是 pending，不会出现在公开 Guide。
          </p>
        </div>
        <div className="mt-6">
          <GuidePriceHighlightsSection highlights={preview} />
        </div>
      </section>

      <section>
        <div className="border-b border-white/10 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">
            Review queue / 候选审核
          </p>
          <h2 className="mt-2 font-display text-3xl text-white md:text-4xl">价格证据与公开决定</h2>
        </div>

        <div className="mt-5 space-y-4">
          {records.map((record) => (
            <article key={record.id} className={`border p-4 md:p-5 ${toneFor(record)}`}>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/58">
                      Day {record.dayNumber}
                    </span>
                    <span className="border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-white/58">
                      {evidenceLabels[record.evidenceStatus]}
                    </span>
                    <span className="border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-white/58">
                      {record.reviewStatus}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold leading-tight text-white">{record.titleZh}</h3>
                  {record.optionLabelZh ? <p className="mt-1 text-sm text-white/52">{record.optionLabelZh}</p> : null}
                  <p className="mt-3 break-words text-2xl font-semibold tabular-nums text-white">
                    {formatPriceHighlightAmount(record.currency, record.amountMinor)}
                  </p>
                  <p className="mt-2 break-all text-xs text-white/35">{record.attractionSlug}</p>

                  {record.conflictDetails?.length ? (
                    <div className="mt-4 border-l-2 border-orange-300/50 pl-3 text-sm leading-6 text-orange-100/78">
                      {record.conflictDetails.map((detail) => <p key={detail}>{detail}</p>)}
                    </div>
                  ) : null}

                  <details className="mt-4 border-t border-white/8 pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-white/58">查看来源上下文</summary>
                    <div className="mt-3 space-y-3">
                      {record.sources.map((source) => (
                        <div key={`${record.id}-${source.sourceReference}`} className="border-l border-white/12 pl-3">
                          <p className="break-all text-[11px] text-white/38">{source.sourceType} · {source.sourceReference}</p>
                          <p className="mt-1 text-sm leading-6 text-white/68">{source.context}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>

                <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="text-xs text-white/48">
                    amountMinor
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={record.amountMinor}
                      onChange={(event) => updateRecord(record.id, { amountMinor: Number(event.target.value) })}
                      className="mt-1.5 min-h-11 w-full border border-white/12 bg-black/20 px-3 text-sm tabular-nums text-white outline-none focus:border-amber-300/45"
                    />
                  </label>
                  <label className="text-xs text-white/48">
                    unit
                    <select
                      value={record.unit}
                      onChange={(event) => updateRecord(record.id, { unit: event.target.value as GuidePriceHighlight['unit'] })}
                      className="mt-1.5 min-h-11 w-full border border-white/12 bg-[#0b111d] px-3 text-sm text-white outline-none focus:border-amber-300/45"
                    >
                      {GUIDE_PRICE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-white/48">
                    paidDate
                    <input
                      type="date"
                      value={record.paidDate || ''}
                      onChange={(event) => updateRecord(record.id, { paidDate: event.target.value || null })}
                      className="mt-1.5 min-h-11 w-full border border-white/12 bg-black/20 px-3 text-sm text-white outline-none focus:border-amber-300/45"
                    />
                  </label>
                  <label className="text-xs text-white/48">
                    evidenceStatus
                    <select
                      value={record.evidenceStatus}
                      onChange={(event) =>
                        updateRecord(record.id, {
                          evidenceStatus: event.target.value as GuidePriceHighlight['evidenceStatus'],
                        })
                      }
                      className="mt-1.5 min-h-11 w-full border border-white/12 bg-[#0b111d] px-3 text-sm text-white outline-none focus:border-amber-300/45"
                    >
                      {GUIDE_PRICE_EVIDENCE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>

                  <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
                    <button
                      type="button"
                      onClick={() => persist(record.id, 'approved')}
                      disabled={!canApprove(record) || Boolean(savingId)}
                      className="inline-flex min-h-10 items-center gap-1.5 border border-emerald-300/24 bg-emerald-300/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {savingId === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => persist(record.id)}
                      disabled={Boolean(savingId) || !onSave}
                      className="inline-flex min-h-10 items-center gap-1.5 border border-white/12 bg-white/[0.045] px-3 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] disabled:opacity-35"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      Save edit
                    </button>
                    <button
                      type="button"
                      onClick={() => persist(record.id, 'rejected')}
                      disabled={Boolean(savingId)}
                      className="inline-flex min-h-10 items-center gap-1.5 border border-red-300/18 bg-red-300/[0.055] px-3 text-xs font-medium text-red-100/78 transition hover:bg-red-300/10 disabled:opacity-35"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {message ? <p className="border-l-2 border-amber-300/45 pl-3 text-sm leading-6 text-white/65">{message}</p> : null}
    </div>
  )
}

export default function AdminGuidePriceHighlightsReview({ guideSlug }: { guideSlug: string }) {
  const [records, setRecords] = useState<GuidePriceHighlight[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await adminFetch(`/api/admin/guide-price-highlights?guide_slug=${encodeURIComponent(guideSlug)}`, {
          cache: 'no-store',
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || 'Unable to load price highlights.')
        if (active) setRecords(body.records)
      } catch (reason: any) {
        if (active) setError(reason?.message || 'Unable to load price highlights.')
      }
    }
    void load()
    return () => { active = false }
  }, [guideSlug])

  async function save(next: GuidePriceHighlight[]) {
    const response = await adminFetch('/api/admin/guide-price-highlights', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guideSlug, records: next }),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body?.error || 'Unable to save price highlights.')
    setRecords(body.records)
  }

  if (error) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center px-4">
        <div className="flex max-w-lg items-start gap-3 border border-red-300/20 bg-red-500/10 p-5 text-sm leading-6 text-red-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!records) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading price evidence…
      </div>
    )
  }

  return <GuidePriceHighlightsReviewPanel initialRecords={records} onSave={save} />
}
