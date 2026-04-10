'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit, Plus, Search, Trash2, X } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface WidgetRecord {
  id: string
  title: string
  description?: string
  htmlCode: string
  locationIds: number[]
  regionIds: number[]
  isActive: boolean
  sortOrder: number
  updatedAt: string
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
  } | null
}

const EMPTY_FORM = {
  id: '',
  title: '',
  description: '',
  htmlCode: '',
  isActive: true,
  sortOrder: 0,
}

function regionPathLabel(region?: BasicRegion | BasicLocation['regions'] | null) {
  if (!region) return ''
  return [region.country, region.parent?.name, region.name].filter(Boolean).join(' / ')
}

export default function AdminKlookWidgetsPage() {
  const [widgets, setWidgets] = useState<WidgetRecord[]>([])
  const [locations, setLocations] = useState<BasicLocation[]>([])
  const [regions, setRegions] = useState<BasicRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [regionSearch, setRegionSearch] = useState('')
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([])
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>([])
  const [form, setForm] = useState(EMPTY_FORM)

  async function loadData() {
    setLoading(true)
    setMessage(null)

    try {
      const [widgetsResponse, locationsResponse, regionsResponse] = await Promise.all([
        adminFetch('/api/admin/klook-widgets', { cache: 'no-store' }),
        supabase
          .from('locations')
          .select('id, name, name_cn, regions:region_id(name, name_cn, country, parent:parent_id(name, name_cn))')
          .order('name')
          .limit(600),
        supabase
          .from('regions')
          .select('id, name, name_cn, country, parent:parent_id(name, name_cn)')
          .order('name'),
      ])

      if (!widgetsResponse.ok) throw new Error('Failed to load Klook widgets.')

      const widgetsJson = await widgetsResponse.json()
      setWidgets(Array.isArray(widgetsJson?.widgets) ? widgetsJson.widgets : [])

      setLocations(
        ((locationsResponse.data || []) as any[]).map((item) => ({
          ...item,
          regions: Array.isArray(item?.regions) ? item.regions[0] || null : item?.regions || null,
        }))
      )

      setRegions(
        ((regionsResponse.data || []) as any[]).map((item) => ({
          ...item,
          parent: Array.isArray(item?.parent) ? item.parent[0] || null : item?.parent || null,
        }))
      )
    } catch (error: any) {
      setMessage(error?.message || 'Failed to load widget data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function resetForm() {
    setForm(EMPTY_FORM)
    setSelectedLocationIds([])
    setSelectedRegionIds([])
    setLocationSearch('')
    setRegionSearch('')
  }

  function startEdit(widget: WidgetRecord) {
    setForm({
      id: widget.id,
      title: widget.title,
      description: widget.description || '',
      htmlCode: widget.htmlCode,
      isActive: widget.isActive,
      sortOrder: widget.sortOrder || 0,
    })
    setSelectedLocationIds(widget.locationIds || [])
    setSelectedRegionIds(widget.regionIds || [])
    setMessage(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const response = await adminFetch('/api/admin/klook-widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          locationIds: selectedLocationIds,
          regionIds: selectedRegionIds,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to save widget.')

      setMessage(`Saved successfully at ${new Date(result.savedAt).toLocaleTimeString('en-SG')}.`)
      resetForm()
      await loadData()
    } catch (error: any) {
      setMessage(error?.message || 'Failed to save widget.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this Klook widget?')) return
    const response = await adminFetch(`/api/admin/klook-widgets?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) {
      setMessage('Failed to delete widget.')
      return
    }
    if (form.id === id) resetForm()
    await loadData()
  }

  const filteredLocations = useMemo(() => {
    const keyword = locationSearch.trim().toLowerCase()
    if (!keyword) return locations
    return locations.filter((item) =>
      [item.name, item.name_cn, item.regions?.name, item.regions?.parent?.name]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(keyword)
    )
  }, [locationSearch, locations])

  const filteredRegions = useMemo(() => {
    const keyword = regionSearch.trim().toLowerCase()
    if (!keyword) return regions
    return regions.filter((item) =>
      [item.name, item.name_cn, item.country, item.parent?.name]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(keyword)
    )
  }, [regionSearch, regions])

  const filteredWidgets = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return widgets
    return widgets.filter((widget) =>
      [widget.title, widget.description, widget.htmlCode]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(keyword)
    )
  }, [search, widgets])

  const selectedLocationMap = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations])
  const selectedRegionMap = useMemo(() => new Map(regions.map((item) => [item.id, item])), [regions])

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Klook Widgets</h1>
          <p className="text-sm text-white/60">Paste one widget HTML code and bind it to multiple spots or regions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin">
            <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
              Back to admin
            </Button>
          </Link>
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={resetForm}>
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle>{form.id ? 'Edit widget' : 'Add widget'}</CardTitle>
            <CardDescription className="text-white/55">
              This works like affiliate management, but for Klook HTML widgets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Widget title</Label>
                <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label>Display order</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: Number(e.target.value || 0) }))} />
              </div>

              <div className="space-y-2">
                <Label>Klook widget HTML</Label>
                <Textarea rows={10} value={form.htmlCode} onChange={(e) => setForm((prev) => ({ ...prev, htmlCode: e.target.value }))} />
              </div>

              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                Active
              </label>

              <div className="space-y-3 rounded-2xl border border-white/10 p-4">
                <div>
                  <Label>Bind to spots</Label>
                  <Input value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} placeholder="Search spots..." className="mt-2" />
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {filteredLocations.slice(0, 80).map((location) => {
                    const checked = selectedLocationIds.includes(location.id)
                    return (
                      <label key={location.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm ${checked ? 'border-emerald-300 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedLocationIds((prev) =>
                              e.target.checked ? Array.from(new Set([...prev, location.id])) : prev.filter((item) => item !== location.id)
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block">{location.name_cn || location.name}</span>
                          <span className="block text-xs text-white/45">{regionPathLabel(location.regions)}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 p-4">
                <div>
                  <Label>Bind to regions</Label>
                  <Input value={regionSearch} onChange={(e) => setRegionSearch(e.target.value)} placeholder="Search regions..." className="mt-2" />
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {filteredRegions.slice(0, 80).map((region) => {
                    const checked = selectedRegionIds.includes(region.id)
                    return (
                      <label key={region.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm ${checked ? 'border-emerald-300 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedRegionIds((prev) =>
                              e.target.checked ? Array.from(new Set([...prev, region.id])) : prev.filter((item) => item !== region.id)
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block">{region.name_cn || region.name}</span>
                          <span className="block text-xs text-white/45">{regionPathLabel(region)}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <Button type="submit" disabled={saving} className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                <Plus className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : form.id ? 'Save widget' : 'Create widget'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Widget list</CardTitle>
                <CardDescription className="text-white/55">One widget entry can target many spots and regions.</CardDescription>
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search widgets..." className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-sm text-white/55">Loading widgets...</div>
            ) : filteredWidgets.length ? (
              filteredWidgets.map((widget) => (
                <div key={widget.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-white">{widget.title}</div>
                      {widget.description ? <div className="mt-1 text-sm text-white/60">{widget.description}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/45">
                        <span>Active: {widget.isActive ? 'Yes' : 'No'}</span>
                        <span>Order: {widget.sortOrder}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="outline" onClick={() => startEdit(widget)} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => handleDelete(widget.id)} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {widget.locationIds.length ? (
                      <div className="flex flex-wrap gap-2">
                        {widget.locationIds.slice(0, 8).map((id) => (
                          <span key={`${widget.id}-location-${id}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                            {selectedLocationMap.get(id)?.name_cn || selectedLocationMap.get(id)?.name || `Spot ${id}`}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {widget.regionIds.length ? (
                      <div className="flex flex-wrap gap-2">
                        {widget.regionIds.slice(0, 8).map((id) => (
                          <span key={`${widget.id}-region-${id}`} className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                            {selectedRegionMap.get(id)?.name_cn || selectedRegionMap.get(id)?.name || `Region ${id}`}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/55">No widgets yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
