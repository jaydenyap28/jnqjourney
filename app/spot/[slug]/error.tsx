'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function SpotError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[spot-detail]', error)
  }, [error])

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-6 text-white">
      <section className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300">Spot temporarily unavailable</p>
        <h1 className="mt-3 text-3xl font-bold">This place could not be loaded right now.</h1>
        <p className="mt-4 text-slate-300">Please try again shortly. The map, search, and region pages remain available.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="rounded-full bg-amber-400 px-5 py-2.5 font-semibold text-slate-950">
            Try again
          </button>
          <Link href="/" className="rounded-full border border-white/20 px-5 py-2.5 font-semibold text-white">
            Back to map
          </Link>
        </div>
      </section>
    </main>
  )
}
