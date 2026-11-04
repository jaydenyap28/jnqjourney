import { NextResponse } from 'next/server'
import { extractLocationIdFromSlug } from '@/lib/location-routing'
import { readSpotRouting } from '@/lib/server/spot-routing'
import { getPublicSpotBySlug } from '@/lib/server/public-spot-resolver'
import { buildPublicCanonicalLocationPath } from '@/lib/server/location-slugs-store'
import { readLocalizationSnapshot } from '@/lib/server/localization-snapshot'
import { applyLocalization, localizationRecord } from '@/lib/localization'

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-JNQ-SEO-Indexable': 'false' }
  const id = extractLocationIdFromSlug(params.slug)
  if (!id || !Number.isSafeInteger(id) || id <= 0 || params.slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.slug)) return NextResponse.json({ visible: false }, { status: 404, headers })
  try {
    const routing = await readSpotRouting(id)
    if (routing.destination || !routing.visible) return NextResponse.json(routing, { headers })
    // The Middleware needs availability, not a second HTTP call carrying the
    // entire gallery. Visibility/redirects still use the live authoritative read.
    const resolved = await getPublicSpotBySlug(params.slug)
    if (!resolved) return NextResponse.json({ visible: false }, { status: 404, headers })
    // A page-level redirect can become a streamed 200 after loading.tsx starts.
    // Resolve aliases in the existing pre-response gate instead.
    const canonical = await buildPublicCanonicalLocationPath(resolved.spot.name, id)
    if (params.slug !== canonical.slice('/spot/'.length)) {
      const prefix = new URL(request.url).searchParams.get('locale') === 'en' ? '/en' : ''
      return NextResponse.json({ ...routing, destination: `${prefix}${canonical}`, status: 301 }, { headers })
    }
    let indexable = resolved.source !== 'static-fallback' && resolved.quality.indexable
    if (indexable && new URL(request.url).searchParams.get('locale') === 'en') {
      try {
        const snapshot = await readLocalizationSnapshot('en')
        const source = { ...resolved.spot, title: resolved.spot.name }
        indexable = applyLocalization(source, localizationRecord(snapshot, 'spot', id)).status === 'complete'
      } catch { indexable = false }
    }
    // API JSON itself is never indexed; Middleware consumes the eligibility bit.
    return NextResponse.json(routing, { headers: { ...headers, 'X-JNQ-Data-Source': resolved.source, 'X-JNQ-SEO-Indexable': String(indexable) } })
  } catch {
    return NextResponse.json({ error: 'Spot routing temporarily unavailable.' }, { status: 503, headers })
  }
}
