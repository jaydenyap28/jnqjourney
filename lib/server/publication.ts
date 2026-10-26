import { revalidatePath, revalidateTag } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { planPublication, validPublicationPath, type PublicationChange, type PublicationCatalog, type PublicationPlan } from '@/lib/publication-plan'
import { publicationVersion, spotPublicationVersion } from '@/lib/publication-version'
import { readAuthoritativePublicSpotById } from '@/lib/server/public-spot-resolver'
import { normalizeGuidePayload } from '@/lib/server/guides-store'
import { normalizeNotePayload } from '@/lib/server/notes-store'
import { getSiteUrl } from '@/lib/site'
import { publicationValueChecks } from '@/lib/server/publication-values'
import { internalPreviewHeaders } from '@/lib/internal-http'
import { verifyHtmlValues, type HtmlValue } from '@/lib/publication-html'

export interface PublicationCheck { path: string; status: number; version?: string; htmlPath?: string; includes?: string; unverified?: string; values?: HtmlValue[] }
export interface PublicationReceipt {
  state: 'verification-required'
  change: PublicationChange
  plan: PublicationPlan
  checks: PublicationCheck[]
  noHtmlConsumers?: boolean
  retry: { url: string; body: PublicationChange }
}

export function publicationOrigin(request: Request): string {
  const url = new URL(request.url)
  const allowed = new Set([getSiteUrl().origin, ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])])
  const local = !process.env.VERCEL_ENV && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!local && !allowed.has(url.origin)) throw new Error('Untrusted publication origin')
  return url.origin
}

