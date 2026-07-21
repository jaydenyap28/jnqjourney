'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import SiteFooter from '@/components/SiteFooter'
import TravelPackageDetail from '@/components/TravelPackageDetail'
import TiomanPackageDetail from '@/components/TiomanPackageDetail'
import { adminFetch } from '@/lib/admin-fetch'
import type { TravelPackage, TravelPackageOption } from '@/lib/server/travel-packages'

export default function AdminPackagePreviewClient({ packageId }: { packageId: number }) {
  const [item, setItem] = useState<TravelPackage | null>(null)
  const [options, setOptions] = useState<TravelPackageOption[]>([])
  const [error, setError] = useState('')
  const [checkMessage, setCheckMessage] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await adminFetch(`/api/admin/travel-packages?id=${packageId}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || '无法读取旅游配套。')
        if (active) {
          setItem(payload.package)
          setOptions(payload.options || [])
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '无法读取旅游配套。')
      }
    }
    void load()
    return () => { active = false }
  }, [packageId])

  const runPublishCheck = async () => {
    if (!item) return
    setCheckMessage('正在检查发布资料…')
    const response = await adminFetch('/api/admin/travel-packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, status: 'published', action: 'validate' }),
    })
    const payload = await response.json()
    setCheckMessage(response.ok ? payload.message || '发布检查通过。' : payload.error || '发布检查未通过。')
  }

  if (error) return <main className="flex min-h-[70vh] items-center justify-center bg-[#050816] px-5 text-white"><div className="max-w-md rounded-lg border border-rose-300/20 bg-rose-300/10 p-5 text-sm text-rose-50">{error}</div></main>
  if (!item) return <main className="flex min-h-[70vh] items-center justify-center bg-[#050816] text-white"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-3 text-sm text-white/60">载入草稿预览</span></main>

  return <>{item.slug === 'tioman-3d2n' ? <TiomanPackageDetail item={item} options={options} preview /> : <TravelPackageDetail item={item} preview publishCheckMessage={checkMessage} onPublishCheck={() => void runPublishCheck()} />}<SiteFooter /></>
}
