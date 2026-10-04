'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarRange,
  Download,
  Globe2,
  MonitorOff,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface DailyTrafficRow {
  date: string
  pageViews: number
  visitors: number
  sessions?: number
}

interface RankedContentRow {
  slug: string
  views: number
  visitors: number
}

interface RankedPageRow {
  key: string
  label: string
  views: number
  visitors: number
}

interface SourceRow {
  key: string
  label: string
  group: string
  views: number
  visitors: number
}

interface CampaignRow {
  campaign: string
  source: string
  medium: string
  views: number
  visitors: number
}

interface RankedAffiliateRow {
  id: number
  title: string
  provider: string
  type: string
  target: string
  clicks: number
  visitors?: number
}

interface AffiliateProviderRow {
  provider: string
  clicks: number
  visitors: number
}

interface PackageFunnelMetric {
  events: number
  visitors: number
}

interface PackageOptionFunnelRow {
  key: string
  packageId?: number | null
  optionId?: number | null
  optionName: string
  packageName?: string
  views: number
  viewVisitors?: number
  brochureViews: number
  brochureVisitors?: number
  enquiries: number
  enquiryVisitors?: number
  visitors: number
  enquiryRate?: number | null
}

interface PackageAcquisitionRow {
  source: string
  campaign: string
  optionViews: number
  optionVisitors: number
  enquiries: number
  enquiryVisitors: number
  enquiryRate?: number | null
}

interface SessionMetrics {
  sessions?: number
  trackedPageViews?: number
  coveragePercent?: number
  pagesPerSession?: number | null
  multiPageSessions?: number
  multiPageRate?: number | null
  avgMultiPageDurationSeconds?: number | null
}

interface ReportsPayload {
  generatedAt?: string
  summary?: {
    pageViews?: number
    visitors?: number
    sessions?: number
    pagesPerSession?: number | null
    multiPageRate?: number | null
    affiliateClicks?: number
    affiliateVisitors?: number
    affiliateVisitorRate?: number | null
    packageEnquiries?: number
    packageEnquiryVisitors?: number
    latestDay?: DailyTrafficRow | null
    rawPageViews?: number
    botPageViews?: number
    botRate?: number
    directViews?: number
    sourceTrackedViews?: number
    sourceTrackedRate?: number
  }
  range?: {
    from?: string
    to?: string
    timezone?: string
  }
  previousRange?: {
    from?: string
    to?: string
  }
  comparison?: {
    previous?: {
      pageViews?: number
      visitors?: number
    }
    pageViewsDelta?: number
    visitorsDelta?: number
    pageViewsDeltaPercent?: number | null
    visitorsDeltaPercent?: number | null
  }
  quality?: {
    source?: string
    rowLimit?: number
    pageViewsTruncated?: boolean
    affiliateClicksTruncated?: boolean
    analyticsEventsTruncated?: boolean
    sessionTrackingCoverage?: number
    notes?: string[]
  }
  sessionMetrics?: SessionMetrics
  dailyTraffic?: DailyTrafficRow[]
  landingPages?: RankedPageRow[]
  contentTypes?: RankedPageRow[]
  topPages?: RankedPageRow[]
  topGuides?: RankedContentRow[]
  topSpots?: RankedContentRow[]
  topNotes?: RankedContentRow[]
  topPackages?: RankedContentRow[]
  devices?: RankedPageRow[]
  sources?: SourceRow[]
  campaigns?: CampaignRow[]
  topAffiliateClicks?: RankedAffiliateRow[]
  affiliateProviders?: AffiliateProviderRow[]
  packageFunnel?: {
    packageViews?: PackageFunnelMetric
    optionViews?: PackageFunnelMetric
    brochureViews?: PackageFunnelMetric
    enquiries?: PackageFunnelMetric
    whatsappClicks?: PackageFunnelMetric
    rates?: {
      packageToOption?: number | null
      optionToBrochure?: number | null
      optionToEnquiry?: number | null
      packageToEnquiry?: number | null
    }
    topOptions?: PackageOptionFunnelRow[]
  }
  packageAcquisition?: PackageAcquisitionRow[]
  analyticsEventsReady?: boolean
  analyticsEventsError?: string | null
  pageViewsReady?: boolean
  pageViewsError?: string | null
  affiliateClicksReady?: boolean
  affiliateClicksError?: string | null
}

function localDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRangeDays(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - Math.max(0, days - 1))
  return { from: localDateInput(from), to: localDateInput(to) }
}

function getDefaultDateRange() {
  return getRangeDays(30)
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function prettySlug(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDelta(value?: number, percent?: number | null) {
  if (typeof value !== 'number') return '暂无对比'
  const sign = value > 0 ? '+' : ''
  const percentText = typeof percent === 'number' ? ` · ${sign}${percent}%` : ''
  return `${sign}${value}${percentText}`
}

function formatPercent(value?: number | null) {
  return typeof value === 'number' ? `${value}%` : '—'
}

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number') return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

function sourceGroupLabel(value: string) {
  const labels: Record<string, string> = {
    direct: '直接 / 未知',
    internal: '站内跳转',
    search: '搜索',
    social: '社媒',
    video: '视频',
    ai: 'AI 引用',
    referral: '外部推荐',
  }
  return labels[value] || value
}

function contentTypeLabel(value: string) {
  const labels: Record<string, string> = {
    home: '首页',
    spot: '景点 Spot',
    guide: 'Guide / 行程',
    note: 'Notes',
    package: '旅游配套',
    package_index: '配套首页',
    region: '地区页',
    page: '其他页面',
  }
  return labels[value] || value
}

function deviceLabel(value: string) {
  const labels: Record<string, string> = {
    mobile: '手机',
    desktop: '电脑',
    tablet: '平板',
  }
  return labels[value] || value
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function MetricCard({
  eyebrow,
  value,
  detail,
  footer,
}: {
  eyebrow: string
  value: string | number
  detail: string
  footer?: string
}) {
  return (
    <Card className="border-white/10 bg-white/5 text-white">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">{eyebrow}</p>
        <p className="mt-3 text-3xl font-semibold">{value}</p>
        <p className="mt-2 text-xs leading-5 text-white/50">{detail}</p>
        {footer ? <p className="mt-2 text-xs text-emerald-100/70">{footer}</p> : null}
      </CardContent>
    </Card>
  )
}

function RankedList({
  rows,
  empty,
  label,
}: {
  rows: RankedPageRow[]
  empty: string
  label?: (row: RankedPageRow) => string
}) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">{empty}</div>
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">{index + 1}</div>
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{label ? label(row) : row.label}</div>
              <div className="truncate text-xs text-white/40">{row.key}</div>
            </div>
          </div>
          <div className="shrink-0 text-right text-sm text-white/75">
            <div>{row.views} 浏览</div>
            <div className="text-xs text-white/45">{row.visitors} 访客</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminReportsPage() {
  const [payload, setPayload] = useState<ReportsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState(getDefaultDateRange())
  const [excludeThisDevice, setExcludeThisDevice] = useState(false)

  useEffect(() => {
    setExcludeThisDevice(window.localStorage.getItem('jnq_exclude_analytics') === '1')
  }, [])

  useEffect(() => {
    let cancelled = false

    const fetchReports = async () => {
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({ from: range.from, to: range.to }).toString()
        const response = await adminFetch(`/api/admin/reports?${query}`, { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || '读取报表失败。')
        if (!cancelled) setPayload(result)
      } catch (fetchError: any) {
        if (!cancelled) setError(fetchError?.message || '读取报表失败。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchReports()
    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  const summary = payload?.summary || {}
  const sessionMetrics = payload?.sessionMetrics || {}
  const dailyTraffic = payload?.dailyTraffic || []
  const landingPages = payload?.landingPages || []
  const contentTypes = payload?.contentTypes || []
  const topPages = payload?.topPages || []
  const topGuides = payload?.topGuides || []
  const topSpots = payload?.topSpots || []
  const topNotes = payload?.topNotes || []
  const topPackages = payload?.topPackages || []
  const devices = payload?.devices || []
  const sources = payload?.sources || []
  const campaigns = payload?.campaigns || []
  const topAffiliateClicks = payload?.topAffiliateClicks || []
  const affiliateProviders = payload?.affiliateProviders || []
  const packageFunnel = payload?.packageFunnel || {}
  const topPackageOptions = packageFunnel.topOptions || []
  const packageAcquisition = payload?.packageAcquisition || []
  const qualityNotes = payload?.quality?.notes || []

  const latestTrafficLabel = useMemo(() => {
    if (!summary.latestDay?.date) return '还没有浏览记录'
    return `${formatDateLabel(summary.latestDay.date)} · ${summary.latestDay.visitors || 0} 位访客`
  }, [summary.latestDay])

  const maxDailyViews = Math.max(1, ...dailyTraffic.map((row) => row.pageViews || 0))

  const toggleDeviceExclusion = () => {
    const next = !excludeThisDevice
    window.localStorage.setItem('jnq_exclude_analytics', next ? '1' : '0')
    setExcludeThisDevice(next)
  }

  const exportJson = () => {
    if (!payload) return
    const from = payload.range?.from || range.from
    const to = payload.range?.to || range.to
    const snapshot = {
      exportVersion: 2,
      generatedAt: new Date().toISOString(),
      purpose: 'JnQ Journey admin analytics snapshot for ChatGPT analysis',
      metricDefinitions: {
        trustedViews: 'page views after bot/admin/API filtering',
        visitors: 'anonymous browser visitor_id, with legacy session_id fallback',
        sessions: '30-minute visit_id sessions; only available after analytics v2 launch',
        attribution: 'visit-level source/campaign; UTM first, external referrer fallback',
        enquiries: 'package_enquiry_start; WhatsApp duplicate event is not double-counted',
      },
      range: payload.range || range,
      report: payload,
    }
    downloadTextFile(
      `jnq-report-${from}-to-${to}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json;charset=utf-8'
    )
  }

  const exportCsv = () => {
    if (!payload) return
    const rows: Array<Array<string | number>> = [[
      'section', 'label', 'views', 'visitors', 'sessions', 'clicks', 'enquiries',
      'conversion_rate', 'source', 'medium', 'campaign', 'details',
    ]]

    rows.push(
      ['summary', 'Trusted Views', summary.pageViews || 0, '', '', '', '', '', '', '', '', 'bot/admin filtered'],
      ['summary', 'Visitors', '', summary.visitors || 0, '', '', '', '', '', '', '', 'anonymous browser ID'],
      ['summary', 'Sessions', '', '', summary.sessions || 0, '', '', '', '', '', '', `tracking coverage ${sessionMetrics.coveragePercent || 0}%`],
      ['summary', 'Package Enquiries', '', summary.packageEnquiryVisitors || 0, '', '', summary.packageEnquiries || 0, '', '', '', '', ''],
      ['summary', 'Affiliate Clicks', '', summary.affiliateVisitors || 0, '', summary.affiliateClicks || 0, '', summary.affiliateVisitorRate ?? '', '', '', '', ''],
      ['summary', 'Raw Page Views', summary.rawPageViews || 0, '', '', '', '', '', '', '', '', '', ''],
      ['summary', 'Bot / Preview Filtered', summary.botPageViews || 0, '', '', '', '', summary.botRate ?? '', '', '', '', '', ''],
      ['summary', 'Acquisition Tracked', summary.sourceTrackedViews || 0, '', '', '', '', summary.sourceTrackedRate ?? '', '', '', '', '', ''],
    )

    dailyTraffic.forEach((row) => rows.push(['daily_traffic', row.date, row.pageViews, row.visitors, row.sessions || '', '', '', '', '', '', '', '']))
    landingPages.forEach((row) => rows.push(['landing_page', row.label, row.views, row.visitors, '', '', '', '', '', '', '', row.key]))
    contentTypes.forEach((row) => rows.push(['content_type', row.label, row.views, row.visitors, '', '', '', '', '', '', '', row.key]))
    topPages.forEach((row) => rows.push(['top_page', row.label, row.views, row.visitors, '', '', '', '', '', '', '', row.key]))
    topGuides.forEach((row) => rows.push(['top_guide', row.slug, row.views, row.visitors, '', '', '', '', '', '', '', '']))
    topSpots.forEach((row) => rows.push(['top_spot', row.slug, row.views, row.visitors, '', '', '', '', '', '', '', '']))
    topNotes.forEach((row) => rows.push(['top_note', row.slug, row.views, row.visitors, '', '', '', '', '', '', '', '']))
    topPackages.forEach((row) => rows.push(['top_package', row.slug, row.views, row.visitors, '', '', '', '', '', '', '', '']))
    devices.forEach((row) => rows.push(['device', row.label, row.views, row.visitors, '', '', '', '', '', '', '', '']))
    sources.forEach((row) => rows.push(['source', row.label, row.views, row.visitors, '', '', '', '', row.group, '', '', row.key]))
    campaigns.forEach((row) => rows.push(['utm_campaign', row.campaign, row.views, row.visitors, '', '', '', '', row.source, row.medium, row.campaign, '']))
    topPackageOptions.forEach((row) => rows.push(['package_option', row.optionName, row.views, row.viewVisitors || row.visitors, '', '', row.enquiries, row.enquiryRate ?? '', '', '', '', row.packageName || '']))
    packageAcquisition.forEach((row) => rows.push(['package_acquisition', row.source, row.optionViews, row.optionVisitors, '', '', row.enquiries, row.enquiryRate ?? '', row.source, '', row.campaign, '']))
    affiliateProviders.forEach((row) => rows.push(['affiliate_provider', row.provider, '', row.visitors, '', row.clicks, '', '', row.provider, '', '', '']))
    topAffiliateClicks.forEach((row) => rows.push(['affiliate_link', row.title, '', row.visitors || '', '', row.clicks, '', '', row.provider, row.type, '', row.target]))

    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const from = payload.range?.from || range.from
    const to = payload.range?.to || range.to
    downloadTextFile(`jnq-report-${from}-to-${to}.csv`, csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_24%),linear-gradient(180deg,#06101d_0%,#020617_100%)] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)] md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">Performance Report</p>
            <div>
              <h1 className="text-3xl font-semibold text-white md:text-4xl">网站经营与转化报表</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-white/65">
                把可信流量、来源、内容表现、旅游配套转化和联盟点击拆开看。主指标过滤 bot 与后台路径，日期按新加坡时间统计。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!payload || loading} onClick={exportJson} className="border-emerald-200/20 bg-emerald-300/[0.06] text-emerald-50 hover:bg-emerald-300/[0.12]">
              <Download className="mr-2 h-4 w-4" />
              导出给 ChatGPT
            </Button>
            <Button type="button" variant="outline" disabled={!payload || loading} onClick={exportCsv} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
              <Download className="mr-2 h-4 w-4" />
              导出 CSV
            </Button>
            <Link href="/admin">
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回后台
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <CalendarRange className="h-5 w-5 text-emerald-200" />
              日期与数据控制
            </CardTitle>
            <CardDescription className="text-white/55">先选范围，再看与上一段相同长度周期的变化。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-sm text-white/75">开始日期</label>
                <Input type="date" value={range.from} onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))} className="border-white/10 bg-black/20 text-white" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/75">结束日期</label>
                <Input type="date" value={range.to} onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))} className="border-white/10 bg-black/20 text-white" />
              </div>
              <div className="flex flex-wrap gap-2">
                {[7, 30, 90].map((days) => (
                  <Button key={days} type="button" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => setRange(getRangeDays(days))}>
                    {days} 天
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/60">
              Trusted Views 来自 Supabase 第一方记录。Visitors 是浏览器匿名 ID；Sessions 是新版 30 分钟活动窗口，只在新版 Tracking 上线后的流量才有。
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">排除这台设备的测试流量</p>
                <p className="mt-1 text-xs leading-5 text-white/45">建议你自己的电脑与常用测试手机都开启。之后浏览公开网站、测试配套与 CTA 都不会进入第一方报表。</p>
              </div>
              <Button type="button" variant="outline" onClick={toggleDeviceExclusion} className={excludeThisDevice ? 'border-emerald-200/25 bg-emerald-300/[0.08] text-emerald-100 hover:bg-emerald-300/[0.12]' : 'border-white/15 bg-white/5 text-white hover:bg-white/10'}>
                <MonitorOff className="mr-2 h-4 w-4" />
                {excludeThisDevice ? '本机已排除' : '排除本机'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {!payload?.pageViewsReady ? (
          <Card className="border-amber-300/20 bg-amber-500/10 text-white">
            <CardHeader>
              <CardTitle>页面浏览统计暂时不可用</CardTitle>
              <CardDescription className="text-amber-100/75">{payload?.pageViewsError || '正在等待新的浏览记录。'}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {error ? (
          <Card className="border-rose-300/20 bg-rose-500/10 text-white">
            <CardContent className="p-6 text-sm text-rose-100">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            eyebrow="Trusted Views"
            value={loading ? '...' : summary.pageViews || 0}
            detail="过滤 bot / admin 后"
            footer={formatDelta(payload?.comparison?.pageViewsDelta, payload?.comparison?.pageViewsDeltaPercent)}
          />
          <MetricCard
            eyebrow="Visitors"
            value={loading ? '...' : summary.visitors || 0}
            detail="匿名浏览器去重"
            footer={formatDelta(payload?.comparison?.visitorsDelta, payload?.comparison?.visitorsDeltaPercent)}
          />
          <MetricCard
            eyebrow="Sessions"
            value={loading ? '...' : summary.sessions || 0}
            detail={`新版覆盖 ${sessionMetrics.coveragePercent || 0}% 浏览`}
          />
          <MetricCard
            eyebrow="Package Enquiries"
            value={loading ? '...' : summary.packageEnquiries || 0}
            detail={`${summary.packageEnquiryVisitors || 0} 位访客发起查询`}
          />
          <MetricCard
            eyebrow="Affiliate Clicks"
            value={loading ? '...' : summary.affiliateClicks || 0}
            detail={`${summary.affiliateVisitors || 0} 位访客 · ${formatPercent(summary.affiliateVisitorRate)} 访客点击率`}
          />
          <MetricCard
            eyebrow="Acquisition"
            value={loading ? '...' : formatPercent(summary.sourceTrackedRate)}
            detail="可识别外部来源的浏览"
            footer={latestTrafficLabel}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-emerald-200/15 bg-emerald-300/[0.035] text-white">
            <CardHeader>
              <CardTitle>旅游配套转化漏斗</CardTitle>
              <CardDescription className="text-white/50">以独立访客做转换率，事件次数另外保留，避免一个人重复点击把转化率放大。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['主配套 → 方案', packageFunnel.rates?.packageToOption],
                  ['方案 → 配套图', packageFunnel.rates?.optionToBrochure],
                  ['方案 → 查询', packageFunnel.rates?.optionToEnquiry],
                  ['主配套 → 查询', packageFunnel.rates?.packageToEnquiry],
                ].map(([label, rate]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs text-white/42">{label}</div>
                    <div className="mt-2 text-2xl font-semibold">{formatPercent(typeof rate === 'number' ? rate : null)}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['主配套浏览', packageFunnel.packageViews],
                  ['方案详情', packageFunnel.optionViews],
                  ['配套图', packageFunnel.brochureViews],
                  ['WhatsApp 查询', packageFunnel.enquiries],
                  ['WA CTA', packageFunnel.whatsappClicks],
                ].map(([label, metric]) => {
                  const typed = metric as PackageFunnelMetric | undefined
                  return (
                    <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs text-white/42">{String(label)}</div>
                      <div className="mt-2 text-xl font-semibold">{typed?.events || 0}</div>
                      <div className="mt-1 text-xs text-white/40">{typed?.visitors || 0} 位访客</div>
                    </div>
                  )
                })}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/55">方案</TableHead>
                      <TableHead className="text-white/55">详情访客</TableHead>
                      <TableHead className="text-white/55">配套图访客</TableHead>
                      <TableHead className="text-white/55">查询访客</TableHead>
                      <TableHead className="text-white/55">查询率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPackageOptions.length ? topPackageOptions.map((row) => (
                      <TableRow key={row.key} className="border-white/10">
                        <TableCell>
                          <div className="font-medium text-white">{row.optionName}</div>
                          {row.packageName ? <div className="mt-1 text-xs text-white/40">{row.packageName}</div> : null}
                        </TableCell>
                        <TableCell className="text-white/72">{row.viewVisitors ?? row.visitors}</TableCell>
                        <TableCell className="text-white/72">{row.brochureVisitors ?? row.brochureViews}</TableCell>
                        <TableCell className="font-medium text-emerald-200">{row.enquiryVisitors ?? row.enquiries}</TableCell>
                        <TableCell className="text-amber-100">{formatPercent(row.enquiryRate)}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow className="border-white/10"><TableCell colSpan={5} className="h-20 text-center text-white/42">{loading ? '正在读取数据...' : '新漏斗仍在累积数据。'}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>数据可信度</CardTitle>
              <CardDescription className="text-white/50">快速判断当前范围哪些指标可以直接拿来做决定。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/40">Raw Views</div>
                  <div className="mt-2 text-2xl font-semibold">{summary.rawPageViews || 0}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/40">Bot / Preview</div>
                  <div className="mt-2 text-2xl font-semibold">{summary.botPageViews || 0}</div>
                  <div className="mt-1 text-xs text-white/40">{formatPercent(summary.botRate)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/40">Session Tracking</div>
                  <div className="mt-2 text-2xl font-semibold">{sessionMetrics.coveragePercent || 0}%</div>
                  <div className="mt-1 text-xs text-white/40">新版数据覆盖率</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/40">Direct / Unknown</div>
                  <div className="mt-2 text-2xl font-semibold">{summary.directViews || 0}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-white/60">
                {qualityNotes.length ? qualityNotes.join(' ') : '主指标以过滤后的第一方 page_views 为准。'}
                {payload?.quality?.pageViewsTruncated ? ' 当前范围超过读取上限，数字可能低估。' : ''}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>访问深度</CardTitle>
              <CardDescription className="text-white/50">只使用新版 visit_id，不把历史匿名访客 ID 冒充 Session。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard eyebrow="Pages / Session" value={sessionMetrics.pagesPerSession ?? '—'} detail="每次访问平均浏览页数" />
              <MetricCard eyebrow="Multi-page Rate" value={formatPercent(sessionMetrics.multiPageRate)} detail={`${sessionMetrics.multiPageSessions || 0} 个多页 Session`} />
              <MetricCard eyebrow="Multi-page Duration" value={formatDuration(sessionMetrics.avgMultiPageDurationSeconds)} detail="多页 Session 的平均首尾页间隔" />
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-sky-200" />设备</CardTitle>
              <CardDescription className="text-white/50">旧数据会从 User-Agent 推断，新数据直接记录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.length ? devices.map((row) => (
                <div key={row.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium">{deviceLabel(row.key)}</div>
                    <div className="text-right text-sm text-white/65">{row.views} 浏览 · {row.visitors} 访客</div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-sky-200/65" style={{ width: `${summary.pageViews ? Math.min(100, (row.views / summary.pageViews) * 100) : 0}%` }} />
                  </div>
                </div>
              )) : <div className="text-sm text-white/45">暂无设备数据。</div>}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>内容类型</CardTitle>
              <CardDescription className="text-white/50">看 Spot、Guide、Notes、Package 哪一类真正贡献流量。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {contentTypes.length ? contentTypes.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="font-medium">{contentTypeLabel(row.key)}</div>
                  <div className="text-right text-sm text-white/65"><div>{row.views} 浏览</div><div className="text-xs text-white/40">{row.visitors} 访客</div></div>
                </div>
              )) : <div className="text-sm text-white/45">暂无内容类型数据。</div>}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-sky-200" />获客来源</CardTitle>
              <CardDescription className="text-white/50">新版会话会把入口来源带到整个 Visit，不再因为站内跳转丢失来源。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sources.length ? sources.slice(0, 12).map((row) => (
                <div key={row.key} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{row.label}</div>
                      <div className="text-xs text-white/45">{sourceGroupLabel(row.group)}</div>
                    </div>
                    <div className="text-right text-sm text-white/75">
                      <div>{row.views} 浏览</div>
                      <div className="text-xs text-white/45">{row.visitors} 访客</div>
                    </div>
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">还没有来源数据。</div>}
            </CardContent>
          </Card>

          <Card className="border-sky-200/15 bg-sky-300/[0.025] text-white">
            <CardHeader>
              <CardTitle>UTM Campaign</CardTitle>
              <CardDescription className="text-white/50">适合比较小红书、Facebook、Threads、WhatsApp 等你主动投放/分享的链接。</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white/55">Campaign</TableHead>
                        <TableHead className="text-white/55">Source</TableHead>
                        <TableHead className="text-white/55">Medium</TableHead>
                        <TableHead className="text-white/55">浏览</TableHead>
                        <TableHead className="text-white/55">访客</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((row) => (
                        <TableRow key={`${row.source}-${row.medium}-${row.campaign}`} className="border-white/10">
                          <TableCell className="font-medium text-white">{row.campaign}</TableCell>
                          <TableCell className="text-white/65">{row.source}</TableCell>
                          <TableCell className="text-white/65">{row.medium || '—'}</TableCell>
                          <TableCell className="text-white/72">{row.views}</TableCell>
                          <TableCell className="text-white/72">{row.visitors}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-5 py-7 text-sm leading-7 text-white/48">
                  目前还没有 UTM Campaign 数据。以后分享链接可加入例如 <span className="text-sky-100">?utm_source=xiaohongshu&amp;utm_medium=social&amp;utm_campaign=batam</span>。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-emerald-200/15 bg-emerald-300/[0.025] text-white">
          <CardHeader>
            <CardTitle>哪个来源真正带来配套查询？</CardTitle>
            <CardDescription className="text-white/50">这是最重要的经营视图之一：不是看谁带来最多浏览，而是看谁把人带到 Package Option 并发起 WhatsApp 查询。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/55">Source</TableHead>
                    <TableHead className="text-white/55">Campaign</TableHead>
                    <TableHead className="text-white/55">方案访客</TableHead>
                    <TableHead className="text-white/55">查询访客</TableHead>
                    <TableHead className="text-white/55">查询率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packageAcquisition.length ? packageAcquisition.map((row) => (
                    <TableRow key={`${row.source}-${row.campaign}`} className="border-white/10">
                      <TableCell className="font-medium text-white">{row.source}</TableCell>
                      <TableCell className="text-white/60">{row.campaign || '—'}</TableCell>
                      <TableCell className="text-white/72">{row.optionVisitors}</TableCell>
                      <TableCell className="text-emerald-200">{row.enquiryVisitors}</TableCell>
                      <TableCell className="text-amber-100">{formatPercent(row.enquiryRate)}</TableCell>
                    </TableRow>
                  )) : <TableRow className="border-white/10"><TableCell colSpan={5} className="h-20 text-center text-white/42">新版 Attribution 上线后开始累积。</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>每日流量走势</CardTitle>
              <CardDescription className="text-white/50">按 Asia/Singapore 切天；横条只帮助快速看波峰波谷。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {dailyTraffic.length ? dailyTraffic.map((row) => (
                <div key={row.date} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2">
                  <div className="text-xs text-white/55">{formatDateLabel(row.date)}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-200/60" style={{ width: `${Math.max(2, (row.pageViews / maxDailyViews) * 100)}%` }} />
                  </div>
                  <div className="text-right text-xs text-white/65">{row.pageViews} / {row.visitors}</div>
                </div>
              )) : <div className="py-8 text-center text-sm text-white/45">暂无每日流量。</div>}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>Session 入口页</CardTitle>
              <CardDescription className="text-white/50">新版 visit_id 的第一张页面，用来判断真正的 Landing Page。</CardDescription>
            </CardHeader>
            <CardContent>
              <RankedList rows={landingPages.slice(0, 10)} empty="新版 Session 数据刚开始累积。" />
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle>热门页面</CardTitle>
            <CardDescription className="text-white/50">所有公开页面的综合排名，适合快速找增长内容与异常流量。</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedList rows={topPages.slice(0, 15)} empty="还没有页面浏览数据。" />
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {[
            ['最热门 Guide', topGuides, '还没有 Guide 浏览数据。'],
            ['最热门 Spot', topSpots, '还没有 Spot 浏览数据。'],
            ['最热门 Notes', topNotes, '还没有 Notes 浏览数据。'],
            ['最热门 Packages', topPackages, '还没有 Package 浏览数据。'],
          ].map(([title, rows, empty]) => {
            const typedRows = rows as RankedContentRow[]
            return (
              <Card key={String(title)} className="border-white/10 bg-white/5 text-white">
                <CardHeader><CardTitle>{String(title)}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {typedRows.length ? typedRows.slice(0, 12).map((row, index) => (
                    <div key={row.slug} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">{index + 1}</div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{prettySlug(row.slug)}</div>
                          <div className="truncate text-xs text-white/40">{row.slug}</div>
                        </div>
                      </div>
                      <div className="text-right text-sm text-white/70"><div>{row.views} 浏览</div><div className="text-xs text-white/40">{row.visitors} 访客</div></div>
                    </div>
                  )) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">{String(empty)}</div>}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>Affiliate Provider</CardTitle>
              <CardDescription className="text-white/50">先看 Agoda / Trip / Klook 哪个平台整体最容易被点击。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {affiliateProviders.length ? affiliateProviders.map((row) => (
                <div key={row.provider} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="font-medium text-white">{row.provider}</div>
                  <div className="text-right text-sm text-white/65"><div>{row.clicks} clicks</div><div className="text-xs text-white/40">{row.visitors} 访客</div></div>
                </div>
              )) : <div className="text-sm text-white/45">当前范围没有联盟点击。</div>}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>联盟链接表现</CardTitle>
              <CardDescription className="text-white/50">具体哪一个链接被点最多。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topAffiliateClicks.length ? topAffiliateClicks.map((row) => (
                <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-medium text-white">{row.title}</div>
                      <div className="text-xs text-white/50">{row.provider} · {row.type}{row.target ? ` · ${row.target}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-sm text-amber-100">{row.clicks} clicks</div>
                      <div className="mt-1 text-xs text-white/40">{row.visitors || 0} 访客</div>
                    </div>
                  </div>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">当前范围内还没有联盟点击记录。</div>}
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-white/[0.035] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-200" />如何读这份报告</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm leading-7 text-white/58 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white/80">判断内容</p>
              <p className="mt-2">优先看 Trusted Views、Visitors、Landing Page 和各内容类型排名；不要只看 Raw Views。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white/80">判断平台</p>
              <p className="mt-2">优先给外部链接加 UTM，再看 Source / Campaign → Package Enquiry，不要把 Direct / Unknown 当成真实“直接输入网址”。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white/80">判断旅游配套</p>
              <p className="mt-2">看 Option 详情访客和查询率，而不是只看配套图被放大多少次；低浏览高查询的配套也可能更值得推。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white/80">给 ChatGPT 分析</p>
              <p className="mt-2">选择日期后按「导出给 ChatGPT」，把 JSON 直接上传给我；它比截图或普通 CSV 保留更多口径和转化字段。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
