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
  referrer?: string | null
  user_agent?: string | null
  viewed_at?: string | null
}

type AffiliateClickRow = {
  affiliate_link_id?: number | null
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
  if (Number.isNaN(from.getTime())) return null
  if (from > to) return null

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

type ReportSupabaseClient = SupabaseClient<any, any, any>

async function fetchPageViews(supabase: ReportSupabaseClient, range: DateRange) {
  const rows: PageViewRow[] = []

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const result = await supabase
      .from('page_views')
      .select('path, content_type, content_slug, session_id, referrer, user_agent, viewed_at')
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
        clicked_at,
        affiliate_links:affiliate_link_id (
          id,
          title,
          provider,
          link_type,
          locations:location_id (
            name,
            name_cn
          ),
          regions:region_id (
            name,
            name_cn
          )
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

function normalizePath(value?: string | null) {
  const rawValue = String(value || '/').trim() || '/'

  try {
    const url = rawValue.startsWith('http') ? new URL(rawValue) : new URL(rawValue, 'https://jnqjourney.local')
    const normalized = url.pathname.replace(/\/+$/, '') || '/'
    return normalized
  } catch {
    const [pathOnly] = rawValue.split(/[?#]/)
    return (pathOnly || '/').replace(/\/+$/, '') || '/'
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

function isLikelyBot(row: PageViewRow) {
  const userAgent = String(row.user_agent || '').toLowerCase()
  if (!userAgent) return false

  return /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|validator|lighthouse|pagespeed|headless|python-requests|curl|wget|uptime|monitor|semrush|ahrefs|mj12bot|bytespider|petalbot|yandex|duckduckbot|bingpreview/.test(userAgent)
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

function addBucketView(bucket: Map<string, RankedBucket>, key: string, sessionId?: string | null, label?: string) {
  if (!bucket.has(key)) bucket.set(key, { key, label, views: 0, visitors: new Set() })
  const current = bucket.get(key)!
  current.views += 1
  if (label && !current.label) current.label = label
  if (sessionId) current.visitors.add(String(sessionId))
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
  const bucket = new Map<string, { pageViews: number; visitors: Set<string> }>()

  for (const row of rows) {
    const key = formatDayKey(row.viewed_at)
    if (!key) continue
    if (!bucket.has(key)) bucket.set(key, { pageViews: 0, visitors: new Set() })
    const current = bucket.get(key)!
    current.pageViews += 1
    if (row.session_id) current.visitors.add(String(row.session_id))
  }

  return Array.from(bucket.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, stats]) => ({
      date,
      pageViews: stats.pageViews,
      visitors: stats.visitors.size,
    }))
}

function buildTopContent(rows: PageViewRow[], type: 'guide' | 'spot') {
  const bucket = new Map<string, RankedBucket>()

  for (const row of rows) {
    if (row.content_type !== type) continue
    const slug = String(row.content_slug || '').trim()
    if (!slug) continue
    addBucketView(bucket, slug, row.session_id)
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
    addBucketView(bucket, path, row.session_id, path === '/' ? '首页' : path)
  }

  return mapRankedBuckets(bucket, 15)
}

function getSourceMeta(referrer?: string | null) {
  const host = normalizeHost(referrer)

  if (!host) return { key: 'direct', label: 'Direct / Unknown', group: 'direct' }
  if (isInternalReferrer(referrer)) return { key: 'internal', label: 'Internal Navigation', group: 'internal' }
  if (host.includes('google')) return { key: 'google', label: 'Google', group: 'search' }
  if (host.includes('bing')) return { key: 'bing', label: 'Bing', group: 'search' }
  if (host.includes('yahoo')) return { key: 'yahoo', label: 'Yahoo', group: 'search' }
  if (host.includes('baidu')) return { key: 'baidu', label: 'Baidu', group: 'search' }
  if (host.includes('youtube') || host.includes('youtu.be')) return { key: 'youtube', label: 'YouTube', group: 'video' }
  if (host.includes('facebook') || host === 'fb.com') return { key: 'facebook', label: 'Facebook', group: 'social' }
  if (host.includes('instagram')) return { key: 'instagram', label: 'Instagram', group: 'social' }
  if (host.includes('tiktok')) return { key: 'tiktok', label: 'TikTok', group: 'social' }
  if (host.includes('xiaohongshu') || host.includes('xhslink')) return { key: 'xiaohongshu', label: '小红书', group: 'social' }
  if (host.includes('chatgpt') || host.includes('perplexity') || host.includes('gemini')) return { key: host, label: host, group: 'ai' }

  return { key: host, label: host, group: 'referral' }
}

function buildSources(rows: PageViewRow[]) {
  const bucket = new Map<string, RankedBucket & { group: string }>()

  for (const row of rows) {
    const source = getSourceMeta(row.referrer)
    if (!bucket.has(source.key)) {
      bucket.set(source.key, { key: source.key, label: source.label, group: source.group, views: 0, visitors: new Set() })
    }

    const current = bucket.get(source.key)!
    current.views += 1
    if (row.session_id) current.visitors.add(String(row.session_id))
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

function buildTopAffiliateClicks(rows: AffiliateClickRow[]) {
  const bucket = new Map<number, { id: number; title: string; provider: string; type: string; target: string; clicks: number }>()

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
      })
    }

    bucket.get(id)!.clicks += 1
  }

  return Array.from(bucket.values())
    .sort((left, right) => right.clicks - left.clicks)
    .slice(0, 20)
}

function summarizeTraffic(rows: PageViewRow[]) {
  return {
    pageViews: rows.length,
    visitors: new Set(rows.map((row) => String(row.session_id || '')).filter(Boolean)).size,
  }
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
  if (!range) {
    return NextResponse.json({ error: '日期范围无效。' }, { status: 400 })
  }

  const previousRange = buildPreviousRange(range)
  const [pageViewsResult, previousPageViewsResult, affiliateClicksResult] = await Promise.all([
    fetchPageViews(supabase, range),
    fetchPageViews(supabase, previousRange),
    fetchAffiliateClicks(supabase, range),
  ])

  const rawPageViews = pageViewsResult.rows.filter(isReportablePath)
  const botPageViews = rawPageViews.filter(isLikelyBot)
  const humanPageViews = rawPageViews.filter((row) => !isLikelyBot(row))
  const previousHumanPageViews = previousPageViewsResult.rows.filter(isReportablePath).filter((row) => !isLikelyBot(row))
  const affiliateClickRows = affiliateClicksResult.error ? [] : affiliateClicksResult.rows
  const dailyTraffic = buildDailyTraffic(humanPageViews)
  const latestDay = dailyTraffic[0] || null
  const totalVisitors = new Set(humanPageViews.map((row) => String(row.session_id || '')).filter(Boolean)).size
  const sources = buildSources(humanPageViews)
  const directSource = sources.find((source) => source.key === 'direct')

  return NextResponse.json({
    summary: {
      pageViews: humanPageViews.length,
      visitors: totalVisitors,
      affiliateClicks: affiliateClickRows.length,
      latestDay,
      rawPageViews: rawPageViews.length,
      botPageViews: botPageViews.length,
      directViews: directSource?.views || 0,
      sourceTrackedViews: humanPageViews.length - (directSource?.views || 0),
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
      notes: [
        '主指标已过滤常见 bot / preview user-agent，并排除 admin/api 路径。',
        '日期按 Asia/Singapore 统计，不再按 UTC 切天。',
        'Direct / Unknown 包含直接访问、隐私浏览器、App 内打开和没有 referrer 的访问。',
      ],
    },
    dailyTraffic,
    topPages: buildTopPages(humanPageViews),
    topGuides: buildTopContent(humanPageViews, 'guide'),
    topSpots: buildTopContent(humanPageViews, 'spot'),
    sources,
    topAffiliateClicks: buildTopAffiliateClicks(affiliateClickRows),
    pageViewsReady: !pageViewsResult.error,
    pageViewsError: pageViewsResult.error,
    affiliateClicksReady: !affiliateClicksResult.error,
    affiliateClicksError: affiliateClicksResult.error,
  })
}
