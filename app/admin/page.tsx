'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Fuse from 'fuse.js'
import {
  ArrowUpDown,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Film,
  ImageIcon,
  ImagePlus,
  Link2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Region {
  id: number
  name: string
  name_cn?: string
  country?: string
  parent_id?: number | null
  parent?: {
    id?: number
    name?: string
    name_cn?: string
    country?: string
  } | null
}

interface Location {
  id: number
  name: string
  name_cn?: string
  visit_date?: string | null
  region_id?: number | null
  status?: string
  image_url?: string | null
  images?: string[] | null
  video_url?: string | null
  facebook_video_url?: string | null
  regions?: Region | null
}

type SortOption = 'needs_attention' | 'visit_desc' | 'visit_asc' | 'newest' | 'oldest' | 'name_asc' | 'region'
type FocusFilter = 'all' | 'needs_media' | 'needs_video' | 'needs_affiliate' | 'ready'

function formatVisitDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function normalizeGallery(images?: string[] | null) {
  return Array.isArray(images)
    ? images.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function compareByVisitDate(left: Location, right: Location, ascending = false) {
  const leftVisit = left.visit_date ? Date.parse(left.visit_date) : NaN
  const rightVisit = right.visit_date ? Date.parse(right.visit_date) : NaN
  const leftHasVisit = Number.isFinite(leftVisit)
  const rightHasVisit = Number.isFinite(rightVisit)

  if (leftHasVisit && rightHasVisit && leftVisit !== rightVisit) {
    return ascending ? leftVisit - rightVisit : rightVisit - leftVisit
  }

  if (leftHasVisit !== rightHasVisit) {
    return leftHasVisit ? -1 : 1
  }

  return ascending ? left.id - right.id : right.id - left.id
}

function checklistFor(location: Location, affiliateCount: number) {
  const hasCover = Boolean(String(location.image_url || '').trim())
  const hasGallery = normalizeGallery(location.images).length > 0
  const hasVideo = Boolean(String(location.video_url || '').trim() || String(location.facebook_video_url || '').trim())
  const hasAffiliate = affiliateCount > 0
  const missing = [
    hasCover ? null : '封面',
    hasGallery ? null : '相册',
    hasVideo ? null : '影片',
    hasAffiliate ? null : '联盟',
  ].filter(Boolean) as string[]

  return {
    hasCover,
    hasGallery,
    hasVideo,
    hasAffiliate,
    missing,
    score: missing.length,
    ready: missing.length === 0,
  }
}

function getRegionLabel(region?: Region | null) {
  if (!region) return '未设置'

  const parts = [region.country]

  if (region.parent?.name) {
    parts.push(region.parent.name)
  }

  parts.push(region.name)

  return parts.filter(Boolean).join(' / ')
}

export default function AdminDashboard() {
  const [locations, setLocations] = useState<Location[]>([])
  const [allRegions, setAllRegions] = useState<Region[]>([])
  const [affiliateCounts, setAffiliateCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('needs_attention')
  const [filterRegion, setFilterRegion] = useState('all')
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all')

  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [isBulkDateDialogOpen, setIsBulkDateDialogOpen] = useState(false)
  const [isBulkVideoDialogOpen, setIsBulkVideoDialogOpen] = useState(false)
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [moveTargetRegionId, setMoveTargetRegionId] = useState('')
  const [bulkVisitDate, setBulkVisitDate] = useState('')
  const [bulkVideoUrl, setBulkVideoUrl] = useState('')
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const itemsPerPage = 20
  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      try {
        const [locationsResult, regionsResult, affiliateResult] = await Promise.all([
          supabase
            .from('locations')
            .select(
              'id, name, name_cn, visit_date, region_id, status, image_url, images, video_url, facebook_video_url, regions(id, name, name_cn, country, parent_id, parent:parent_id(id, name, name_cn, country))'
            )
            .order('id', { ascending: false }),
          supabase.from('regions').select('id, name, name_cn, country, parent_id, parent:parent_id(id, name, name_cn, country)').order('name', { ascending: true }),
          supabase.from('affiliate_links').select('location_id, is_active'),
        ])

        if (locationsResult.error) throw locationsResult.error
        if (regionsResult.error) throw regionsResult.error

        const normalizedLocations: Location[] = (locationsResult.data || []).map((item: any) => ({
          ...item,
          regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
        }))

        const normalizedRegions: Region[] = (regionsResult.data || []).map((item: any) => ({
          ...item,
          parent: Array.isArray(item?.parent) ? item.parent[0] || null : item?.parent || null,
        }))

        setLocations(normalizedLocations)
        setAllRegions(normalizedRegions)

        if (!affiliateResult.error && Array.isArray(affiliateResult.data)) {
          const counts = affiliateResult.data.reduce<Record<number, number>>((acc, item: any) => {
            const locationId = Number(item?.location_id || 0)
            if (!locationId || item?.is_active === false) return acc
            acc[locationId] = (acc[locationId] || 0) + 1
            return acc
          }, {})
          setAffiliateCounts(counts)
        } else {
          setAffiliateCounts({})
        }
      } catch (error) {
        console.error('Error fetching admin dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3000)
  }

  const uniqueRegions = useMemo(() => {
    const names = new Set<string>()
    locations.forEach((loc) => {
      if (loc.regions) names.add(getRegionLabel(loc.regions))
    })
    return Array.from(names).sort()
  }, [locations])

  const fuse = useMemo(
    () =>
      new Fuse(locations, {
        includeScore: true,
        threshold: 0.3,
        keys: [
          { name: 'name', weight: 1 },
          { name: 'name_cn', weight: 1 },
          { name: 'regions.name', weight: 0.6 },
          { name: 'regions.country', weight: 0.4 },
        ],
      }),
    [locations]
  )

  const processedLocations = useMemo(() => {
    let result = [...locations]

    if (deferredSearchQuery.trim()) {
      result = fuse.search(deferredSearchQuery.trim()).map((res) => res.item)
    }

    if (filterRegion !== 'all') {
      result = result.filter((loc) => getRegionLabel(loc.regions) === filterRegion)
    }

    if (focusFilter !== 'all') {
      result = result.filter((loc) => {
        const checklist = checklistFor(loc, affiliateCounts[loc.id] || 0)
        if (focusFilter === 'needs_media') return !checklist.hasCover || !checklist.hasGallery
        if (focusFilter === 'needs_video') return !checklist.hasVideo
        if (focusFilter === 'needs_affiliate') return !checklist.hasAffiliate
        if (focusFilter === 'ready') return checklist.ready
        return true
      })
    }

    result.sort((a, b) => {
      if (sortOption === 'needs_attention') {
        const diff = checklistFor(b, affiliateCounts[b.id] || 0).score - checklistFor(a, affiliateCounts[a.id] || 0).score
        return diff || b.id - a.id
      }
      if (sortOption === 'visit_desc') return compareByVisitDate(a, b)
      if (sortOption === 'visit_asc') return compareByVisitDate(a, b, true)
      if (sortOption === 'newest') return b.id - a.id
      if (sortOption === 'oldest') return a.id - b.id
      if (sortOption === 'name_asc') return a.name.localeCompare(b.name)
      return getRegionLabel(a.regions).localeCompare(getRegionLabel(b.regions))
    })

    return result
  }, [affiliateCounts, deferredSearchQuery, filterRegion, focusFilter, fuse, locations, sortOption])

  const summary = useMemo(
    () =>
      locations.reduce(
        (acc, location) => {
          const checklist = checklistFor(location, affiliateCounts[location.id] || 0)
          if (!checklist.hasCover) acc.missingCover += 1
          if (!checklist.hasGallery) acc.missingGallery += 1
          if (!checklist.hasVideo) acc.missingVideo += 1
          if (!checklist.hasAffiliate) acc.missingAffiliate += 1
          if (checklist.ready) acc.ready += 1
          return acc
        },
        { total: locations.length, missingCover: 0, missingGallery: 0, missingVideo: 0, missingAffiliate: 0, ready: 0 }
      ),
    [affiliateCounts, locations]
  )

  const totalPages = Math.max(1, Math.ceil(processedLocations.length / itemsPerPage))
  const paginatedLocations = processedLocations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortOption, filterRegion, focusFilter])

  const handleSelectAll = (checked: boolean) => {
    const currentIds = paginatedLocations.map((loc) => loc.id)
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])))
      return
    }
    setSelectedIds((prev) => prev.filter((id) => !currentIds.includes(id)))
  }

  const handleSelectRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, id])))
      return
    }
    setSelectedIds((prev) => prev.filter((sid) => sid !== id))
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id)
      if (error) throw error
      setLocations((prev) => prev.filter((loc) => loc.id !== id))
      setSelectedIds((prev) => prev.filter((sid) => sid !== id))
      showToast('景点已删除')
    } catch (error) {
      console.error('Error deleting location:', error)
      alert('删除失败，请稍后再试。')
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return
    setIsProcessingBulk(true)
    try {
      const { error } = await supabase.from('locations').delete().in('id', selectedIds)
      if (error) throw error
      setLocations((prev) => prev.filter((loc) => !selectedIds.includes(loc.id)))
      setSelectedIds([])
      setIsBulkDeleteDialogOpen(false)
      showToast(`已删除 ${selectedIds.length} 个景点`)
    } catch (error) {
      console.error('Bulk delete error:', error)
      alert('批量删除失败，请稍后再试。')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkMove = async () => {
    if (!selectedIds.length || !moveTargetRegionId) return
    setIsProcessingBulk(true)
    try {
      const targetRegion = allRegions.find((region) => region.id.toString() === moveTargetRegionId) || null
      const { error } = await supabase.from('locations').update({ region_id: Number.parseInt(moveTargetRegionId, 10) }).in('id', selectedIds)
      if (error) throw error
      setLocations((prev) =>
        prev.map((loc) =>
          selectedIds.includes(loc.id)
            ? { ...loc, region_id: Number.parseInt(moveTargetRegionId, 10), regions: targetRegion }
            : loc
        )
      )
      setSelectedIds([])
      setMoveTargetRegionId('')
      setIsMoveDialogOpen(false)
      showToast(`已修改 ${selectedIds.length} 个景点的地区`)
    } catch (error) {
      console.error('Bulk move error:', error)
      alert('批量修改地区失败，请稍后再试。')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkVisitDateUpdate = async () => {
    if (!selectedIds.length) return
    setIsProcessingBulk(true)
    try {
      const nextVisitDate = bulkVisitDate || null
      const { error } = await supabase.from('locations').update({ visit_date: nextVisitDate }).in('id', selectedIds)
      if (error) throw error
      setLocations((prev) =>
        prev.map((loc) => (selectedIds.includes(loc.id) ? { ...loc, visit_date: nextVisitDate } : loc))
      )
      setSelectedIds([])
      setBulkVisitDate('')
      setIsBulkDateDialogOpen(false)
      showToast(nextVisitDate ? `已更新 ${selectedIds.length} 个景点的打卡日期` : `已清空 ${selectedIds.length} 个景点的打卡日期`)
    } catch (error) {
      console.error('Bulk visit date error:', error)
      alert('批量修改打卡日期失败，请稍后再试。')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkVideoUpdate = async () => {
    if (!selectedIds.length) return
    setIsProcessingBulk(true)
    try {
      const nextVideoUrl = bulkVideoUrl.trim() || null
      const { error } = await supabase.from('locations').update({ video_url: nextVideoUrl }).in('id', selectedIds)
      if (error) throw error
      setLocations((prev) =>
        prev.map((loc) => (selectedIds.includes(loc.id) ? { ...loc, video_url: nextVideoUrl } : loc))
      )
      setSelectedIds([])
      setBulkVideoUrl('')
      setIsBulkVideoDialogOpen(false)
      showToast(nextVideoUrl ? `已更新 ${selectedIds.length} 个景点的 YouTube 影片` : `已清空 ${selectedIds.length} 个景点的 YouTube 影片`)
    } catch (error) {
      console.error('Bulk video update error:', error)
      alert('批量修改 YouTube 影片失败，请稍后再试。')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const isAllPageSelected = paginatedLocations.length > 0 && paginatedLocations.every((loc) => selectedIds.includes(loc.id))
  const isSomePageSelected = paginatedLocations.some((loc) => selectedIds.includes(loc.id)) && !isAllPageSelected

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_26%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-4 pb-24 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[28px] border border-amber-100 bg-white/90 p-6 shadow-[0_24px_80px_-50px_rgba(71,85,105,0.35)] md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">Content Ops</Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">景点管理后台</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                首页先看缺图片、缺影片、缺联盟。标签先不抢戏，后面再交给智能补全。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/regions"><Button variant="outline"><MapPin className="mr-2 h-4 w-4" />地区管理</Button></Link>
            <Link href="/admin/guides"><Button variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"><BookOpen className="mr-2 h-4 w-4" />游记管理</Button></Link>
            <Link href="/admin/notes"><Button variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 hover:bg-fuchsia-100"><BookOpen className="mr-2 h-4 w-4" />长文笔记</Button></Link>
            <Link href="/admin/reports"><Button variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"><CalendarDays className="mr-2 h-4 w-4" />数据报表</Button></Link>
            <Link href="/admin/affiliate"><Button variant="outline" className="border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100"><Link2 className="mr-2 h-4 w-4" />联盟管理</Button></Link>
            <Link href="/admin/facebook-albums"><Button variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"><ImagePlus className="mr-2 h-4 w-4" />Facebook 相册导入</Button></Link>
            <Link href="/admin/klook-widgets"><Button variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"><Link2 className="mr-2 h-4 w-4" />Klook Widgets</Button></Link>
            <Link href="/admin/add"><Button className="bg-orange-500 text-white hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" />录入新景点</Button></Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="border-slate-200 bg-white/90"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.22em] text-slate-500">总景点</p><p className="mt-3 text-3xl font-semibold text-slate-900">{summary.total}</p></CardContent></Card>
          <Card className="border-rose-200 bg-rose-50/70"><CardContent className="p-5"><div className="flex items-center gap-2 text-rose-700"><ImageIcon className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.22em]">缺图片</p></div><p className="mt-3 text-3xl font-semibold text-rose-900">{summary.missingCover + summary.missingGallery}</p><p className="mt-2 text-xs text-rose-700">封面缺 {summary.missingCover} / 相册缺 {summary.missingGallery}</p></CardContent></Card>
          <Card className="border-amber-200 bg-amber-50/70"><CardContent className="p-5"><div className="flex items-center gap-2 text-amber-700"><Film className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.22em]">缺影片</p></div><p className="mt-3 text-3xl font-semibold text-amber-900">{summary.missingVideo}</p><p className="mt-2 text-xs text-amber-700">YouTube 或 Facebook 影片都算</p></CardContent></Card>
          <Card className="border-sky-200 bg-sky-50/70"><CardContent className="p-5"><div className="flex items-center gap-2 text-sky-700"><Link2 className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.22em]">缺联盟</p></div><p className="mt-3 text-3xl font-semibold text-sky-900">{summary.missingAffiliate}</p><p className="mt-2 text-xs text-sky-700">还没挂 Klook / Trip.com 等链接</p></CardContent></Card>
          <Card className="border-emerald-200 bg-emerald-50/70"><CardContent className="p-5"><div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.22em]">较完整</p></div><p className="mt-3 text-3xl font-semibold text-emerald-900">{summary.ready}</p><p className="mt-2 text-xs text-emerald-700">图片、影片、联盟都齐了</p></CardContent></Card>
        </div>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-4 md:grid-cols-[1.4fr_220px_220px_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input className="h-11 pl-9" placeholder="搜索景点、地区..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                  <SelectTrigger className="h-11"><ArrowUpDown className="mr-2 h-4 w-4 text-slate-400" /><SelectValue placeholder="排序方式" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="needs_attention">优先看缺资料</SelectItem>
                  <SelectItem value="visit_desc">按打卡日期：最新在前</SelectItem>
                  <SelectItem value="visit_asc">按打卡日期：最早在前</SelectItem>
                  <SelectItem value="newest">最新添加</SelectItem>
                  <SelectItem value="oldest">最早添加</SelectItem>
                  <SelectItem value="name_asc">名称 A-Z</SelectItem>
                  <SelectItem value="region">按地区</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRegion} onValueChange={setFilterRegion}>
                <SelectTrigger className="h-11"><MapPin className="mr-2 h-4 w-4 text-slate-400" /><SelectValue placeholder="筛选地区" /></SelectTrigger>
                <SelectContent><SelectItem value="all">所有地区</SelectItem>{uniqueRegions.map((region) => <SelectItem key={region} value={region}>{region}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={focusFilter} onValueChange={(value) => setFocusFilter(value as FocusFilter)}>
                <SelectTrigger className="h-11"><SelectValue placeholder="看哪些缺口" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部景点</SelectItem>
                  <SelectItem value="needs_media">只看缺图片</SelectItem>
                  <SelectItem value="needs_video">只看缺影片</SelectItem>
                  <SelectItem value="needs_affiliate">只看缺联盟</SelectItem>
                  <SelectItem value="ready">只看较完整</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(Array.from(new Set(processedLocations.map((loc) => loc.id))))}
                disabled={!processedLocations.length}
              >
                全选当前筛选结果
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds([])}
                disabled={!selectedIds.length}
              >
                清空已选
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-white/90 shadow-md">
          <CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle>景点资料缺口一览 ({processedLocations.length})</CardTitle><span className="text-sm text-slate-500">第 {currentPage} / {totalPages} 页</span></div></CardHeader>
          <CardContent>
            <div className="rounded-xl border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"><Checkbox checked={isAllPageSelected ? true : isSomePageSelected ? 'indeterminate' : false} onCheckedChange={(checked) => handleSelectAll(checked === true)} /></TableHead>
                    <TableHead className="w-[72px]">ID</TableHead>
                    <TableHead className="min-w-[240px]">景点</TableHead>
                    <TableHead>地区</TableHead>
                    <TableHead>打卡日期</TableHead>
                    <TableHead className="min-w-[240px]">资料缺口</TableHead>
                    <TableHead className="w-[96px] text-center">联盟</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-10 w-[180px]" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-[100px]" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                        <TableCell><Skeleton className="h-10 w-[220px]" /></TableCell>
                        <TableCell><Skeleton className="mx-auto h-8 w-12" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-8 w-16" /></TableCell>
                      </TableRow>
                    ))
                  ) : paginatedLocations.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center text-slate-500">没有找到符合条件的景点。</TableCell></TableRow>
                  ) : (
                    paginatedLocations.map((location) => {
                      const checklist = checklistFor(location, affiliateCounts[location.id] || 0)
                      const affiliateCount = affiliateCounts[location.id] || 0
                      return (
                        <TableRow key={location.id} className={selectedIds.includes(location.id) ? 'bg-blue-50/50' : ''}>
                          <TableCell><Checkbox checked={selectedIds.includes(location.id)} onCheckedChange={(checked) => handleSelectRow(location.id, checked === true)} /></TableCell>
                          <TableCell className="font-medium text-slate-500">#{location.id}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-900">{location.name}</div>
                              {location.name_cn ? <div className="text-xs text-slate-500">{location.name_cn}</div> : null}
                              {checklist.ready ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">较完整</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {location.regions ? (
                              <div className="flex flex-col">
                                <span className="w-fit rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{location.regions.name}</span>
                                <span className="mt-1 text-[10px] text-slate-400">{getRegionLabel(location.regions)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">未设置</span>
                            )}
                          </TableCell>
                          <TableCell>{formatVisitDate(location.visit_date)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className={checklist.hasCover ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'}>封面 {checklist.hasCover ? 'OK' : '缺'}</Badge>
                              <Badge variant="outline" className={checklist.hasGallery ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'}>相册 {checklist.hasGallery ? 'OK' : '缺'}</Badge>
                              <Badge variant="outline" className={checklist.hasVideo ? 'border-emerald-200 text-emerald-700' : 'border-amber-200 text-amber-700'}>影片 {checklist.hasVideo ? 'OK' : '缺'}</Badge>
                              <Badge variant="outline" className={checklist.hasAffiliate ? 'border-emerald-200 text-emerald-700' : 'border-sky-200 text-sky-700'}>联盟 {checklist.hasAffiliate ? 'OK' : '缺'}</Badge>
                              {!checklist.ready ? <span className="text-xs text-slate-400">待补：{checklist.missing.join(' / ')}</span> : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-center"><span className="inline-flex min-w-10 items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{affiliateCount}</span></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Link href={`/admin/affiliate?locationId=${location.id}${location.region_id ? `&regionId=${location.region_id}` : ''}`}>
                                <Button variant="outline" size="sm" className="h-8 border-sky-200 px-3 text-sky-700 hover:bg-sky-50 hover:text-sky-800">
                                  联盟
                                </Button>
                              </Link>
                              <Link href={`/admin/edit/${location.id}`}><Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"><Edit className="h-4 w-4" /></Button></Link>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700">
                                    {deletingId === location.id ? <Skeleton className="h-4 w-4 rounded-full" /> : <Trash2 className="h-4 w-4" />}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>确认删除？</AlertDialogTitle>
                                    <AlertDialogDescription>这会永久删除景点“{location.name}”，而且无法撤销。</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(location.id)} className="bg-red-600 hover:bg-red-700">确认删除</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {!loading && processedLocations.length > 0 ? (
              <div className="flex items-center justify-end space-x-2 py-4">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" />上一页</Button>
                <div className="text-sm font-medium text-slate-600">第 {currentPage} / {totalPages} 页</div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>下一页<ChevronRight className="h-4 w-4" /></Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {selectedIds.length > 0 ? (
          <div className="fixed bottom-6 left-1/2 z-50 w-[92%] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl md:w-[900px]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2"><div className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">{selectedIds.length}</div><span className="text-sm font-medium text-slate-700">已选景点</span></div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsBulkVideoDialogOpen(true)} className="border-rose-200 text-rose-700 hover:bg-rose-50"><Film className="mr-2 h-4 w-4" />批量 YouTube</Button>
                <Button variant="outline" size="sm" onClick={() => setIsBulkDateDialogOpen(true)} className="border-amber-200 text-amber-700 hover:bg-amber-50"><CalendarDays className="mr-2 h-4 w-4" />批量日期</Button>
                <Button variant="outline" size="sm" onClick={() => setIsMoveDialogOpen(true)} className="border-blue-200 text-blue-600 hover:bg-blue-50"><MapPin className="mr-2 h-4 w-4" />批量地区</Button>
                <Button variant="destructive" size="sm" onClick={() => setIsBulkDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />批量删除</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedIds([])}><X className="h-4 w-4 text-slate-500" /></Button>
              </div>
            </div>
          </div>
        ) : null}

        <Dialog open={isBulkDateDialogOpen} onOpenChange={setIsBulkDateDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Bulk update visit date</DialogTitle><DialogDescription>Update the visit date for {selectedIds.length} selected spots. Leave it empty to clear the date.</DialogDescription></DialogHeader>
            <div className="space-y-3 py-4"><Input type="date" value={bulkVisitDate} onChange={(event) => setBulkVisitDate(event.target.value)} /><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setBulkVisitDate('')}>Clear input</Button></div></div>
            <DialogFooter><Button variant="outline" onClick={() => setIsBulkDateDialogOpen(false)}>Cancel</Button><Button onClick={handleBulkVisitDateUpdate} disabled={isProcessingBulk} className="bg-amber-600 hover:bg-amber-700">{isProcessingBulk ? "Processing..." : bulkVisitDate ? "Update date" : "Clear date"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isBulkVideoDialogOpen} onOpenChange={setIsBulkVideoDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Bulk set YouTube video</DialogTitle><DialogDescription>Apply one YouTube link to {selectedIds.length} selected spots. Leave it empty to clear the YouTube link.</DialogDescription></DialogHeader>
            <div className="space-y-3 py-4">
              <Input value={bulkVideoUrl} onChange={(event) => setBulkVideoUrl(event.target.value)} placeholder="https://youtu.be/... or https://www.youtube.com/watch?v=..." />
              <div className="text-xs text-slate-500">Useful when one region, such as Batam, should share the same YouTube video.</div>
              <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setBulkVideoUrl('')}>Clear input</Button></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsBulkVideoDialogOpen(false)}>Cancel</Button><Button onClick={handleBulkVideoUpdate} disabled={isProcessingBulk} className="bg-rose-600 hover:bg-rose-700">{isProcessingBulk ? "Processing..." : bulkVideoUrl.trim() ? "Update video" : "Clear video"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>批量修改地区</DialogTitle><DialogDescription>将已选择的 {selectedIds.length} 个景点移动到新的地区。</DialogDescription></DialogHeader>
            <div className="py-4">
              <Select value={moveTargetRegionId} onValueChange={setMoveTargetRegionId}>
                <SelectTrigger><SelectValue placeholder="选择目标地区..." /></SelectTrigger>
                <SelectContent className="max-h-[300px]">{allRegions.map((region) => <SelectItem key={region.id} value={region.id.toString()}>{region.name}{region.name_cn ? ` (${region.name_cn})` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>取消</Button><Button onClick={handleBulkMove} disabled={!moveTargetRegionId || isProcessingBulk} className="bg-blue-600 hover:bg-blue-700">{isProcessingBulk ? '处理中...' : '确认移动'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>确认批量删除？</AlertDialogTitle><AlertDialogDescription>你即将删除已选择的 {selectedIds.length} 个景点。这个操作无法撤销。</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete} disabled={isProcessingBulk} className="bg-red-600 hover:bg-red-700">{isProcessingBulk ? '删除中...' : '确认删除'}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {toastMessage ? (
          <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg bg-black/80 px-4 py-2 text-white shadow-lg">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
