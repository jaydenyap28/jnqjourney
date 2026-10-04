import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REPORT_TIME_ZONE = 'Asia/Singapore'
const PAGE_SIZE = 1000
const MAX_ROWS = 50000

type PageViewRow = {
  path?: string | null
  content_type?: string | null
  content_slug?: string | null
  session_id?: string | null
  visitor_id?: string | null
  visit_id?: string | null
  device_type?: string | null
  traffic_source?: string | null
  traffic_medium?: string | null
  traffic_campaign?: string | null
  referrer?: string | null
  user_agent?: string | null
  viewed_at?: string | null
}

type AffiliateClickRow = {
  affiliate_link_id?: number | null
  session_id?: string | null
  visitor_id?: string | null
  visit_id?: string | null
  traffic_source?: string | null
  traffic_medium?: string | null
  traffic_campaign?: string | null
  clicked_at?: string | null
  affiliate_links?: {
    id?: number | null
    title?: string | null
    provider?: string | null
    link_type?: string | null
    locations?: { name?: string | null; name_cn?: string | null } | null
    regions?: { name?: string | null; name_cn?: string | null } | null
  } | null
}

type AnalyticsEventRow = {
  event_name?: string | null
  path?: string | null
  session_id?: string | null
  visitor_id?: string | null
  visit_id?: string | null
  device_type?: string | null
  traffic_source?: string | null
  traffic_medium?: string | null
  traffic_campaign?: string | null
  package_id?: number | null
  option_id?: number | null
  source_code?: string | null
  params?: Record<string, unknown> | null
  occurred_at?: string | null
}

type RankedBucket = {
  key: string
  label?: string
  views: number
  visitors: Set<string>
}

type DateRange = {
  from: Date
  to: Date
  fromLabel: string
  toLabel: string
}

type ReportSupabaseClient = SupabaseClient<any, any, any>

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) return null
  return createClient(supabaseUrl, serviceRoleKey || anonKey || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function formatDateInReportZone(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10)
}

