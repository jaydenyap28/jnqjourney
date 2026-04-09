'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Download, Edit, ExternalLink, Filter, Plus, Trash2, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PROVIDERS = [
  { id: 'agoda', name: 'Agoda', color: 'bg-blue-100 text-blue-800' },
  { id: 'booking', name: 'Booking.com', color: 'bg-sky-100 text-sky-800' },
  { id: 'klook', name: 'Klook', color: 'bg-orange-100 text-orange-800' },
  { id: 'kkday', name: 'KKday', color: 'bg-amber-100 text-amber-800' },
  { id: 'trip', name: 'Trip.com', color: 'bg-red-100 text-red-800' },
  { id: 'others', name: '其他', color: 'bg-gray-100 text-gray-800' },
] as const

const LINK_TYPES = [
  { id: 'hotel', name: '酒店' },
  { id: 'ticket', name: '门票' },
  { id: 'tour', name: '行程' },
  { id: 'transport', name: '交通' },
  { id: 'food', name: '美食' },
  { id: 'insurance', name: '保险' },
  { id: 'sim', name: '上网卡' },
  { id: 'others', name: '其他' },
] as const

interface AffiliateLink {
  id: number
  location_id?: number | null
  region_id?: number | null
  provider: string
  link_type: string
  url: string
  title?: string | null
  description?: string | null
  commission_rate?: number | null
  is_active: boolean
  clicks?: number | null
  conversions?: number | null
  locations?: {
    name?: string | null
    name_cn?: string | null
  } | null
  regions?: {
    name?: string | null
    country?: string | null
  } | null
}

interface BasicLocation {
  id: number
  name: string
  name_cn?: string | null
  regions?: {
    name?: string | null
    name_cn?: string | null
    country?: string | null
    parent?: {
      name?: string | null
      name_cn?: string | null
      country?: string | null
    } | null
  } | null
}

interface BasicRegion {
  id: number
  name: string
  name_cn?: string | null
  country?: string | null
  parent?: {
    name?: string | null
    name_cn?: string | null
    country?: string | null
  } | null
}

function getRegionPathLabel(region?: BasicRegion | BasicLocation['regions'] | null) {
  if (!region) return ''

  const parts = [region.country]

  if (region.parent?.name) {
    parts.push(region.parent.name)
  }

  if (region.name) {
    parts.push(region.name)
  }

  return parts.filter(Boolean).join(' / ')
}

