'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, Pencil, Plus, Search, Trash2, UploadCloud } from 'lucide-react'

import FallbackImage from '@/components/FallbackImage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { adminFetch } from '@/lib/admin-fetch'
import { getRegionPathLabel, type RegionLike } from '@/lib/region-utils'
import { supabase } from '@/lib/supabase'

interface Region extends RegionLike {
  id: number
  name: string
  name_cn?: string | null
  description?: string | null
  image_url?: string | null
  code?: string | null
  parent_id: number | null
  country?: string | null
}

interface LocationOption {
  id: number
  name: string
  name_cn?: string | null
  image_url?: string | null
  images?: string[] | null
  address?: string | null
  region_id?: number | null
}

interface LocationImageCandidate extends LocationOption {
  cover: string
}

const COUNTRY_OPTIONS = ['Malaysia', 'Indonesia', 'China', 'Japan', 'Thailand', 'Europe']

const EMPTY_FORM = {
  name: '',
  name_cn: '',
  description: '',
  image_url: '',
  code: '',
  parent_id: 'null',
  country: 'Malaysia',
}

function getDescendantRegionIds(regions: Region[], rootId: number | null) {
  if (!rootId) return []

  const ids = new Set<number>()
  const queue = [rootId]

  while (queue.length) {
    const current = queue.shift()
    if (!current || ids.has(current)) continue
    ids.add(current)

    regions
      .filter((region) => region.parent_id === current)
      .forEach((region) => {
        if (!ids.has(region.id)) queue.push(region.id)
      })
  }

  return Array.from(ids)
}

function getLocationImageCandidate(location: LocationOption): LocationImageCandidate | null {
  const cover = location.image_url || location.images?.find(Boolean) || null
  if (!cover) return null
  return { ...location, cover }
}