function isDateInput(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function startOfReportDay(value: string) {
  return new Date(`${value}T00:00:00+08:00`)
}

function endOfReportDay(value: string) {
  return new Date(`${value}T23:59:59.999+08:00`)
}

function parseDateRange(request: Request): DateRange | null {
  const url = new URL(request.url)
  const toInput = url.searchParams.get('to')
  const fromInput = url.searchParams.get('from')
  const today = formatDateInReportZone(new Date())

  if ((toInput && !isDateInput(toInput)) || (fromInput && !isDateInput(fromInput))) return null

  const toLabel = toInput || today
  const to = endOfReportDay(toLabel)
  if (Number.isNaN(to.getTime())) return null

  let fromLabel = fromInput
  if (!fromLabel) {
    const fromDate = new Date(startOfReportDay(toLabel).getTime())
    fromDate.setDate(fromDate.getDate() - 29)
    fromLabel = formatDateInReportZone(fromDate)
  }

  const from = startOfReportDay(fromLabel)
  if (Number.isNaN(from.getTime()) || from > to) return null
  return { from, to, fromLabel, toLabel }
}

function buildPreviousRange(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime() + 1
  const previousTo = new Date(range.from.getTime() - 1)
  const previousFrom = new Date(previousTo.getTime() - durationMs + 1)
  return {
    from: previousFrom,
    to: previousTo,
    fromLabel: formatDateInReportZone(previousFrom),
    toLabel: formatDateInReportZone(previousTo),
  }
}

async function fetchPageViews(supabase: ReportSupabaseClient, range: DateRange) {
  const rows: PageViewRow[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const result = await supabase
      .from('page_views')
      .select('path, content_type, content_slug, session_id, visitor_id, visit_id, device_type, traffic_source, traffic_medium, traffic_campaign, referrer, user_agent, viewed_at')
      .gte('viewed_at', range.from.toISOString())
      .lte('viewed_at', range.to.toISOString())
      .order('viewed_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (result.error) return { rows, error: result.error.message, truncated: false }
    rows.push(...((result.data || []) as PageViewRow[]))
    if (!result.data || result.data.length < PAGE_SIZE) return { rows, error: null, truncated: false }
  }
  return { rows, error: null, truncated: true }
}

async function fetchAffiliateClicks(supabase: ReportSupabaseClient, range: DateRange) {
  const rows: AffiliateClickRow[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const result = await supabase
      .from('affiliate_clicks')
      .select(`
        affiliate_link_id,
        session_id,
        visitor_id,
        visit_id,
        traffic_source,
        traffic_medium,
        traffic_campaign,
        clicked_at,
        affiliate_links:affiliate_link_id (
          id,
          title,
          provider,
          link_type,
          locations:location_id (name, name_cn),
          regions:region_id (name, name_cn)
        )
      `)
      .gte('clicked_at', range.from.toISOString())
      .lte('clicked_at', range.to.toISOString())
      .order('clicked_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (result.error) return { rows, error: result.error.message, truncated: false }
    rows.push(...((result.data || []) as AffiliateClickRow[]))
    if (!result.data || result.data.length < PAGE_SIZE) return { rows, error: null, truncated: false }
  }
  return { rows, error: null, truncated: true }
}

async function fetchAnalyticsEvents(supabase: ReportSupabaseClient, range: DateRange) {
  const rows: AnalyticsEventRow[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const result = await supabase
      .from('analytics_events')
      .select('event_name, path, session_id, visitor_id, visit_id, device_type, traffic_source, traffic_medium, traffic_campaign, package_id, option_id, source_code, params, occurred_at')
      .gte('occurred_at', range.from.toISOString())
      .lte('occurred_at', range.to.toISOString())
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (result.error) return { rows, error: result.error.message, truncated: false }
    rows.push(...((result.data || []) as AnalyticsEventRow[]))
    if (!result.data || result.data.length < PAGE_SIZE) return { rows, error: null, truncated: false }
  }
  return { rows, error: null, truncated: true }
}

function normalizePath(value?: string | null) {
  const rawValue = String(value || '/').trim() || '/'
  try {
    const url = rawValue.startsWith('http') ? new URL(rawValue) : new URL(rawValue, 'https://jnqjourney.local')
    return url.pathname.replace(/\/+$/, '') || '/'
  } catch {
    const [pathOnly] = rawValue.split(/[?#]/)
    return (pathOnly || '/').replace(/\/+$/, '') || '/'
  }
}

function trackingParams(value?: string | null) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return new URLSearchParams()
  try {
    const url = rawValue.startsWith('http') ? new URL(rawValue) : new URL(rawValue, 'https://jnqjourney.local')
    return url.searchParams
  } catch {
    const query = rawValue.includes('?') ? rawValue.split('?').slice(1).join('?') : ''
    return new URLSearchParams(query)
  }
}

function normalizeHost(value?: string | null) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  try {
    const url = new URL(rawValue)
    return (url.hostname || url.pathname.split('/')[0] || '').replace(/^www\./, '').toLowerCase()
  } catch {
    return rawValue.replace(/^www\./, '').toLowerCase()
  }
}

function getSiteHost() {
  return normalizeHost(process.env.NEXT_PUBLIC_SITE_URL || 'https://jnqjourney.com')
}

function isInternalReferrer(referrer?: string | null) {
  const host = normalizeHost(referrer)
  if (!host) return false
  const siteHost = getSiteHost()
  return host === siteHost || host.endsWith(`.${siteHost}`) || host === 'localhost' || host === '127.0.0.1'
}

function visitorKey(row: { visitor_id?: string | null; session_id?: string | null }) {
  return String(row.visitor_id || row.session_id || '').trim()
}

function visitKey(row: { visit_id?: string | null }) {
  return String(row.visit_id || '').trim()
}

function isLikelyBot(row: PageViewRow) {
  const userAgent = String(row.user_agent || '').toLowerCase()
  if (!userAgent) return false
  return /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|validator|lighthouse|pagespeed|headless|python-requests|curl|wget|uptime|monitor|semrush|ahrefs|mj12bot|bytespider|petalbot|yandex|duckduckbot|bingpreview|mediapartners-google|adsbot-google|google-inspectiontool/.test(userAgent)
}

function isReportablePath(row: PageViewRow) {
  const path = normalizePath(row.path)
  return !path.startsWith('/admin') && !path.startsWith('/api')
}

function formatDayKey(value?: string | null) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return formatDateInReportZone(date)
}

function effectiveDevice(row: PageViewRow) {
  const explicit = String(row.device_type || '').toLowerCase()
  if (explicit === 'mobile' || explicit === 'desktop' || explicit === 'tablet') return explicit

  const ua = String(row.user_agent || '').toLowerCase()
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'tablet'
  if (/mobile|iphone|ipod|android/.test(ua)) return 'mobile'
  return 'desktop'
}

function effectiveContentType(row: PageViewRow) {
  const path = normalizePath(row.path)
  if (path === '/') return 'home'
  if (path === '/packages') return 'package_index'
  if (path.startsWith('/spot/')) return 'spot'
  if (path.startsWith('/guide/')) return 'guide'
  if (path.startsWith('/notes/')) return 'note'
  if (path.startsWith('/packages/')) return 'package'
  if (path.startsWith('/region/')) return 'region'
  return String(row.content_type || 'page') || 'page'
}

function effectiveContentSlug(row: PageViewRow) {
  const explicit = String(row.content_slug || '').trim()
  if (explicit && !/^page$/.test(explicit)) return explicit
  const path = normalizePath(row.path)
  if (path === '/') return 'home'
  if (path === '/packages') return 'packages'
  return path.split('/').filter(Boolean).slice(1).join('/') || path.replace(/^\//, '') || 'home'
}

function addBucketView(bucket: Map<string, RankedBucket>, key: string, visitorId?: string | null, label?: string) {
  if (!bucket.has(key)) bucket.set(key, { key, label, views: 0, visitors: new Set() })
  const current = bucket.get(key)!
  current.views += 1
  if (label && !current.label) current.label = label
  if (visitorId) current.visitors.add(String(visitorId))
}

function mapRankedBuckets(bucket: Map<string, RankedBucket>, top = 20) {
  return Array.from(bucket.values())
    .sort((left, right) => right.views - left.views || right.visitors.size - left.visitors.size)
    .slice(0, top)
    .map((item) => ({
      key: item.key,
      label: item.label || item.key,
      views: item.views,
      visitors: item.visitors.size,
    }))
}

function buildDailyTraffic(rows: PageViewRow[]) {
  const bucket = new Map<string, { pageViews: number; visitors: Set<string>; visits: Set<string> }>()
  for (const row of rows) {
    const key = formatDayKey(row.viewed_at)
    if (!key) continue
    if (!bucket.has(key)) bucket.set(key, { pageViews: 0, visitors: new Set(), visits: new Set() })
    const current = bucket.get(key)!
    current.pageViews += 1
    const visitor = visitorKey(row)
    const visit = visitKey(row)
    if (visitor) current.visitors.add(visitor)
    if (visit) current.visits.add(visit)
  }
  return Array.from(bucket.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, stats]) => ({
      date,
      pageViews: stats.pageViews,
      visitors: stats.visitors.size,
      sessions: stats.visits.size,
    }))
}

function buildTopContent(rows: PageViewRow[], type: 'guide' | 'spot' | 'note' | 'package') {
  const bucket = new Map<string, RankedBucket>()
  for (const row of rows) {
    if (effectiveContentType(row) !== type) continue
    const slug = effectiveContentSlug(row)
    if (!slug) continue
    addBucketView(bucket, slug, visitorKey(row))
  }
  return mapRankedBuckets(bucket).map((item) => ({
    slug: item.key,
    views: item.views,
    visitors: item.visitors,
  }))
}

function buildTopPages(rows: PageViewRow[]) {
  const bucket = new Map<string, RankedBucket>()
  for (const row of rows) {
    const path = normalizePath(row.path)
    addBucketView(bucket, path, visitorKey(row), path === '/' ? '首页' : path)
  }
  return mapRankedBuckets(bucket, 20)
}

function buildContentTypes(rows: PageViewRow[]) {
  const bucket = new Map<string, RankedBucket>()
  for (const row of rows) {
    const type = effectiveContentType(row)
    addBucketView(bucket, type, visitorKey(row), type)
  }
  return mapRankedBuckets(bucket, 20)
}

function classifyNamedSource(value: string) {
  const source = value.trim().toLowerCase()
  if (!source || source === 'direct') return { key: 'direct', label: 'Direct / Unknown', group: 'direct' }
  if (source.includes('google')) return { key: 'google', label: 'Google', group: 'search' }
  if (source.includes('bing')) return { key: 'bing', label: 'Bing', group: 'search' }
  if (source.includes('yahoo')) return { key: 'yahoo', label: 'Yahoo', group: 'search' }
  if (source.includes('baidu')) return { key: 'baidu', label: 'Baidu', group: 'search' }
  if (source.includes('youtube') || source.includes('youtu')) return { key: 'youtube', label: 'YouTube', group: 'video' }
  if (source.includes('facebook') || source === 'fb') return { key: 'facebook', label: 'Facebook', group: 'social' }
  if (source.includes('instagram')) return { key: 'instagram', label: 'Instagram', group: 'social' }
  if (source.includes('threads')) return { key: 'threads', label: 'Threads', group: 'social' }
  if (source.includes('tiktok')) return { key: 'tiktok', label: 'TikTok', group: 'social' }
  if (source.includes('xiaohongshu') || source.includes('xhs')) return { key: 'xiaohongshu', label: '小红书', group: 'social' }
  if (source.includes('whatsapp')) return { key: 'whatsapp', label: 'WhatsApp', group: 'social' }
  if (source.includes('telegram')) return { key: 'telegram', label: 'Telegram', group: 'social' }
  if (source.includes('chatgpt') || source.includes('perplexity') || source.includes('gemini')) {
    return { key: source, label: source, group: 'ai' }
  }
  return { key: source, label: value.trim(), group: 'referral' }
}

function getSourceMeta(row: PageViewRow) {
  const explicitSource = String(row.traffic_source || '').trim()
  if (explicitSource) return classifyNamedSource(explicitSource)

  const params = trackingParams(row.path)
  const utmSource = params.get('utm_source')
  if (utmSource) return classifyNamedSource(utmSource)

  const host = normalizeHost(row.referrer)
  if (!host) return { key: 'direct', label: 'Direct / Unknown', group: 'direct' }
  if (isInternalReferrer(row.referrer)) return { key: 'internal', label: 'Internal Navigation', group: 'internal' }
  return classifyNamedSource(host)
}

function buildSources(rows: PageViewRow[]) {
  const bucket = new Map<string, RankedBucket & { group: string }>()
  for (const row of rows) {
    const source = getSourceMeta(row)
    if (!bucket.has(source.key)) {
      bucket.set(source.key, { key: source.key, label: source.label, group: source.group, views: 0, visitors: new Set() })
    }
    const current = bucket.get(source.key)!
    current.views += 1
    const visitor = visitorKey(row)
    if (visitor) current.visitors.add(visitor)
  }
  return Array.from(bucket.values())
    .sort((left, right) => right.views - left.views || right.visitors.size - left.visitors.size)
    .map((item) => ({
      key: item.key,
      label: item.label || item.key,
      group: item.group,
      views: item.views,
      visitors: item.visitors.size,
    }))
}

function buildCampaigns(rows: PageViewRow[]) {
  const bucket = new Map<string, RankedBucket & { source: string; medium: string }>()
  for (const row of rows) {
    const params = trackingParams(row.path)
    const campaign = String(row.traffic_campaign || params.get('utm_campaign') || '').trim()
    if (!campaign) continue
    const source = String(row.traffic_source || params.get('utm_source') || 'unknown').trim()
    const medium = String(row.traffic_medium || params.get('utm_medium') || '').trim()
    const key = `${source}::${medium}::${campaign}`
    if (!bucket.has(key)) {
      bucket.set(key, { key, label: campaign, source, medium, views: 0, visitors: new Set() })
    }
    const current = bucket.get(key)!
    current.views += 1
    const visitor = visitorKey(row)
    if (visitor) current.visitors.add(visitor)
  }
  return Array.from(bucket.values())
    .sort((a, b) => b.views - a.views || b.visitors.size - a.visitors.size)
    .slice(0, 30)
    .map((item) => ({
      campaign: item.label || item.key,
      source: item.source,
      medium: item.medium,
      views: item.views,
      visitors: item.visitors.size,
    }))
}

function buildDevices(rows: PageViewRow[]) {
  const bucket = new Map<string, RankedBucket>()
  for (const row of rows) {
    const device = effectiveDevice(row)
    addBucketView(bucket, device, visitorKey(row), device)
  }
  return mapRankedBuckets(bucket, 10)
}

function buildSessionMetrics(rows: PageViewRow[]) {
  const trackedRows = rows.filter((row) => visitKey(row))
  const sessions = new Map<string, PageViewRow[]>()
  for (const row of trackedRows) {
    const key = visitKey(row)
    if (!sessions.has(key)) sessions.set(key, [])
    sessions.get(key)!.push(row)
  }

  let multiPageSessions = 0
  let durationTotalSeconds = 0
  let durationSessions = 0
  for (const sessionRows of sessions.values()) {
    if (sessionRows.length > 1) {
      multiPageSessions += 1
      const times = sessionRows
        .map((row) => row.viewed_at ? new Date(row.viewed_at).getTime() : NaN)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
      if (times.length > 1) {
        durationTotalSeconds += Math.max(0, (times[times.length - 1] - times[0]) / 1000)
        durationSessions += 1
      }
    }
  }

  const sessionCount = sessions.size
  return {
    sessions: sessionCount,
    trackedPageViews: trackedRows.length,
    coveragePercent: rows.length ? Math.round((trackedRows.length / rows.length) * 100) : 0,
    pagesPerSession: sessionCount ? Number((trackedRows.length / sessionCount).toFixed(2)) : null,
    multiPageSessions,
    multiPageRate: sessionCount ? Math.round((multiPageSessions / sessionCount) * 100) : null,
    avgMultiPageDurationSeconds: durationSessions ? Math.round(durationTotalSeconds / durationSessions) : null,
  }
}

function buildLandingPages(rows: PageViewRow[]) {
  const firstByVisit = new Map<string, PageViewRow>()
  for (const row of rows) {
    const key = visitKey(row)
    if (!key || !row.viewed_at) continue
    const existing = firstByVisit.get(key)
    if (!existing || new Date(row.viewed_at).getTime() < new Date(existing.viewed_at || 0).getTime()) {
      firstByVisit.set(key, row)
    }
  }

  const bucket = new Map<string, RankedBucket>()
  for (const row of firstByVisit.values()) {
    const path = normalizePath(row.path)
    addBucketView(bucket, path, visitorKey(row), path === '/' ? '首页' : path)
  }
  return mapRankedBuckets(bucket, 15)
}

function buildTopAffiliateClicks(rows: AffiliateClickRow[]) {
  const bucket = new Map<number, { id: number; title: string; provider: string; type: string; target: string; clicks: number; visitors: Set<string> }>()
  for (const row of rows) {
    const id = Number(row.affiliate_link_id || row.affiliate_links?.id || 0)
    if (!id) continue
    if (!bucket.has(id)) {
      const locationName =
        row.affiliate_links?.locations?.name_cn ||
        row.affiliate_links?.locations?.name ||
        row.affiliate_links?.regions?.name_cn ||
        row.affiliate_links?.regions?.name ||
        ''
      bucket.set(id, {
        id,
        title: String(row.affiliate_links?.title || '未命名联盟链接'),
        provider: String(row.affiliate_links?.provider || 'others'),
        type: String(row.affiliate_links?.link_type || 'others'),
        target: locationName,
        clicks: 0,
        visitors: new Set(),
      })
    }
    const item = bucket.get(id)!
    item.clicks += 1
    const visitor = visitorKey(row)
    if (visitor) item.visitors.add(visitor)
  }
  return Array.from(bucket.values())
    .sort((left, right) => right.clicks - left.clicks)
    .slice(0, 20)
    .map((item) => ({ ...item, visitors: item.visitors.size }))
}

function buildAffiliateProviders(rows: AffiliateClickRow[]) {
  const bucket = new Map<string, { provider: string; clicks: number; visitors: Set<string> }>()
  for (const row of rows) {
    const provider = String(row.affiliate_links?.provider || 'others')
    if (!bucket.has(provider)) bucket.set(provider, { provider, clicks: 0, visitors: new Set() })
    const item = bucket.get(provider)!
    item.clicks += 1
    const visitor = visitorKey(row)
    if (visitor) item.visitors.add(visitor)
  }
  return Array.from(bucket.values())
    .sort((a, b) => b.clicks - a.clicks)
    .map((item) => ({ provider: item.provider, clicks: item.clicks, visitors: item.visitors.size }))
}

function summarizeTraffic(rows: PageViewRow[]) {
  return {
    pageViews: rows.length,
    visitors: new Set(rows.map(visitorKey).filter(Boolean)).size,
  }
}

function analyticsVisitorKey(row: AnalyticsEventRow) {
  return String(row.visitor_id || row.session_id || '').trim()
}

function buildPackageFunnel(rows: AnalyticsEventRow[]) {
  const eventCounts = new Map<string, { events: number; visitors: Set<string> }>()
  const optionBuckets = new Map<string, {
    key: string
    packageId: number | null
    optionId: number | null
    optionName: string
    packageName: string
    views: number
    brochureViews: number
    enquiries: number
    viewVisitors: Set<string>
    brochureVisitors: Set<string>
    enquiryVisitors: Set<string>
  }>()

  for (const row of rows) {
    const eventName = String(row.event_name || '')
    if (!eventName) continue
    if (!eventCounts.has(eventName)) eventCounts.set(eventName, { events: 0, visitors: new Set() })
    const event = eventCounts.get(eventName)!
    event.events += 1
    const visitor = analyticsVisitorKey(row)
    if (visitor) event.visitors.add(visitor)

    const params = row.params || {}
    const optionId = Number(row.option_id || 0) || null
    const packageId = Number(row.package_id || 0) || null
    const optionName = String(params.option_name || '').trim()
    const packageName = String(params.package_name || '').trim()
    if (!optionId && !optionName) continue

    const key = optionId ? String(optionId) : optionName
    if (!optionBuckets.has(key)) {
      optionBuckets.set(key, {
        key,
        packageId,
        optionId,
        optionName: optionName || `Option ${optionId || ''}`.trim(),
        packageName,
        views: 0,
        brochureViews: 0,
        enquiries: 0,
        viewVisitors: new Set(),
        brochureVisitors: new Set(),
        enquiryVisitors: new Set(),
      })
    }

    const bucket = optionBuckets.get(key)!
    if (eventName === 'package_option_view') {
      bucket.views += 1
      if (visitor) bucket.viewVisitors.add(visitor)
    }
    if (eventName === 'package_brochure_view') {
      bucket.brochureViews += 1
      if (visitor) bucket.brochureVisitors.add(visitor)
    }
    if (eventName === 'package_enquiry_start') {
      bucket.enquiries += 1
      if (visitor) bucket.enquiryVisitors.add(visitor)
    }
  }

  const count = (name: string) => {
    const value = eventCounts.get(name)
    return { events: value?.events || 0, visitors: value?.visitors.size || 0 }
  }

  const packageViews = count('package_view')
  const optionViews = count('package_option_view')
  const brochureViews = count('package_brochure_view')
  const enquiries = count('package_enquiry_start')
  const whatsappClicks = count('package_whatsapp_click')
  const rate = (numerator: number, denominator: number) => denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null

  return {
    packageViews,
    optionViews,
    brochureViews,
    enquiries,
    whatsappClicks,
    rates: {
      packageToOption: rate(optionViews.visitors, packageViews.visitors),
      optionToBrochure: rate(brochureViews.visitors, optionViews.visitors),
      optionToEnquiry: rate(enquiries.visitors, optionViews.visitors),
      packageToEnquiry: rate(enquiries.visitors, packageViews.visitors),
    },
    topOptions: Array.from(optionBuckets.values())
      .sort((a, b) => b.enquiryVisitors.size - a.enquiryVisitors.size || b.viewVisitors.size - a.viewVisitors.size || b.views - a.views)
      .slice(0, 20)
      .map((item) => ({
        key: item.key,
        packageId: item.packageId,
        optionId: item.optionId,
        optionName: item.optionName,
        packageName: item.packageName,
        views: item.views,
        viewVisitors: item.viewVisitors.size,
        brochureViews: item.brochureViews,
        brochureVisitors: item.brochureVisitors.size,
        enquiries: item.enquiries,
        enquiryVisitors: item.enquiryVisitors.size,
        visitors: item.viewVisitors.size,
        enquiryRate: rate(item.enquiryVisitors.size, item.viewVisitors.size),
      })),
  }
}

function buildPackageAcquisition(rows: AnalyticsEventRow[]) {
  const bucket = new Map<string, {
    key: string
    source: string
    campaign: string
    optionViews: number
    enquiries: number
    viewVisitors: Set<string>
    enquiryVisitors: Set<string>
  }>()

  for (const row of rows) {
    if (!['package_option_view', 'package_enquiry_start'].includes(String(row.event_name || ''))) continue
    const params = row.params || {}
    const source = String(row.traffic_source || params.traffic_source || 'unknown').trim() || 'unknown'
    const campaign = String(row.traffic_campaign || params.traffic_campaign || '').trim()
    const key = `${source}::${campaign}`
    if (!bucket.has(key)) {
      bucket.set(key, { key, source, campaign, optionViews: 0, enquiries: 0, viewVisitors: new Set(), enquiryVisitors: new Set() })
    }
    const item = bucket.get(key)!
    const visitor = analyticsVisitorKey(row)
    if (row.event_name === 'package_option_view') {
      item.optionViews += 1
      if (visitor) item.viewVisitors.add(visitor)
    }
    if (row.event_name === 'package_enquiry_start') {
      item.enquiries += 1
      if (visitor) item.enquiryVisitors.add(visitor)
    }
  }

  return Array.from(bucket.values())
    .sort((a, b) => b.enquiryVisitors.size - a.enquiryVisitors.size || b.viewVisitors.size - a.viewVisitors.size)
    .slice(0, 20)
    .map((item) => ({
      source: item.source,
      campaign: item.campaign,
      optionViews: item.optionViews,
      optionVisitors: item.viewVisitors.size,
      enquiries: item.enquiries,
      enquiryVisitors: item.enquiryVisitors.size,
      enquiryRate: item.viewVisitors.size ? Number(((item.enquiryVisitors.size / item.viewVisitors.size) * 100).toFixed(1)) : null,
    }))
}

function buildComparison(currentRows: PageViewRow[], previousRows: PageViewRow[]) {
  const current = summarizeTraffic(currentRows)
  const previous = summarizeTraffic(previousRows)
  const pageViewsDelta = current.pageViews - previous.pageViews
  const visitorsDelta = current.visitors - previous.visitors
  return {
    previous,
    pageViewsDelta,
    visitorsDelta,
    pageViewsDeltaPercent: previous.pageViews ? Math.round((pageViewsDelta / previous.pageViews) * 100) : null,
    visitorsDeltaPercent: previous.visitors ? Math.round((visitorsDelta / previous.visitors) * 100) : null,
  }
}

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: '缺少 Supabase 环境变量，无法读取报表。' }, { status: 500 })
  }

  const range = parseDateRange(request)
  if (!range) return NextResponse.json({ error: '日期范围无效。' }, { status: 400 })

  const previousRange = buildPreviousRange(range)
  const [pageViewsResult, previousPageViewsResult, affiliateClicksResult, analyticsEventsResult] = await Promise.all([
    fetchPageViews(supabase, range),
    fetchPageViews(supabase, previousRange),
    fetchAffiliateClicks(supabase, range),
    fetchAnalyticsEvents(supabase, range),
  ])

  const rawPageViews = pageViewsResult.rows.filter(isReportablePath)
  const botPageViews = rawPageViews.filter(isLikelyBot)
  const humanPageViews = rawPageViews.filter((row) => !isLikelyBot(row))
  const previousHumanPageViews = previousPageViewsResult.rows.filter(isReportablePath).filter((row) => !isLikelyBot(row))
  const affiliateClickRows = affiliateClicksResult.error ? [] : affiliateClicksResult.rows
  const analyticsEventRows = analyticsEventsResult.error ? [] : analyticsEventsResult.rows

  const dailyTraffic = buildDailyTraffic(humanPageViews)
  const latestDay = dailyTraffic[0] || null
  const totalVisitors = new Set(humanPageViews.map(visitorKey).filter(Boolean)).size
  const sources = buildSources(humanPageViews)
  const directSource = sources.find((source) => source.key === 'direct')
  const internalSource = sources.find((source) => source.key === 'internal')
  const attributedViews = humanPageViews.length - (directSource?.views || 0) - (internalSource?.views || 0)
  const sessionMetrics = buildSessionMetrics(humanPageViews)
  const affiliateVisitors = new Set(affiliateClickRows.map(visitorKey).filter(Boolean)).size
  const packageFunnel = buildPackageFunnel(analyticsEventRows)

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      pageViews: humanPageViews.length,
      visitors: totalVisitors,
      sessions: sessionMetrics.sessions,
      pagesPerSession: sessionMetrics.pagesPerSession,
      multiPageRate: sessionMetrics.multiPageRate,
      affiliateClicks: affiliateClickRows.length,
      affiliateVisitors,
      affiliateVisitorRate: totalVisitors ? Number(((affiliateVisitors / totalVisitors) * 100).toFixed(1)) : null,
      packageEnquiries: packageFunnel.enquiries.events,
      packageEnquiryVisitors: packageFunnel.enquiries.visitors,
      latestDay,
      rawPageViews: rawPageViews.length,
      botPageViews: botPageViews.length,
      botRate: rawPageViews.length ? Number(((botPageViews.length / rawPageViews.length) * 100).toFixed(1)) : 0,
      directViews: directSource?.views || 0,
      sourceTrackedViews: Math.max(0, attributedViews),
      sourceTrackedRate: humanPageViews.length ? Number(((Math.max(0, attributedViews) / humanPageViews.length) * 100).toFixed(1)) : 0,
    },
    range: {
      from: range.fromLabel,
      to: range.toLabel,
      timezone: REPORT_TIME_ZONE,
    },
    previousRange: {
      from: previousRange.fromLabel,
      to: previousRange.toLabel,
    },
    comparison: buildComparison(humanPageViews, previousHumanPageViews),
    quality: {
      source: 'supabase_page_views',
      rowLimit: MAX_ROWS,
      pageViewsTruncated: pageViewsResult.truncated,
      affiliateClicksTruncated: affiliateClicksResult.truncated,
      analyticsEventsTruncated: analyticsEventsResult.truncated,
      sessionTrackingCoverage: sessionMetrics.coveragePercent,
      notes: [
        'Trusted Views 会排除常见 bot / preview user-agent 以及 admin/api 路径；历史记录也会重新过滤。',
        'Visitors 使用浏览器匿名 visitor_id 去重；旧记录会兼容原 session_id。',
        'Sessions 使用 30 分钟无活动切分的 visit_id，只对新版 Tracking 上线后的流量计算，不会伪造旧 Session。',
        '来源优先使用会话级 attribution / UTM；没有新版 attribution 的旧记录才回退到 URL UTM 或 referrer。',
        '日期统一按 Asia/Singapore 统计。',
      ],
    },
    sessionMetrics,
    dailyTraffic,
    landingPages: buildLandingPages(humanPageViews),
    contentTypes: buildContentTypes(humanPageViews),
    topPages: buildTopPages(humanPageViews),
    topGuides: buildTopContent(humanPageViews, 'guide'),
    topSpots: buildTopContent(humanPageViews, 'spot'),
    topNotes: buildTopContent(humanPageViews, 'note'),
    topPackages: buildTopContent(humanPageViews, 'package'),
    devices: buildDevices(humanPageViews),
    sources,
    campaigns: buildCampaigns(humanPageViews),
    topAffiliateClicks: buildTopAffiliateClicks(affiliateClickRows),
    affiliateProviders: buildAffiliateProviders(affiliateClickRows),
    packageFunnel,
    packageAcquisition: buildPackageAcquisition(analyticsEventRows),
    analyticsEventsReady: !analyticsEventsResult.error,
    analyticsEventsError: analyticsEventsResult.error,
    pageViewsReady: !pageViewsResult.error,
    pageViewsError: pageViewsResult.error,
    affiliateClicksReady: !affiliateClicksResult.error,
    affiliateClicksError: affiliateClicksResult.error,
  })
}
