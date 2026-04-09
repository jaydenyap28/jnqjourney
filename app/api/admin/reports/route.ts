import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PageViewRow = {
  path?: string | null
  content_type?: string | null
  content_slug?: string | null
  session_id?: string | null
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

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) return null

  return createClient(supabaseUrl, serviceRoleKey || anonKey || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function formatDayKey(value?: string | null) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function parseDateRange(request: Request) {
  const url = new URL(request.url)
  const toInput = url.searchParams.get('to')
  const fromInput = url.searchParams.get('from')

  const to = toInput ? new Date(`${toInput}T23:59:59.999Z`) : new Date()
  if (Number.isNaN(to.getTime())) return null

  const from = fromInput ? new Date(`${fromInput}T00:00:00.000Z`) : new Date(to)
  if (!fromInput) from.setDate(from.getDate() - 29)
  if (Number.isNaN(from.getTime())) return null
  if (from > to) return null

  return { from, to }
}

function buildDailyTraffic(rows: PageViewRow[]) {
  const bucket = new Map<string, { pageViews: number; sessions: Set<string> }>()

  for (const row of rows) {
    const key = formatDayKey(row.viewed_at)
    if (!key) continue
    if (!bucket.has(key)) bucket.set(key, { pageViews: 0, sessions: new Set() })
    const current = bucket.get(key)!
    current.pageViews += 1
    if (row.session_id) current.sessions.add(String(row.session_id))
  }

  return Array.from(bucket.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, stats]) => ({
      date,
      pageViews: stats.pageViews,
      visitors: stats.sessions.size,
    }))
}

function buildTopContent(rows: PageViewRow[], type: 'guide' | 'spot') {
  const bucket = new Map<string, { slug: string; views: number; visitors: Set<string> }>()

  for (const row of rows) {
    if (row.content_type !== type) continue
    const slug = String(row.content_slug || '').trim()
    if (!slug) continue

    if (!bucket.has(slug)) bucket.set(slug, { slug, views: 0, visitors: new Set() })

    const current = bucket.get(slug)!
    current.views += 1
    if (row.session_id) current.visitors.add(String(row.session_id))
  }

  return Array.from(bucket.values())
    .sort((left, right) => right.views - left.views || right.visitors.size - left.visitors.size)
    .slice(0, 20)
    .map((item) => ({
      slug: item.slug,
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

  let pageViews: PageViewRow[] = []
  let pageViewErrorMessage: string | null = null

  const pageViewsResult = await supabase
    .from('page_views')
    .select('path, content_type, content_slug, session_id, viewed_at')
    .gte('viewed_at', range.from.toISOString())
    .lte('viewed_at', range.to.toISOString())
    .order('viewed_at', { ascending: false })
    .limit(10000)

  if (pageViewsResult.error) pageViewErrorMessage = pageViewsResult.error.message
  else pageViews = (pageViewsResult.data || []) as PageViewRow[]

  const affiliateClicksResult = await supabase
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
    .limit(10000)

  const affiliateClickRows = affiliateClicksResult.error ? [] : ((affiliateClicksResult.data || []) as AffiliateClickRow[])
  const dailyTraffic = buildDailyTraffic(pageViews)
  const latestDay = dailyTraffic[0] || null
  const totalVisitors = new Set(pageViews.map((row) => String(row.session_id || '')).filter(Boolean)).size

  return NextResponse.json({
    summary: {
      pageViews: pageViews.length,
      visitors: totalVisitors,
      affiliateClicks: affiliateClickRows.length,
      latestDay,
    },
    range: {
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
    },
    dailyTraffic,
    topGuides: buildTopContent(pageViews, 'guide'),
    topSpots: buildTopContent(pageViews, 'spot'),
    topAffiliateClicks: buildTopAffiliateClicks(affiliateClickRows),
    pageViewsReady: !pageViewErrorMessage,
    pageViewsError: pageViewErrorMessage,
  })
}

