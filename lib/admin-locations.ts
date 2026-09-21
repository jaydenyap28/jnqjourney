'use client'

import { adminFetch } from '@/lib/admin-fetch'

type LocationMutation = {
  id?: number
  ids?: number[]
  data?: Record<string, unknown>
  returning?: boolean
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
          ? result.error
          : { message: result.error || 'Location mutation failed.' },
      }
    }
    return result
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Location mutation failed.' } }
  }
}
