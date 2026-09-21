import { NextRequest, NextResponse } from 'next/server'

import { GUIDE_DISPLAY_CURRENCIES, normalizeGuideDisplayCurrency } from '@/lib/guide-budget'

const FX_REVALIDATE_SECONDS = 60 * 60 * 6

type FrankfurterRate = { date?: unknown; quote?: unknown; rate?: unknown }

export async function GET(request: NextRequest) {
  const base = normalizeGuideDisplayCurrency(request.nextUrl.searchParams.get('base'))
  if (!base) {
    return NextResponse.json({ error: 'Unsupported base currency.' }, { status: 400 })
  }

  const quotes = GUIDE_DISPLAY_CURRENCIES.filter((currency) => currency !== base).join(',')
  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quotes}`, {
      next: { revalidate: FX_REVALIDATE_SECONDS },
    })
    if (!response.ok) throw new Error(`Frankfurter request failed with ${response.status}`)

    const rows = await response.json() as FrankfurterRate[]
    if (!Array.isArray(rows)) throw new Error('Frankfurter returned an invalid rates payload.')

    const rates = Object.fromEntries(rows.flatMap((row) => {
      const quote = normalizeGuideDisplayCurrency(row.quote)
      const rate = Number(row.rate)
      return quote && quote !== base && Number.isFinite(rate) && rate > 0 ? [[quote, rate]] : []
    }))
    const date = rows.map((row) => String(row.date || '')).find(Boolean)
    if (!date || !Object.keys(rates).length) throw new Error('Frankfurter returned no usable rates.')

    return NextResponse.json(
      { date, rates },
      { headers: { 'Cache-Control': `public, s-maxage=${FX_REVALIDATE_SECONDS}, stale-while-revalidate=3600` } }
    )
  } catch {
    return NextResponse.json({ error: 'FX temporarily unavailable.' }, { status: 503 })
  }
}