function regionLabel(region: Region, regions: Region[]) {
  return getRegionPathLabel(region, regions)
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCountry, setFilterCountry] = useState('All')
  const [candidateSearch, setCandidateSearch] = useState('')
  const [includeChildren, setIncludeChildren] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const uploadRef = useRef<HTMLInputElement | null>(null)

  async function fetchRegions() {
    const { data, error } = await supabase.from('regions').select('*').order('country').order('name')
    if (error) throw error
    setRegions((data || []) as Region[])
  }

  async function fetchLocations() {
    const { data, error } = await supabase
      .from('locations')
      .select('id, name, name_cn, image_url, images, address, region_id')
      .order('id', { ascending: false })
    if (error) throw error
    setLocations((data || []) as LocationOption[])
  }

  async function loadAll() {
    setLoading(true)
    setErrorMsg(null)
    try {
      await Promise.all([fetchRegions(), fetchLocations()])
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to load region data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const countries = useMemo(
    () => ['All', ...Array.from(new Set(regions.map((region) => region.country).filter(Boolean) as string[])).sort()],
    [regions]
  )

  const filteredRegions = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    return regions
      .filter((region) => (filterCountry === 'All' ? true : region.country === filterCountry))
      .filter((region) => {
        if (!keyword) return true
        return [region.name, region.name_cn || '', region.code || '', regionLabel(region, regions)]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      })
      .sort((a, b) => regionLabel(a, regions).localeCompare(regionLabel(b, regions)))
  }, [filterCountry, regions, searchQuery])

  const parentOptions = useMemo(
    () =>
      regions
        .filter((region) => region.id !== editingId)
        .filter((region) => region.country === formData.country)
        .sort((a, b) => regionLabel(a, regions).localeCompare(regionLabel(b, regions))),
    [editingId, formData.country, regions]
  )

  const selectedParent = useMemo(
    () => regions.find((region) => String(region.id) === formData.parent_id) || null,
    [formData.parent_id, regions]
  )

  const candidateRegionIds = useMemo(() => {
    const rootId = editingId || selectedParent?.id || null
    if (!rootId) return []
    return includeChildren ? getDescendantRegionIds(regions, rootId) : [rootId]
  }, [editingId, includeChildren, regions, selectedParent])

  const candidateImages = useMemo(() => {
    const keyword = candidateSearch.trim().toLowerCase()
    const regionSet = new Set(candidateRegionIds)

    return locations
      .filter((location) => location.region_id && regionSet.has(location.region_id))
      .map((location) => getLocationImageCandidate(location))
      .filter((location): location is LocationImageCandidate => Boolean(location))
      .filter((location) => {
        if (!keyword) return true
        return [location.name, location.name_cn || '', location.address || ''].join(' ').toLowerCase().includes(keyword)
      })
      .slice(0, 24)
  }, [candidateRegionIds, candidateSearch, locations])

  function openAdd() {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setCandidateSearch('')
    setIncludeChildren(false)
    setErrorMsg(null)
    setSuccessMsg(null)
    setIsDialogOpen(true)
  }

  function openEdit(region: Region) {
    setEditingId(region.id)
    setFormData({
      name: region.name || '',
      name_cn: region.name_cn || '',
      description: region.description || '',
      image_url: region.image_url || '',
      code: region.code || '',
      parent_id: region.parent_id ? String(region.parent_id) : 'null',
      country: region.country || 'Malaysia',
    })
    setCandidateSearch('')
    setIncludeChildren(false)
    setErrorMsg(null)
    setSuccessMsg(null)
    setIsDialogOpen(true)
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      setErrorMsg('Please enter a region name first.')
      return
    }

    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const payload = {
      name: formData.name.trim(),
      name_cn: formData.name_cn.trim() || null,
      description: formData.description.trim() || null,
      image_url: formData.image_url.trim() || null,
      code: formData.code.trim() || null,
      parent_id: formData.parent_id === 'null' ? null : Number.parseInt(formData.parent_id, 10),
      country: formData.country,
    }

    try {
      const result = editingId
        ? await supabase.from('regions').update(payload).eq('id', editingId)
        : await supabase.from('regions').insert([payload])

      if (result.error) throw result.error

      await fetchRegions()
      setSuccessMsg(editingId ? 'Region updated.' : 'Region created.')
      setIsDialogOpen(false)
      setEditingId(null)
      setFormData(EMPTY_FORM)
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to save region.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(region: Region) {
    const confirmed = window.confirm(`Delete region "${region.name_cn || region.name}"?`)
    if (!confirmed) return

    const { error } = await supabase.from('regions').delete().eq('id', region.id)
    if (error) {
      setErrorMsg(error.message || 'Failed to delete region.')
      return
    }

    setSuccessMsg(`Deleted "${region.name_cn || region.name}".`)
    setRegions((prev) => prev.filter((item) => item.id !== region.id))
  }

  async function handleUpload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return

    setUploading(true)
    setErrorMsg(null)

    try {
      const form = new FormData()
      form.append('target', 'cover')
      form.append('files', file)
      const response = await adminFetch('/api/admin/upload-image', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to upload region cover.')
      const url = result.files?.[0]?.url
      if (!url) throw new Error('Upload succeeded but no image URL was returned.')
      setFormData((prev) => ({ ...prev, image_url: url }))
      setSuccessMsg('Region cover uploaded.')
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to upload region cover.')
    } finally {
      setUploading(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  const summary = {
    countries: countries.length - 1,
    topLevel: filteredRegions.filter((region) => !region.parent_id).length,
    nested: filteredRegions.filter((region) => !!region.parent_id).length,
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="outline" size="icon" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">Region Management</h1>
              <p className="text-sm text-slate-400">Manage countries, states, cities, descriptions, and cover images.</p>
            </div>
          </div>

          <Button onClick={openAdd} className="bg-amber-400 text-slate-950 hover:bg-amber-300">
            <Plus className="mr-2 h-4 w-4" />
            Add region
          </Button>
        </div>

        {errorMsg ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMsg}</div> : null}
        {successMsg ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMsg}</div> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader><CardTitle className="text-sm text-slate-400">Countries</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-semibold">{summary.countries}</div></CardContent>
          </Card>
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader><CardTitle className="text-sm text-slate-400">Top-level regions</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-semibold">{summary.topLevel}</div></CardContent>
          </Card>
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader><CardTitle className="text-sm text-slate-400">Child regions</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-semibold">{summary.nested}</div></CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Region list</CardTitle>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search regions" className="border-white/10 bg-slate-900 pl-9 text-white md:w-72" />
              </div>
              <Select value={filterCountry} onValueChange={setFilterCountry}>
                <SelectTrigger className="border-white/10 bg-slate-900 text-white md:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {countries.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-10 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading regions...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-slate-400">Cover</TableHead>
                    <TableHead className="text-slate-400">Region</TableHead>
                    <TableHead className="text-slate-400">Country</TableHead>
                    <TableHead className="text-slate-400">Code</TableHead>
                    <TableHead className="text-right text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRegions.map((region) => (
                    <TableRow key={region.id} className="border-white/10">
                      <TableCell>
                        <div className="relative h-16 w-24 overflow-hidden rounded-xl bg-slate-800">
                          <FallbackImage src={region.image_url} alt={region.name} fill className="object-cover" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-white">{region.name_cn || region.name}</div>
                        <div className="text-xs text-slate-400">{regionLabel(region, regions)}</div>
                      </TableCell>
                      <TableCell>{region.country || '-'}</TableCell>
                      <TableCell>{region.code || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openEdit(region)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="outline" className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20" onClick={() => handleDelete(region)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-slate-950 text-white sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit region' : 'Add region'}</DialogTitle>
              <DialogDescription className="text-slate-400">Upload a region cover directly, or pick one from spots inside this region.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Select value={formData.country} onValueChange={(value) => setFormData((prev) => ({ ...prev, country: value, parent_id: 'null' }))}>
                      <SelectTrigger className="border-white/10 bg-slate-900 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set(COUNTRY_OPTIONS.concat(countries.filter((item) => item !== 'All')))).map((country) => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Parent region</Label>
                    <Select value={formData.parent_id} onValueChange={(value) => setFormData((prev) => ({ ...prev, parent_id: value }))}>
                      <SelectTrigger className="border-white/10 bg-slate-900 text-white"><SelectValue placeholder="No parent" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">No parent</SelectItem>
                        {parentOptions.map((region) => <SelectItem key={region.id} value={String(region.id)}>{regionLabel(region, regions)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>English name</Label><Input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="border-white/10 bg-slate-900 text-white" /></div>
                  <div className="space-y-2"><Label>Chinese name</Label><Input value={formData.name_cn} onChange={(e) => setFormData((prev) => ({ ...prev, name_cn: e.target.value }))} className="border-white/10 bg-slate-900 text-white" /></div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Region code</Label><Input value={formData.code} onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))} placeholder="For example: home-malaysia" className="border-white/10 bg-slate-900 text-white" /></div>
                  <div className="space-y-2"><Label>Cover image URL</Label><Input value={formData.image_url} onChange={(e) => setFormData((prev) => ({ ...prev, image_url: e.target.value }))} placeholder="https://..." className="border-white/10 bg-slate-900 text-white" /></div>
                </div>

                <div className="space-y-2"><Label>Region description</Label><Textarea rows={4} value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} className="border-white/10 bg-slate-900 text-white" /></div>

                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader><CardTitle className="text-base">Pick a cover from spot photos</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant={includeChildren ? 'outline' : 'default'} onClick={() => setIncludeChildren(false)}>Current region only</Button>
                      <Button type="button" size="sm" variant={includeChildren ? 'default' : 'outline'} onClick={() => setIncludeChildren(true)}>Include child-region spots</Button>
                    </div>
                    <Input value={candidateSearch} onChange={(e) => setCandidateSearch(e.target.value)} placeholder="Search spots" className="border-white/10 bg-slate-900 text-white" />
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {candidateImages.map((item) => {
                        const selected = formData.image_url === item.cover
                        return (
                          <button key={`${item.id}-${item.cover}`} type="button" onClick={() => setFormData((prev) => ({ ...prev, image_url: item.cover }))} className={`overflow-hidden rounded-2xl border text-left ${selected ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-white/10'}`}>
                            <div className="relative aspect-[4/3] bg-slate-800"><FallbackImage src={item.cover} alt={item.name} fill className="object-cover" /></div>
                            <div className="space-y-1 p-3">
                              <div className="text-sm font-medium">{item.name_cn || item.name}</div>
                              <div className="text-xs text-slate-400">{item.name}</div>
                              {selected ? <div className="inline-flex items-center gap-1 text-xs text-amber-300"><Check className="h-3 w-3" />Selected cover</div> : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="overflow-hidden border-white/10 bg-white/5 text-white">
                  <div className="relative aspect-[4/3] bg-slate-900">
                    <FallbackImage src={formData.image_url} alt={formData.name || 'Region cover preview'} fill className="object-cover" />
                  </div>
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <div className="text-lg font-semibold">{formData.name_cn || formData.name || 'Region cover preview'}</div>
                      <div className="text-sm text-slate-400">{formData.name || 'Upload a cover or choose one that best represents this region.'}</div>
                    </div>
                    <Button type="button" onClick={() => uploadRef.current?.click()} disabled={uploading} className="w-full bg-amber-400 text-slate-950 hover:bg-amber-300">
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                      Upload region cover
                    </Button>
                    <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
                  </CardContent>
                </Card>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingId ? 'Save changes' : 'Create region'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
