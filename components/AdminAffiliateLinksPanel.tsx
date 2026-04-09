'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Link2, Loader2, Plus, Trash2 } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PROVIDERS = [
  { id: 'agoda', name: 'Agoda', tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'booking', name: 'Booking.com', tone: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'klook', name: 'Klook', tone: 'bg-orange-100 text-orange-800 border-orange-200' },
  { id: 'kkday', name: 'KKday', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'trip', name: 'Trip.com', tone: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'others', name: '其他', tone: 'bg-stone-100 text-stone-800 border-stone-200' },
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

type AffiliateScope = 'location' | 'region'

interface AffiliateLinkRecord {
  id: number
  provider: string
  link_type: string
  url: string
  title?: string | null
  description?: string | null
  commission_rate?: number | null
  is_active: boolean
  clicks?: number | null
  conversions?: number | null
  location_id?: number | null
  region_id?: number | null
}

interface AdminAffiliateLinksPanelProps {
  locationId: number
  locationName: string
  regionId?: number | null
  regionName?: string | null
}

export default function AdminAffiliateLinksPanel({
  locationId,
  locationName,
  regionId,
  regionName,
}: AdminAffiliateLinksPanelProps) {
  const [links, setLinks] = useState<AffiliateLinkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useState<AffiliateScope>('location')
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({
    provider: 'trip',
    link_type: 'ticket',
    url: '',
    title: '',
    description: '',
    commission_rate: '0.00',
  })

  const fetchLinks = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('affiliate_links')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })

    if (regionId) {
      query = supabase
        .from('affiliate_links')
        .select('*')
        .or(`location_id.eq.${locationId},region_id.eq.${regionId}`)
        .order('created_at', { ascending: false })
    }

    const { data, error } = await query

    if (!error) {
      setLinks(data || [])
    }

    setLoading(false)
  }, [locationId, regionId])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  useEffect(() => {
    if (!regionId && scope === 'region') {
      setScope('location')
    }
  }, [regionId, scope])

  const groupedLinks = useMemo(() => {
    const locationLinks = links.filter((link) => link.location_id === locationId)
    const regionLinks = regionId ? links.filter((link) => link.region_id === regionId && link.location_id !== locationId) : []

    return { locationLinks, regionLinks }
  }, [links, locationId, regionId])

  const handleAddLink = async () => {
    if (!form.url.trim()) {
      setMessage('请先填写联盟链接 URL')
      return
    }

    setSaving(true)
    setMessage(null)

    const payload = {
      provider: form.provider,
      link_type: form.link_type,
      url: form.url.trim(),
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      commission_rate: Number(form.commission_rate || 0),
      is_active: true,
      location_id: scope === 'location' ? locationId : null,
      region_id: scope === 'region' ? regionId || null : null,
    }

    const { error } = await supabase.from('affiliate_links').insert(payload)

    if (error) {
      setMessage(`添加失败：${error.message}`)
      setSaving(false)
      return
    }

    setForm({
      provider: form.provider,
      link_type: form.link_type,
      url: '',
      title: '',
      description: '',
      commission_rate: '0.00',
    })
    setMessage('联盟链接已添加')
    setSaving(false)
    fetchLinks()
  }

  const handleToggleActive = async (link: AffiliateLinkRecord) => {
    const { error } = await supabase
      .from('affiliate_links')
      .update({ is_active: !link.is_active })
      .eq('id', link.id)

    if (error) {
      setMessage(`更新失败：${error.message}`)
      return
    }

    setLinks((prev) =>
      prev.map((item) => (item.id === link.id ? { ...item, is_active: !item.is_active } : item))
    )
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这条联盟链接吗？')) return

    const { error } = await supabase.from('affiliate_links').delete().eq('id', id)

    if (error) {
      setMessage(`删除失败：${error.message}`)
      return
    }

    setLinks((prev) => prev.filter((item) => item.id !== id))
    setMessage('联盟链接已删除')
  }

  const renderLinkCard = (link: AffiliateLinkRecord, scopeLabel: string) => {
    const provider = PROVIDERS.find((item) => item.id === link.provider)
    const type = LINK_TYPES.find((item) => item.id === link.link_type)

    return (
      <div
        key={link.id}
        className="rounded-2xl border border-stone-200 bg-white/90 p-4 shadow-[0_14px_40px_rgba(48,33,15,0.06)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge className={`border ${provider?.tone || 'bg-stone-100 text-stone-800 border-stone-200'}`}>
                {provider?.name || link.provider}
              </Badge>
              <Badge variant="outline">{type?.name || link.link_type}</Badge>
              <Badge variant="secondary">{scopeLabel}</Badge>
              {!link.is_active ? <Badge variant="secondary">已停用</Badge> : null}
            </div>

            <div>
              <p className="font-semibold text-stone-900">{link.title || '未填写标题'}</p>
              <p className="mt-1 text-sm text-stone-500">{link.description || '没有填写补充说明。'}</p>
            </div>
          </div>

          <div className="text-right text-xs text-stone-500">
            <div>点击 {link.clicks || 0}</div>
            <div>转化 {link.conversions || 0}</div>
            <div>佣金 {link.commission_rate || 0}%</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-2 text-sm text-stone-700 transition hover:text-stone-950"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{link.url}</span>
          </a>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleToggleActive(link)}>
              {link.is_active ? '停用' : '启用'}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                打开
              </a>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(link.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(250,246,239,0.92))] p-5 shadow-[0_24px_80px_rgba(56,35,13,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">Affiliate Planning</p>
          <div>
            <h3 className="text-xl font-semibold text-stone-950">联盟营销链接</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
              这里直接管理当前景点要展示的 Klook 门票、Trip.com 酒店、包车、上网卡等链接。
            </p>
          </div>
        </div>

        <Button type="button" variant="outline" asChild>
          <Link
            href={`/admin/affiliate?locationId=${locationId}${regionId ? `&regionId=${regionId}` : ''}`}
            className="inline-flex items-center gap-2"
          >
            打开完整联盟后台
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-stone-200 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">景点专属</p>
                <p className="mt-2 text-sm font-medium text-stone-900">{locationName}</p>
                <p className="mt-1 text-xs text-stone-500">适合放门票、体验、一日游等强相关链接。</p>
              </CardContent>
            </Card>
            <Card className="border-stone-200 bg-white/80 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">地区通用</p>
                <p className="mt-2 text-sm font-medium text-stone-900">{regionName || '未绑定地区'}</p>
                <p className="mt-1 text-xs text-stone-500">适合放附近酒店、交通、SIM 卡等地区型推荐。</p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-8 text-center text-sm text-stone-500">
              正在载入联盟链接...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-stone-900">当前景点的专属链接</h4>
                  <span className="text-xs text-stone-500">{groupedLinks.locationLinks.length} 条</span>
                </div>
                {groupedLinks.locationLinks.length > 0 ? (
                  <div className="space-y-3">
                    {groupedLinks.locationLinks.map((link) => renderLinkCard(link, '景点专属'))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-6 text-sm text-stone-500">
                    这个景点还没有专属联盟链接。
                  </div>
                )}
              </div>

              {regionId ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-stone-900">当前地区的通用链接</h4>
                    <span className="text-xs text-stone-500">{groupedLinks.regionLinks.length} 条</span>
                  </div>
                  {groupedLinks.regionLinks.length > 0 ? (
                    <div className="space-y-3">
                      {groupedLinks.regionLinks.map((link) => renderLinkCard(link, '地区通用'))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-6 text-sm text-stone-500">
                      这个地区还没有通用联盟链接。
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <Card className="border-stone-200 bg-white/88 shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Quick Add</p>
              <h4 className="text-lg font-semibold text-stone-950">添加一条新链接</h4>
              <p className="text-sm text-stone-600">建议每个景点先放 2 到 4 条最相关的推荐，不要一次塞太多。</p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1">
              <button
                type="button"
                onClick={() => setScope('location')}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  scope === 'location' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500'
                }`}
              >
                绑定当前景点
              </button>
              <button
                type="button"
                onClick={() => regionId && setScope('region')}
                disabled={!regionId}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  scope === 'region'
                    ? 'bg-white text-stone-950 shadow-sm'
                    : 'text-stone-500 disabled:cursor-not-allowed disabled:text-stone-300'
                }`}
              >
                绑定当前地区
              </button>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
              这条链接会绑定到：
              <span className="ml-1 font-semibold text-stone-950">
                {scope === 'location' ? locationName : regionName || '当前地区'}
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
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
                  <Label>类型</Label>
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
                />
              </div>

              <div className="space-y-2">
                <Label>标题</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="例如：立即预订门票 / 查看附近酒店"
                />
              </div>

              <div className="space-y-2">
                <Label>补充说明</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="例如：适合提前订好时段，旺季会满"
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

              <Button
                type="button"
                className="w-full bg-stone-900 text-white hover:bg-stone-800"
                disabled={saving}
                onClick={handleAddLink}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                添加联盟链接
              </Button>
            </div>

            {message ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {message}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