function AffiliatePageContent() {
  const searchParams = useSearchParams()

  const [links, setLinks] = useState<AffiliateLink[]>([])
  const [locations, setLocations] = useState<BasicLocation[]>([])
  const [regions, setRegions] = useState<BasicRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProvider, setFilterProvider] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [linksSearch, setLinksSearch] = useState('')
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null)
  const [locationSearch, setLocationSearch] = useState('')
  const [regionSearch, setRegionSearch] = useState('')
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])

  const [form, setForm] = useState({
    region_id: '',
    provider: 'trip',
    link_type: 'ticket',
    url: '',
    title: '',
    description: '',
    commission_rate: '0.00',
    is_active: true,
  })

  const fetchLinks = async () => {
    setLoading(true)

    const { data } = await supabase
      .from('affiliate_links')
      .select(
        `
          *,
          locations(name, name_cn),
          regions(name, country)
        `
      )
      .order('created_at', { ascending: false })

    setLinks(data || [])
    setLoading(false)
  }

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('id, name, name_cn, regions:region_id(name, name_cn, country, parent:parent_id(name, name_cn, country))')
      .order('name')
      .limit(500)

    const normalizedLocations: BasicLocation[] = (data || []).map((item: any) => ({
      ...item,
      regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
    }))

    setLocations(normalizedLocations)
  }

  const fetchRegions = async () => {
    const { data } = await supabase
      .from('regions')
      .select('id, name, name_cn, country, parent:parent_id(name, name_cn, country)')
      .order('name')

    const normalizedRegions: BasicRegion[] = (data || []).map((item: any) => ({
      ...item,
      parent: Array.isArray(item?.parent) ? item.parent[0] || null : item?.parent || null,
    }))

    setRegions(normalizedRegions)
  }

  const resetForm = useCallback((respectSearchParams = true) => {
    const prefilledLocationId = respectSearchParams ? searchParams.get('locationId') || '' : ''

    setForm({
      region_id: respectSearchParams ? searchParams.get('regionId') || '' : '',
      provider: 'trip',
      link_type: 'ticket',
      url: '',
      title: '',
      description: '',
      commission_rate: '0.00',
      is_active: true,
    })

    setSelectedLocationIds(prefilledLocationId ? [prefilledLocationId] : [])
    setEditingLinkId(null)
  }, [searchParams])

  useEffect(() => {
    fetchLinks()
    fetchLocations()
    fetchRegions()
  }, [])

  useEffect(() => {
    if (!editingLinkId) {
      resetForm(true)
    }
  }, [editingLinkId, resetForm])

  const selectedLocations = useMemo(
    () => locations.filter((location) => selectedLocationIds.includes(String(location.id))),
    [locations, selectedLocationIds]
  )

  const selectedRegion = useMemo(
    () => regions.find((region) => String(region.id) === form.region_id) || null,
    [form.region_id, regions]
  )

  const filteredLinks = useMemo(() => {
    return links.filter((link) => {
      if (filterProvider !== 'all' && link.provider !== filterProvider) return false
      if (filterType !== 'all' && link.link_type !== filterType) return false
      if (linksSearch.trim()) {
        const keyword = linksSearch.trim().toLowerCase()
        const haystack = [
          link.title,
          link.description,
          link.url,
          link.provider,
          link.link_type,
          link.locations?.name,
          link.locations?.name_cn,
          link.regions?.name,
          link.regions?.country,
        ]
          .map((item) => String(item || '').toLowerCase())
          .join(' ')

        if (!haystack.includes(keyword)) return false
      }
      return true
    })
  }, [filterProvider, filterType, links, linksSearch])

  const locationAffiliateCounts = useMemo(() => {
    return links.reduce<Record<number, number>>((accumulator, link) => {
      if (typeof link.location_id === 'number') {
        accumulator[link.location_id] = (accumulator[link.location_id] || 0) + 1
      }
      return accumulator
    }, {})
  }, [links])

  const filteredLocationOptions = useMemo(() => {
    const keyword = locationSearch.trim().toLowerCase()
    if (!keyword) return locations

    return locations.filter((location) => {
      const haystack = [location.name, location.name_cn, location.regions?.name, location.regions?.parent?.name]
        .map((item) => String(item || '').toLowerCase())
        .join(' ')

      return haystack.includes(keyword)
    })
  }, [locationSearch, locations])

  const filteredRegionOptions = useMemo(() => {
    const keyword = regionSearch.trim().toLowerCase()
    if (!keyword) return regions

    return regions.filter((region) => {
      const haystack = [region.name, region.name_cn, region.country, region.parent?.name]
        .map((item) => String(item || '').toLowerCase())
        .join(' ')

      return haystack.includes(keyword)
    })
  }, [regionSearch, regions])

  const totalClicks = filteredLinks.reduce((sum, link) => sum + Number(link.clicks || 0), 0)
  const totalConversions = filteredLinks.reduce((sum, link) => sum + Number(link.conversions || 0), 0)

  const handleToggleLocationSelection = (locationId: string, checked: boolean) => {
    setSelectedLocationIds((prev) =>
      checked ? Array.from(new Set([...prev, locationId])) : prev.filter((item) => item !== locationId)
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const locationIds = selectedLocationIds.length
      ? selectedLocationIds.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : []

    const basePayload = {
      region_id: form.region_id ? Number(form.region_id) : null,
      provider: form.provider,
      link_type: form.link_type,
      url: form.url.trim(),
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      commission_rate: Number(form.commission_rate || 0),
      is_active: form.is_active,
    }

    let error: { message?: string } | null = null

    if (editingLinkId) {
      const [primaryLocationId, ...extraLocationIds] = locationIds

      const updateResult = await supabase
        .from('affiliate_links')
        .update({
          ...basePayload,
          location_id: primaryLocationId || null,
        })
        .eq('id', editingLinkId)

      if (updateResult.error) {
        error = updateResult.error
      } else if (extraLocationIds.length) {
        const insertResult = await supabase.from('affiliate_links').insert(
          extraLocationIds.map((locationId) => ({
            ...basePayload,
            location_id: locationId,
          }))
        )

        if (insertResult.error) {
          error = insertResult.error
        }
      }
    } else {
      const payloads = (locationIds.length ? locationIds : [null]).map((locationId) => ({
        ...basePayload,
        location_id: locationId,
      }))

      const insertResult = await supabase.from('affiliate_links').insert(payloads)
      if (insertResult.error) {
        error = insertResult.error
      }
    }

    if (error) {
      alert(`${editingLinkId ? '更新失败' : '添加失败'}: ${error.message}`)
      return
    }

    const affectedCount = Math.max(locationIds.length, 1)
    alert(
      editingLinkId
        ? `联盟链接已更新${affectedCount > 1 ? `，并额外复制到 ${affectedCount - 1} 个景点` : ''}`
        : `联盟链接已添加到 ${affectedCount} 个景点/位置`
    )

    resetForm(true)
    fetchLinks()
  }

  const handleStartEdit = (link: AffiliateLink) => {
    const nextLocationId = link.location_id ? String(link.location_id) : ''

    setEditingLinkId(link.id)
    setForm({
      region_id: link.region_id ? String(link.region_id) : '',
      provider: link.provider || 'klook',
      link_type: link.link_type || 'ticket',
      url: link.url || '',
      title: link.title || '',
      description: link.description || '',
      commission_rate: String(link.commission_rate ?? '0.00'),
      is_active: link.is_active,
    })
    setSelectedLocationIds(nextLocationId ? [nextLocationId] : [])

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这条联盟链接吗？')) return

    const { error } = await supabase.from('affiliate_links').delete().eq('id', id)
    if (error) {
      alert(`删除失败: ${error.message}`)
      return
    }

    if (editingLinkId === id) {
      resetForm(true)
    }

    fetchLinks()
  }

  const handleToggleActive = async (id: number, current: boolean) => {
    const { error } = await supabase
      .from('affiliate_links')
      .update({ is_active: !current })
      .eq('id', id)

    if (error) {
      alert(`更新失败: ${error.message}`)
      return
    }

    fetchLinks()
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">联盟链接管理</h1>
          <p className="text-gray-600">集中管理 Klook、Trip.com、Booking、Agoda 等联盟营销链接。</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" />
            导出当前视图
          </Button>
          <Link href="/admin">
            <Button variant="outline">返回景点后台</Button>
          </Link>
        </div>
      </div>

      {(selectedLocations.length > 0 || selectedRegion) ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="flex flex-col gap-2 p-4 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-semibold">当前带着上下文进入联盟后台</p>
              <p>
                {selectedLocations.length > 0
                  ? `景点：${selectedLocations[0].name}${selectedLocations[0].name_cn ? ` (${selectedLocations[0].name_cn})` : ''}${selectedLocations.length > 1 ? ` 等 ${selectedLocations.length} 个景点` : ''}`
                  : null}
                {selectedLocations.length > 0 && selectedRegion ? ' / ' : null}
                {selectedRegion ? `地区：${selectedRegion.name}${selectedRegion.country ? ` (${selectedRegion.country})` : ''}` : null}
              </p>
            </div>
            <Button variant="outline" onClick={() => resetForm(false)}>
              清除预填
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">{editingLinkId ? '编辑联盟链接' : '添加联盟链接'}</CardTitle>
              {editingLinkId ? (
                <Button variant="ghost" size="sm" onClick={() => resetForm(true)}>
                  <X className="mr-2 h-4 w-4" />
                  取消编辑
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {editingLinkId ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  正在编辑第 #{editingLinkId} 条联盟链接。你可以重新指定它要显示的景点或地区。
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>展示到哪些景点</Label>
                <Input
                  value={locationSearch}
                  onChange={(event) => setLocationSearch(event.target.value)}
                  placeholder="先搜景点名字，再勾选多个景点"
                />

                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                    <span>已选 {selectedLocationIds.length} 个景点</span>
                    {selectedLocationIds.length > 0 ? (
                      <button
                        type="button"
                        className="font-medium text-sky-700"
                        onClick={() => setSelectedLocationIds([])}
                      >
                        清空
                      </button>
                    ) : null}
                  </div>

                  {selectedLocations.length > 0 ? (
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 px-3 py-3">
                      {selectedLocations.map((location) => (
                        <button
                          key={location.id}
                          type="button"
                          onClick={() => setSelectedLocationIds((prev) => prev.filter((item) => item !== String(location.id)))}
                          className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900"
                        >
                          <span>{location.name_cn || location.name}</span>
                          <span className="text-sky-500">?</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="max-h-56 space-y-2 overflow-y-auto p-3">
                    {filteredLocationOptions.length > 0 ? (
                      filteredLocationOptions.slice(0, 80).map((location) => {
                        const checked = selectedLocationIds.includes(String(location.id))

                        return (
                          <label
                            key={location.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                              checked ? 'border-sky-300 bg-sky-50 text-sky-950' : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => handleToggleLocationSelection(String(location.id), event.target.checked)}
                              className="mt-1"
                            />
                            <span className="flex flex-col">
                              <span>
                                {location.name}
                                {location.name_cn ? ` (${location.name_cn})` : ''}
                              </span>
                              <span className="mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 text-slate-700">
                                {locationAffiliateCounts[location.id] ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                                    {`已绑 ${locationAffiliateCounts[location.id]} 条`}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">未绑定</span>
                                )}
                              </span>
                              {location.regions ? (
                                <span className="mt-1 text-xs text-slate-500">{getRegionPathLabel(location.regions)}</span>
                              ) : null}
                            </span>
                          </label>
                        )
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                        没有找到符合的景点。
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  多选后，保存时会自动为每个景点创建一条对应的联盟链接。
                </p>
              </div>

              <div className="space-y-2">
                <Label>展示到哪个地区</Label>
                <Input
                  value={regionSearch}
                  onChange={(event) => setRegionSearch(event.target.value)}
                  placeholder="先搜地区名字，再选择绑定对象"
                />
                <Select
                  value={form.region_id || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, region_id: value === '__none__' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择地区" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不绑定地区</SelectItem>
                    {filteredRegionOptions.map((region) => (
                      <SelectItem key={region.id} value={String(region.id)}>
                        {region.name}
                        {getRegionPathLabel(region) ? ` (${getRegionPathLabel(region)})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>平台</Label>
                  <Select value={form.provider} onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>链接类型</Label>
                  <Select value={form.link_type} onValueChange={(value) => setForm((prev) => ({ ...prev, link_type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_TYPES.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>联盟链接 URL</Label>
                <Input
                  value={form.url}
                  onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="https://www.klook.com/... 或 https://trip.com/..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>标题</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="例如：藏王树冰一日游 / 查看附近酒店"
                />
              </div>

              <div className="space-y-2">
                <Label>简短说明</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="例如：适合先预订好入场时段"
                />
              </div>

              <div className="space-y-2">
                <Label>佣金比例 (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.commission_rate}
                  onChange={(event) => setForm((prev) => ({ ...prev, commission_rate: event.target.value }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                  className="rounded"
                />
                启用这条链接
              </label>

              <Button type="submit" className="w-full">
                {editingLinkId ? <Edit className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingLinkId ? '保存这条联盟链接' : '添加联盟链接'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>联盟链接列表</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={linksSearch}
                    onChange={(event) => setLinksSearch(event.target.value)}
                    placeholder="搜索景点、住宿、标题或链接"
                    className="w-56"
                  />
                  <Select value={filterProvider} onValueChange={setFilterProvider}>
                    <SelectTrigger className="w-40">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="平台" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有平台</SelectItem>
                      {PROVIDERS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-40">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有类型</SelectItem>
                      {LINK_TYPES.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center">正在载入...</div>
              ) : filteredLinks.length === 0 ? (
                <div className="py-8 text-center text-gray-500">还没有联盟链接。</div>
              ) : (
                <>
                  <div className="mb-4 text-sm text-gray-600">
                    共 {filteredLinks.length} 条，累计点击 {totalClicks}，累计转化 {totalConversions}
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>平台 / 类型</TableHead>
                          <TableHead>展示位置</TableHead>
                          <TableHead>标题</TableHead>
                          <TableHead>点击 / 转化</TableHead>
                          <TableHead>佣金</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLinks.map((link) => {
                          const provider = PROVIDERS.find((item) => item.id === link.provider)
                          const linkType = LINK_TYPES.find((item) => item.id === link.link_type)
                          const association = link.locations
                            ? `景点：${link.locations.name}`
                            : link.regions
                              ? `地区：${link.regions.name}`
                              : '全站通用'

                          return (
                            <TableRow key={link.id}>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <Badge className={`w-fit ${provider?.color || 'bg-gray-100 text-gray-800'}`}>
                                    {provider?.name || link.provider}
                                  </Badge>
                                  <span className="text-xs text-gray-500">{linkType?.name || link.link_type}</span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[220px] truncate" title={association}>
                                {association}
                              </TableCell>
                              <TableCell className="max-w-[220px] truncate" title={link.title || link.url}>
                                {link.title || '(未填写标题)'}
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>点击: {link.clicks || 0}</div>
                                <div>转化: {link.conversions || 0}</div>
                              </TableCell>
                              <TableCell>{link.commission_rate || 0}%</TableCell>
                              <TableCell>
                                <Badge
                                  variant={link.is_active ? 'default' : 'secondary'}
                                  className="cursor-pointer"
                                  onClick={() => handleToggleActive(link.id, link.is_active)}
                                >
                                  {link.is_active ? '启用' : '停用'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="ghost" onClick={() => handleStartEdit(link)} title="编辑这条联盟链接">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => window.open(link.url, '_blank')} title="打开链接">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDelete(link.id)} title="删除">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">使用建议</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-700">
              <p>1. 先在联盟平台拿到自己的专属链接，例如 Klook 门票、Trip.com 酒店。</p>
              <p>2. 你现在可以一次勾选多个景点，保存时系统会自动帮你拆成多条对应记录。</p>
              <p>3. 如果你想整个地区共用一条链接，就绑定地区；如果只想放在特定景点，就多选这些景点。</p>
              <p>4. 每个景点先放 2 到 4 条高相关链接最舒服，不要一次堆太多。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function AffiliatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">正在载入联盟后台...</div>}>
      <AffiliatePageContent />
    </Suspense>
  )
}