export async function readPublicationCatalog(kind: PublicationChange['kind']): Promise<PublicationCatalog> {
  const base = String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  if (!base) throw new Error('Public snapshot source is unavailable for publication verification')
  const read = async (key: string, field: string) => {
    const response = await fetch(`${base}/public-data/${key}.json?publication=${randomUUID()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Published relationship snapshot unavailable')
    const value = await response.json()
    if (value.schemaVersion !== 1 || !Array.isArray(value[field])) throw new Error('Invalid published relationship snapshot')
    return value[field]
  }
  const [locations, regions, guides, notes] = await Promise.all([read('locations', 'locations'), read('regions', 'regions'), read('guides', 'guides'), read('notes', 'notes')])
  let relatedNoteSlugsBySpot: Record<string, string[]> | undefined
  if (kind === 'note') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Note backlink verification requires the authoritative relationship source')
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } })
    const { data, error } = await supabase.from('locations').select('id,related_note_slugs').eq('status', 'active')
    if (error) throw new Error('Unable to read Note backlinks; invalidation scope is incomplete')
    relatedNoteSlugsBySpot = Object.fromEntries((data || []).map(row => [row.id, row.related_note_slugs || []]))
  }
  const englishVersions = Object.fromEntries([...guides.map((item: any) => [`guide:${item.slug}`, publicationVersion(item)]), ...notes.map((item: any) => [`note:${item.slug}`, publicationVersion(item)])])
  return { locations, regions, guides: guides.map((item: unknown) => normalizeGuidePayload(item)), notes: notes.map(normalizeNotePayload), relatedNoteSlugsBySpot, englishVersions }
}

/** Mutation has already committed. This phase never repeats that mutation. */
export async function invalidatePublication(request: Request, change: PublicationChange, previous: Partial<PublicationCatalog> = {}): Promise<PublicationReceipt> {
  try { return await invalidate(request,change,previous) }
  catch(error) { if(error && typeof error==='object' && !('change' in error)) Object.assign(error,{change}); throw error }
}

async function invalidate(request: Request, change: PublicationChange, previous: Partial<PublicationCatalog>): Promise<PublicationReceipt> {
  const catalog = { ...await readPublicationCatalog(change.kind), ...previous }
  const plan = planPublication(change, catalog)
  change = { ...change, previousPaths: plan.paths, previousEnglishPaths: plan.englishPaths }
  for (const tag of plan.tags) revalidateTag(tag)
  for (const route of plan.paths) revalidatePath(route)
  const checks: PublicationCheck[] = []
  if (change.kind === 'guide' || change.kind === 'note') {
    const values = change.kind === 'guide' ? catalog.guides : catalog.notes
    for (const slug of new Set([...(change.slugs || []), ...(change.previousSlugs || [])])) {
      const item = values.find(value => value.slug === slug || value.aliases?.includes(slug))
      const root = change.kind === 'guide' ? 'guides' : 'notes'
      checks.push({ path: `/api/${root}?slug=${encodeURIComponent(slug)}`, status: item ? 200 : 404,
        ...(item ? { version: publicationVersion(item) } : {}), htmlPath: `/${change.kind === 'guide' ? 'guide' : 'notes'}/${slug}` })
      checks.push({ path: `/en/${change.kind === 'guide' ? 'guide' : 'notes'}/${slug}`, status: item ? 200 : 404, ...(item ? { includes: catalog.englishVersions?.[`${change.kind}:${item.slug}`] || publicationVersion(item) } : {}) })
    }
  }
  for (const id of change.kind === 'spot' ? change.ids || [] : []) {
    const spot = await readAuthoritativePublicSpotById(id)
    const location = catalog.locations.find(value => value.id === id)
    const slug = spot?.slug || location?.slug || `spot-${id}`
    checks.push({ path: `/api/spots/spot-${id}`, status: spot ? 200 : 404, ...(spot ? { version: spotPublicationVersion(spot as unknown as Record<string, unknown>) } : {}), htmlPath: `/spot/${slug}` })
    checks.push({ path: `/en/spot/${location?.slug || slug}`, status: spot ? 200 : 404, ...(spot ? { includes: spotPublicationVersion(spot as unknown as Record<string, unknown>) } : {}) })
  }
  if (['price', 'widget', 'affiliate'].includes(change.kind)) {
    checks.push(...await publicationValueChecks(change,catalog,plan))
  }
  // Additional HTML consumers are verified independently after the Route
  // Handler has returned and Next 14 has flushed its pending tag invalidations.
  // Do not eagerly generate every never-visited neighbour/detail during a save.
  // Exact dependency coverage is asserted by plan tests; read back changed
  // identities plus the small public collection surfaces independently.
  for (const route of plan.paths.filter(route => ['/', '/guide', '/notes', '/search', '/region', '/sitemap.xml'].includes(route) && !checks.some(check => check.path === route))) checks.push({ path: route, status: 200 })
  return { state: 'verification-required', change, plan, checks, ...(!checks.length && ['widget','affiliate'].includes(change.kind) ? {noHtmlConsumers:true} : {}), retry: { url: '/api/admin/publication-retry', body: change } }
}

export function publicationResponse(payload: Record<string, unknown>, receipt: PublicationReceipt, status = 200) {
  return NextResponse.json({ ...payload, publication: receipt }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-JNQ-Publication-Verification': 'required' } })
}

export function publicationFailure(error: unknown, change: PublicationChange, persisted = true, mutation?: unknown) {
  if (error && typeof error === 'object' && 'change' in error) {
    const failedChange=error.change as PublicationChange
    change={...change,...failedChange,previousPaths:[...new Set([...(change.previousPaths || []),...(failedChange.previousPaths || [])])],previousEnglishPaths:[...new Set([...(change.previousEnglishPaths || []),...(failedChange.previousEnglishPaths || [])])]}
  }
  const snapshotFailed = !!error && typeof error === 'object' && 'stage' in error && error.stage === 'snapshot'
  return NextResponse.json({ ok: false, partial: persisted, persisted, ...(mutation ? {mutation} : {}), publication: { state: 'partial', stage: snapshotFailed ? 'snapshot' : 'invalidation',
    retry: { url: snapshotFailed ? '/api/admin/public-data/spots/batch' : '/api/admin/publication-retry', body: change } },
    error: `Authoritative save may already be committed.${mutation && typeof mutation==='object' && 'affected' in mutation && 'expected' in mutation ? ` ${mutation.affected}/${mutation.expected} database rows confirmed.` : ''} Public publication/verification failed: ${error instanceof Error ? error.message : 'unknown failure'}. Retry publication only; do not repeat the database mutation.` },
  { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function verifyPublication(request: Request, checks: PublicationCheck[]) {
  if (!checks.length) throw new Error('Publication verification requires at least one target')
  const results = []
  for (const check of checks) {
    if (!check || typeof check.path !== 'string' || !check.path.startsWith('/') || check.path.startsWith('//')) throw new Error('Invalid verification identity')
    const parsed = new URL(check.path, 'http://local')
    if (!validPublicationPath(parsed.pathname) || ![200, 404].includes(check.status)) throw new Error('Invalid publication verification target')
    if (check.htmlPath && (!validPublicationPath(check.htmlPath) || !/^\/(spot|guide|notes)\//.test(check.htmlPath))) throw new Error('Invalid HTML verification target')
    const get = async (target: string) => {
      for (let hop = 0; hop < 3; hop++) {
        const endpoint = new URL(`${publicationOrigin(request)}${target}`)
        const response = await fetch(endpoint.href, { cache: 'no-store', redirect: 'manual', headers: internalPreviewHeaders(request, endpoint), signal: AbortSignal.timeout(30000) })
        const text = await response.text()
        if (![301, 302, 307, 308].includes(response.status)) return { response, text }
        const destination = new URL(response.headers.get('location') || '', publicationOrigin(request))
        if (destination.origin !== publicationOrigin(request) || !validPublicationPath(destination.pathname)) throw new Error('Invalid public redirect')
        target = destination.pathname
      }
      throw new Error('Publication redirect cycle')
    }
    const { response, text } = await get(check.path)
    // Canonical redirects are valid only if their destination is also public.
    let passed = response.status === check.status && !check.unverified
    if (check.version && response.headers.get('X-JNQ-Content-Version') !== check.version) passed = false
    if (check.includes && !text.includes(check.includes)) passed = false
    if (check.values && !verifyHtmlValues(text,check.values)) passed = false
    if (check.htmlPath) {
      const html = await get(check.htmlPath)
      passed &&= html.response.status === check.status
      if (check.status === 404) passed &&= /name="robots"[^>]+content="[^\"]*noindex/.test(html.text) || (html.response.headers.get('X-Robots-Tag') || '').includes('noindex')
      if (check.version && !html.text.includes(`content="${check.version}"`)) passed = false
    }
    results.push({ path: check.path, status: response.status, cache: response.headers.get('x-nextjs-cache'), cacheControl: response.headers.get('cache-control'), version: response.headers.get('X-JNQ-Content-Version'), ...(check.unverified ? { error: check.unverified } : {}), passed })
  }
  return { ok: results.every(result => result.passed), results }
}
