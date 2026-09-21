'use client'

import { adminFetch } from '@/lib/admin-fetch'

type RegionMutation = {
  id?: number
  data?: Record<string, unknown>
}

type RegionMutationResult = {
  data: null
  error: { message: string; code?: string; details?: string | null; hint?: string | null } | null
}

export async function mutateAdminRegions(
  method: 'POST' | 'PATCH' | 'DELETE',
  mutation: RegionMutation,
): Promise<RegionMutationResult> {
  try {
    const response = await adminFetch('/api/admin/regions', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    })
    const result = await response.json()
    if (!response.ok) {
      return {
        data: null,
        error: typeof result.error === 'object' && result.error?.message
          ? result.error
          : { message: result.error || 'Region mutation failed.' },
      }
    }
    return result
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Region mutation failed.' } }
  }
}
