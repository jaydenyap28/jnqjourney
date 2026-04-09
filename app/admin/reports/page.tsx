'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowLeft, BarChart3, BookOpen, ExternalLink, MapPin, MousePointerClick } from 'lucide-react'
import { adminFetch } from '@/lib/admin-fetch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface DailyTrafficRow {
  date: string
  pageViews: number
  visitors: number
}

interface RankedContentRow {
  slug: string
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
}

interface ReportsPayload {
  summary?: {
    pageViews?: number
    visitors?: number
    affiliateClicks?: number
    latestDay?: DailyTrafficRow | null
  }
  dailyTraffic?: DailyTrafficRow[]
  topGuides?: RankedContentRow[]
  topSpots?: RankedContentRow[]
  topAffiliateClicks?: RankedAffiliateRow[]
  pageViewsReady?: boolean
  pageViewsError?: string | null
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}

function prettySlug(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function AdminReportsPage() {
  const [payload, setPayload] = useState<ReportsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchReports = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await adminFetch('/api/admin/reports', { cache: 'no-store' })
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result?.error || '读取报表失败。')
        }

        if (!cancelled) {
          setPayload(result)
        }
      } catch (fetchError: any) {
        if (!cancelled) {
          setError(fetchError?.message || '读取报表失败。')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchReports()
    return () => {
      cancelled = true
    }
  }, [])

  const summary = payload?.summary || {}
  const dailyTraffic = payload?.dailyTraffic || []
  const topGuides = payload?.topGuides || []
  const topSpots = payload?.topSpots || []
  const topAffiliateClicks = payload?.topAffiliateClicks || []

  const latestTrafficLabel = useMemo(() => {
    if (!summary.latestDay?.date) return '还没有数据'
    return `${formatDateLabel(summary.latestDay.date)} · ${summary.latestDay.visitors || 0} 位访客`
  }, [summary.latestDay])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_24%),linear-gradient(180deg,#06101d_0%,#020617_100%)] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)] md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">Performance Report</p>
            <div>
              <h1 className="text-3xl font-semibold text-white md:text-4xl">网站与联盟点击报表</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-white/65">
                看最近 30 天的网站浏览、热门游记、热门景点，以及哪些联盟链接最有人点。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin">
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回后台首页
              </Button>
            </Link>
          </div>
        </div>

        {!payload?.pageViewsReady ? (
          <Card className="border-amber-300/20 bg-amber-500/10 text-white">
            <CardHeader>
              <CardTitle>还没启用页面浏览统计</CardTitle>
              <CardDescription className="text-amber-100/75">
                先在 Supabase SQL Editor 跑 `supabase_analytics.sql`，网站才会开始记录每日访客与页面浏览。
              </CardDescription>
            </CardHeader>
            {payload?.pageViewsError ? (
              <CardContent className="text-sm text-amber-100/80">{payload.pageViewsError}</CardContent>
            ) : null}
          </Card>
        ) : null}

        {error ? (
          <Card className="border-rose-300/20 bg-rose-500/10 text-white">
            <CardContent className="p-6 text-sm text-rose-100">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-emerald-200">
                <Activity className="h-4 w-4" />
                <p className="text-xs uppercase tracking-[0.24em]">Page Views</p>
              </div>
              <p className="mt-3 text-3xl font-semibold">{loading ? '...' : summary.pageViews || 0}</p>
              <p className="mt-2 text-xs text-white/50">最近 30 天页面浏览总数</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sky-200">
                <BarChart3 className="h-4 w-4" />
                <p className="text-xs uppercase tracking-[0.24em]">Visitors</p>
              </div>
              <p className="mt-3 text-3xl font-semibold">{loading ? '...' : summary.visitors || 0}</p>
              <p className="mt-2 text-xs text-white/50">按 session 去重的最近 30 天访客</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-amber-200">
                <MousePointerClick className="h-4 w-4" />
                <p className="text-xs uppercase tracking-[0.24em]">Affiliate Clicks</p>
              </div>
              <p className="mt-3 text-3xl font-semibold">{loading ? '...' : summary.affiliateClicks || 0}</p>
              <p className="mt-2 text-xs text-white/50">最近 30 天联盟链接点击数</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-fuchsia-200">
                <BookOpen className="h-4 w-4" />
                <p className="text-xs uppercase tracking-[0.24em]">Latest Day</p>
              </div>
              <p className="mt-3 text-base font-medium">{loading ? '...' : latestTrafficLabel}</p>
              <p className="mt-2 text-xs text-white/50">最新有记录的一天</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>每日访客走势</CardTitle>
              <CardDescription className="text-white/50">最近 30 天的 page views 与去重访客</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/55">日期</TableHead>
                      <TableHead className="text-white/55">访客</TableHead>
                      <TableHead className="text-white/55">浏览</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyTraffic.length ? dailyTraffic.map((row) => (
                      <TableRow key={row.date} className="border-white/10">
                        <TableCell className="text-white">{formatDateLabel(row.date)}</TableCell>
                        <TableCell className="text-white/75">{row.visitors}</TableCell>
                        <TableCell className="text-white/75">{row.pageViews}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow className="border-white/10">
                        <TableCell colSpan={3} className="h-20 text-center text-white/45">
                          {loading ? '正在读取数据...' : '还没有页面浏览数据。'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>联盟点击表现</CardTitle>
              <CardDescription className="text-white/50">最近 30 天点击最多的联盟链接</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topAffiliateClicks.length ? topAffiliateClicks.map((row) => (
                <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-medium text-white">{row.title}</div>
                      <div className="text-xs text-white/50">
                        {row.provider} · {row.type} {row.target ? `· ${row.target}` : ''}
                      </div>
                    </div>
                    <div className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-sm text-amber-100">
                      {row.clicks} clicks
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                  {loading ? '正在读取数据...' : '最近 30 天还没有联盟点击记录。'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>最热门游记</CardTitle>
              <CardDescription className="text-white/50">最近 30 天点击最多的 guide 页面</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topGuides.length ? topGuides.map((row, index) => (
                <div key={row.slug} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{prettySlug(row.slug)}</div>
                      <div className="text-xs text-white/45">{row.slug}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-white/75">
                    <div>{row.views} 浏览</div>
                    <div className="text-xs text-white/45">{row.visitors} 访客</div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                  {loading ? '正在读取数据...' : '还没有游记浏览数据。'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle>最热门景点</CardTitle>
              <CardDescription className="text-white/50">最近 30 天点击最多的 spot 页面</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topSpots.length ? topSpots.map((row, index) => (
                <div key={row.slug} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{prettySlug(row.slug)}</div>
                      <div className="text-xs text-white/45">{index + 1} 位</div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-white/75">
                    <div>{row.views} 浏览</div>
                    <div className="text-xs text-white/45">{row.visitors} 访客</div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                  {loading ? '正在读取数据...' : '还没有景点浏览数据。'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="rounded-[26px] border border-white/10 bg-white/5 p-5 text-sm leading-7 text-white/60">
          页面浏览需要先运行 `supabase_analytics.sql`。
          联盟点击则会继续沿用你现在已经有的 `affiliate_clicks` 数据。
          上线后这里就能慢慢看出哪篇游记、哪个景点、哪种联盟链接最会带流量。
        </div>
      </div>
    </div>
  )
}
