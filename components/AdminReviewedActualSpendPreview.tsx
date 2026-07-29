'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

import GuideBudgetSection from '@/components/GuideBudgetSection'
import { adminFetch } from '@/lib/admin-fetch'
import type { GuideBudgetDisplaySnapshot } from '@/lib/guide-budget'
import type { TravelGuide } from '@/lib/guides'

type PreviewPayload = {
  guide: Pick<TravelGuide, 'budget' | 'budgetItems' | 'budgetScope'>
  snapshot: GuideBudgetDisplaySnapshot
}

export default function AdminReviewedActualSpendPreview({ guideSlug }: { guideSlug: string }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await adminFetch(`/api/admin/guide-budget-preview?guide_slug=${encodeURIComponent(guideSlug)}`, {
          cache: 'no-store',
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || 'Unable to load reviewed actual spend.')
        if (active) setPayload(body)
      } catch (reason: any) {
        if (active) setError(reason?.message || 'Unable to load reviewed actual spend.')
      }
    }
    void load()
    return () => { active = false }
  }, [guideSlug])

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

  if (!payload) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reviewed actual spend…
      </div>
    )
  }

  return (
    <GuideBudgetSection
      guide={payload.guide}
      actualSpend={payload.snapshot}
      showAdminSourceNote
    />
  )
}
