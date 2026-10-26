'use client'

import { adminFetch } from '@/lib/admin-fetch'

type LocationMutation = {
  id?: number
  ids?: number[]
  data?: Record<string, unknown>
  returning?: boolean
  expectedUpdatedAt?: string | null
}

type LocationMutationResult = {
  data: { id: number; updated_at?: string | null } | null
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

export async function mutateAdminLocations(
  method: 'POST' | 'PATCH' | 'DELETE',
  mutation: LocationMutation,
): Promise<LocationMutationResult> {
  try {
    const response = await adminFetch('/api/admin/locations', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    })
    const result = await response.json()
    if (!response.ok) {
      return {
        data: null,
        error: typeof result.error === 'object' && result.error?.message
          ? { ...result.error, ...(result.mutation?.state === 'unknown' ? { code: 'WRITE_OUTCOME_UNKNOWN' } : {}) }
          : { message: result.error || 'Location mutation failed.' },
      }
    }
    // Server publication now refreshes the deduplicated Chinese/English plan;
    // adminFetch performs an independent read-back. Never refresh per ID here.
    return { data: result.data, error: result.error }
  } catch (error) {
    return { data: null, error: { code: 'WRITE_OUTCOME_UNKNOWN', message: '保存结果未能确认。请保留草稿并重新载入核对，避免重复提交。' } }
  }
}
