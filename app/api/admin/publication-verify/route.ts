import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import { verifyPublication, publicationOrigin, readPublicationCatalog } from '@/lib/server/publication'
import { validPublicationPath, planPublication } from '@/lib/publication-plan'
import { publicationValueChecks } from '@/lib/server/publication-values'
import { internalPreviewHeaders } from '@/lib/internal-http'

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  try {
    const { checks, englishPaths = [], sourceOnly } = await request.json()
    if (!Array.isArray(checks) || checks.length > 1000 || (!checks.length && !['widget','affiliate'].includes(sourceOnly?.kind))) return NextResponse.json({ error: 'Invalid verification checks' }, { status: 400 })
    if(!checks.length) {
      const catalog=await readPublicationCatalog(sourceOnly.kind)
      const plan=planPublication(sourceOnly,catalog)
      const values=await publicationValueChecks(sourceOnly,catalog,plan)
      if(values.length) throw new Error('Rendered targets exist; HTML verification required')
      return NextResponse.json({ok:true,state:'verified',coverage:'no-html-consumers',results:[]},{headers:{'Cache-Control':'private, no-store'}})
    }
    if (!Array.isArray(englishPaths) || englishPaths.length > 1000 || !englishPaths.every(path=>typeof path==='string' && path.startsWith('/en') && validPublicationPath(path))) return NextResponse.json({error:'Invalid English scope'},{status:400})
    // The previous writer must finish flushing App tags before Pages ISR reads
    // shared prices/affiliates. Do this in the independent verification request.
    if (englishPaths.length) {
      const endpoint = new URL(`${publicationOrigin(request)}/api/admin/publication-revalidate`)
      const headers = internalPreviewHeaders(request, endpoint)
      headers.set('authorization', request.headers.get('authorization') || '')
      headers.set('Content-Type', 'application/json')
      const refreshed = await fetch(endpoint.href,{method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000),headers,body:JSON.stringify({paths:[...new Set(englishPaths)]})})
      if (!refreshed.ok || !(await refreshed.json()).ok) throw new Error('English ISR invalidation failed')
    }
    const result = await verifyPublication(request, checks)
    return NextResponse.json({ ...result, state: result.ok ? 'verified' : 'partial' }, { status: result.ok ? 200 : 503, headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ ok: false, state: 'partial', error: 'Public read-back failed; retry publication only.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
