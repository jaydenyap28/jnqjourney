'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react'

import { adminFetch } from '@/lib/admin-fetch'
import FallbackImage from '@/components/FallbackImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'

interface LocationOption {
  id: number
  name: string
  name_cn?: string | null
  image_url?: string | null
  images?: string[] | null
}

interface AlbumAssetItem {
  url: string
  caption: string
  sourceUrl?: string
}

interface AlbumGroup {
  key: string
  locationId: number | null
  name: string
  name_cn?: string | null
  items: AlbumAssetItem[]
  score: number
  autoMatched: boolean
}

interface AnalysisStats {
  directItems: number
  photoLinks: number
  deepResolved: number
  totalItems: number
}

function normalizeMatchText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_/|()[\],.:;'"`]+/g, '')
}

function locationLabel(location: Pick<LocationOption, 'name' | 'name_cn'>) {
  return location.name_cn ? `${location.name_cn} / ${location.name}` : location.name
}

function imageFingerprint(urlString: string) {
  try {
    const url = new URL(urlString)
    return `${url.hostname.toLowerCase()}${url.pathname}`
  } catch {
    return urlString.trim()
  }
}

function dedupeAssetItems(items: AlbumAssetItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const fingerprint = imageFingerprint(item.url)
    if (!fingerprint || seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

function createLocationTerms(location: Pick<LocationOption, 'name' | 'name_cn'>) {
  const directTerms = [location.name, location.name_cn]
    .map((item) => normalizeMatchText(String(item || '').trim()))
    .filter((item) => item.length >= 2)

  const tokenTerms = String(location.name || '')
    .split(/\s+/)
    .map((item) => normalizeMatchText(item))
    .filter((item) => item.length >= 3)

  return Array.from(new Set([...directTerms, ...tokenTerms]))
}

function buildAlbumGroups(items: AlbumAssetItem[], locations: LocationOption[]) {
  const locationIndex = locations.map((location) => ({
    location,
    terms: createLocationTerms(location),
  }))

  const grouped = new Map<number, AlbumGroup>()
  const unmatched: AlbumAssetItem[] = []

  items.forEach((item, index) => {
    const normalizedCaption = normalizeMatchText(item.caption)
    let bestMatch:
      | {
          location: LocationOption
          score: number
        }
      | undefined

    if (normalizedCaption) {
      locationIndex.forEach(({ location, terms }) => {
        const score = terms.reduce((max, term) => {
          if (!term || !normalizedCaption.includes(term)) return max
          return Math.max(max, term.length)
        }, 0)

        if (!score) return
        if (!bestMatch || score > bestMatch.score) bestMatch = { location, score }
      })
    }

    if (!bestMatch) {
      unmatched.push(item)
      return
    }

    const existing = grouped.get(bestMatch.location.id)
    if (existing) {
      existing.items.push(item)
      existing.score = Math.max(existing.score, bestMatch.score)
      return
    }

    grouped.set(bestMatch.location.id, {
      key: `location-${bestMatch.location.id}-${index}`,
      locationId: bestMatch.location.id,
      name: bestMatch.location.name,
      name_cn: bestMatch.location.name_cn || null,
      items: [item],
      score: bestMatch.score,
      autoMatched: true,
    })
  })

  const matched = Array.from(grouped.values()).sort((a, b) => {
    if (b.items.length !== a.items.length) return b.items.length - a.items.length
    if (b.score !== a.score) return b.score - a.score
    return a.name.localeCompare(b.name)
  })

  if (unmatched.length) {
    matched.push({
      key: 'unmatched',
      locationId: null,
      name: '待手动分配',
      name_cn: null,
      items: unmatched,
      score: 0,
      autoMatched: false,
    })
  }

  return matched
}

function normalizeItemsFromResponse(result: any) {
  if (Array.isArray(result?.items) && result.items.length) {
    return dedupeAssetItems(
      result.items
        .map((item: any) => ({
          url: String(item?.url || '').trim(),
          caption: String(item?.caption || '').trim(),
          sourceUrl: item?.sourceUrl ? String(item.sourceUrl) : undefined,
        }))
        .filter((item: AlbumAssetItem) => Boolean(item.url))
    )
  }

  if (Array.isArray(result?.images) && result.images.length) {
    return dedupeAssetItems(
      result.images
        .map((url: unknown) => String(url || '').trim())
        .filter(Boolean)
        .map((url: string) => ({ url, caption: '' }))
    )
  }

  return []
}

export default function FacebookAlbumWorkbenchPage() {
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [albumUrl, setAlbumUrl] = useState('')
  const [manualPhotoLinks, setManualPhotoLinks] = useState('')
  const [statusMessage, setStatusMessage] = useState('贴一个 Facebook 相册链接，系统会尝试拆出单图并按景点分组。')
  const [analysisError, setAnalysisError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [groups, setGroups] = useState<AlbumGroup[]>([])
  const [stats, setStats] = useState<AnalysisStats | null>(null)
  const [fallbackPhotoLinks, setFallbackPhotoLinks] = useState<string[]>([])
  const [groupTargets, setGroupTargets] = useState<Record<string, string>>({})
  const [groupCoverModes, setGroupCoverModes] = useState<Record<string, 'keep' | 'replace'>>({})
  const [importingKey, setImportingKey] = useState<string | null>(null)
  const [importResults, setImportResults] = useState<Record<string, string>>({})

  useEffect(() => {
    async function fetchLocations() {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('id, name, name_cn, image_url, images')
          .order('id', { ascending: false })

        if (error) throw error
        setLocations(data || [])
      } catch (error) {
        console.error('Error fetching locations for album workbench:', error)
        setAnalysisError('读取景点列表失败，请稍后重试。')
      } finally {
        setLoadingLocations(false)
      }
    }

    fetchLocations()
  }, [])

  const locationOptions = useMemo(
    () =>
      locations.map((location) => ({
        value: String(location.id),
        label: locationLabel(location),
      })),
    [locations]
  )

  async function analyzeSingleLink(postUrl: string) {
    const response = await adminFetch('/api/admin/facebook-post-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postUrl }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Facebook 资源解析失败。')
    return result
  }

  async function handleAnalyze() {
    const trimmedAlbumUrl = albumUrl.trim()
    const manualLinks = manualPhotoLinks
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)

    if (!trimmedAlbumUrl && !manualLinks.length) {
      setAnalysisError('请先输入 Facebook 相册链接，或贴入单图链接。')
      return
    }

    setAnalyzing(true)
    setAnalysisError('')
    setImportResults({})

    try {
      let allItems: AlbumAssetItem[] = []
      let photoLinks: string[] = []
      let directItems = 0
      let deepResolved = 0

      if (trimmedAlbumUrl) {
        const result = await analyzeSingleLink(trimmedAlbumUrl)
        const normalized = normalizeItemsFromResponse(result)
        allItems = allItems.concat(normalized)
        directItems += Array.isArray(result.images) ? result.images.length : normalized.length
        deepResolved += normalized.length
        photoLinks = Array.isArray(result.photoLinks) ? result.photoLinks.map((item: unknown) => String(item)) : []
        setStatusMessage(result.message || '相册分析完成。')
      }

      if (manualLinks.length) {
        const manualResults = await Promise.all(manualLinks.map((item) => analyzeSingleLink(item)))
        manualResults.forEach((result) => {
          const normalized = normalizeItemsFromResponse(result)
          allItems = allItems.concat(normalized)
          directItems += Array.isArray(result.images) ? result.images.length : normalized.length
          deepResolved += normalized.length
        })
        if (!trimmedAlbumUrl) {
          setStatusMessage('单图链接分析完成。')
        }
      }

      const dedupedItems = dedupeAssetItems(allItems)
      const nextGroups = buildAlbumGroups(dedupedItems, locations)

      const nextTargets: Record<string, string> = {}
      const nextCoverModes: Record<string, 'keep' | 'replace'> = {}
      nextGroups.forEach((group) => {
        if (group.locationId) nextTargets[group.key] = String(group.locationId)
        nextCoverModes[group.key] = 'keep'
      })

      setGroups(nextGroups)
      setGroupTargets(nextTargets)
      setGroupCoverModes(nextCoverModes)
      setFallbackPhotoLinks(photoLinks)
      setStats({
        directItems,
        photoLinks: photoLinks.length,
        deepResolved,
        totalItems: dedupedItems.length,
      })

      if (!dedupedItems.length) {
        setAnalysisError('这次没有成功整理出相册图片。建议先复制几条单图链接继续导入。')
      }
    } catch (error: any) {
      setGroups([])
      setStats(null)
      setFallbackPhotoLinks([])
      setAnalysisError(error.message || 'Facebook 相册分析失败，请稍后再试。')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleImportGroup(group: AlbumGroup) {
    const targetId = Number.parseInt(groupTargets[group.key] || '', 10)
    if (!targetId) {
      setImportResults((prev) => ({ ...prev, [group.key]: '请先选择要导入的景点。' }))
      return
    }

    setImportingKey(group.key)
    setImportResults((prev) => ({ ...prev, [group.key]: '' }))

    try {
      const response = await adminFetch('/api/admin/import-remote-images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls: group.items.map((item) => item.url) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '导入图片失败。')

      const importedUrls = Array.isArray(result.files) ? result.files.map((item: any) => String(item.url || '').trim()).filter(Boolean) : []
      if (!importedUrls.length) throw new Error('这组图片没有成功导入。')

      const currentLocation = locations.find((item) => item.id === targetId)
      const existingImages = Array.isArray(currentLocation?.images) ? currentLocation?.images.filter(Boolean) : []
      const mergedImages = Array.from(new Set([...existingImages, ...importedUrls]))
      const shouldReplaceCover = groupCoverModes[group.key] === 'replace' || !currentLocation?.image_url
      const nextCover = shouldReplaceCover ? importedUrls[0] : currentLocation?.image_url || importedUrls[0]

      const { error } = await supabase
        .from('locations')
        .update({
          image_url: nextCover,
          images: mergedImages,
        })
        .eq('id', targetId)

      if (error) throw error

      setImportResults((prev) => ({
        ...prev,
        [group.key]: `已导入 ${importedUrls.length} 张图片到 ${currentLocation?.name_cn || currentLocation?.name || '当前景点'}。`,
      }))

      setLocations((prev) =>
        prev.map((item) =>
          item.id === targetId
            ? {
                ...item,
                image_url: nextCover,
                images: mergedImages,
              }
            : item
        )
      )
    } catch (error: any) {
      setImportResults((prev) => ({ ...prev, [group.key]: error.message || '导入失败。' }))
    } finally {
      setImportingKey(null)
    }
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
              <h1 className="text-2xl font-semibold">Facebook 相册导入工作台</h1>
              <p className="text-sm text-slate-400">把相册或单图链接拆成候选图片，再一键导入到景点图集。</p>
            </div>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle>开始分析</CardTitle>
            <CardDescription className="text-slate-400">支持整本相册链接，也支持一次贴多条单图链接。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Facebook 相册链接</Label>
                <Input value={albumUrl} onChange={(event) => setAlbumUrl(event.target.value)} placeholder="https://www.facebook.com/media/set/..." className="border-white/10 bg-slate-900 text-white" />
              </div>
              <div className="space-y-2">
                <Label>手动贴单图链接</Label>
                <Textarea value={manualPhotoLinks} onChange={(event) => setManualPhotoLinks(event.target.value)} rows={4} placeholder="每行一条 Facebook 单图链接" className="border-white/10 bg-slate-900 text-white" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleAnalyze} disabled={analyzing || loadingLocations} className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                开始分析相册
              </Button>
              <span className="text-sm text-slate-400">{statusMessage}</span>
            </div>

            {analysisError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{analysisError}</div> : null}

            {stats ? (
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="border-white/10 bg-slate-900 text-white"><CardContent className="p-4"><div className="text-xs text-slate-400">直接抓到</div><div className="mt-1 text-2xl font-semibold">{stats.directItems}</div></CardContent></Card>
                <Card className="border-white/10 bg-slate-900 text-white"><CardContent className="p-4"><div className="text-xs text-slate-400">拆出单图链接</div><div className="mt-1 text-2xl font-semibold">{stats.photoLinks}</div></CardContent></Card>
                <Card className="border-white/10 bg-slate-900 text-white"><CardContent className="p-4"><div className="text-xs text-slate-400">深度解析成功</div><div className="mt-1 text-2xl font-semibold">{stats.deepResolved}</div></CardContent></Card>
                <Card className="border-white/10 bg-slate-900 text-white"><CardContent className="p-4"><div className="text-xs text-slate-400">最终可导入</div><div className="mt-1 text-2xl font-semibold">{stats.totalItems}</div></CardContent></Card>
              </div>
            ) : null}

            {fallbackPhotoLinks.length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">
                <div className="mb-2 font-medium text-white">拆出的单图链接</div>
                <div className="space-y-1">
                  {fallbackPhotoLinks.slice(0, 10).map((link) => (
                    <div key={link} className="truncate">{link}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {groups.map((group) => (
            <Card key={group.key} className="border-white/10 bg-white/5 text-white">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {group.name_cn || group.name}
                      {group.autoMatched ? <Badge className="bg-emerald-500/15 text-emerald-300">自动匹配</Badge> : <Badge variant="secondary">手动分配</Badge>}
                    </CardTitle>
                    <CardDescription className="text-slate-400">{group.items.length} 张图片待导入</CardDescription>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[220px_160px_auto]">
                    <Select value={groupTargets[group.key] || ''} onValueChange={(value) => setGroupTargets((prev) => ({ ...prev, [group.key]: value }))}>
                      <SelectTrigger className="border-white/10 bg-slate-900 text-white"><SelectValue placeholder="选择景点" /></SelectTrigger>
                      <SelectContent>
                        {locationOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={groupCoverModes[group.key] || 'keep'} onValueChange={(value: 'keep' | 'replace') => setGroupCoverModes((prev) => ({ ...prev, [group.key]: value }))}>
                      <SelectTrigger className="border-white/10 bg-slate-900 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keep">保留现有封面</SelectItem>
                        <SelectItem value="replace">首张设为封面</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => handleImportGroup(group)} disabled={importingKey === group.key} className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                      {importingKey === group.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      导入到当前景点
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {importResults[group.key] ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-200">
                    {importResults[group.key].includes('已导入') ? <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-300" /> : null}
                    {importResults[group.key]}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map((item, index) => (
                    <div key={`${group.key}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                      <div className="relative aspect-[4/3] bg-slate-800">
                        <FallbackImage src={item.url} alt={item.caption || `Facebook image ${index + 1}`} fill className="object-cover" />
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="line-clamp-2 text-sm text-slate-200">{item.caption || '未读取到说明文字'}</div>
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-amber-300">
                            查看来源
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
