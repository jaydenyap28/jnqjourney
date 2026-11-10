'use client'

import { adminFetch } from '@/lib/admin-fetch'

// Fixed server projections only. Never accept a browser supplied SQL select.
export async function readAdminLocations(id?: string | number) {
  const rows: any[] = []
  for (let page = 0; page < 50; page++) {
    const query = id == null ? `page=${page}` : `id=${encodeURIComponent(id)}`
    const response = await adminFetch(`/api/admin/locations?${query}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || result.error || '无法读取后台景点，请检查登录及权限。')
    if (id != null) return { data: result.data, error: null }
    if (!Array.isArray(result.data)) throw new Error('Invalid admin location response.')
    rows.push(...result.data)
    if (!result.hasMore) return { data: rows, error: null }
  }
  throw new Error('后台景点超过本次读取上限，请缩小查询范围。')
}

export async function readAdminAffiliateLinks() {
  const rows: any[] = []
  for (let page = 0; page < 50; page++) {
    const response = await adminFetch(`/api/admin/locations?resource=affiliate-links&page=${page}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok || !Array.isArray(result.data)) throw new Error(result.error?.message || '无法读取后台关联链接。')
    rows.push(...result.data)
    if (!result.hasMore) return { data: rows, error: null }
  }
  throw new Error('后台关联链接超过本次读取上限。')
}
