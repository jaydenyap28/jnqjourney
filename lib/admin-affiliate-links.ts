'use client'

import { adminFetch } from '@/lib/admin-fetch'

type AffiliateLinkMutation = {
  id?: number
  data?: Record<string, unknown> | Record<string, unknown>[]
}

type AffiliateLinkMutationResult = {
  data: null
  error: { message: string; code?: string; details?: string | null; hint?: string | null } | null
}

export async function mutateAdminAffiliateLinks(
  method: 'POST' | 'PATCH' | 'DELETE',
  mutation: AffiliateLinkMutation,
): Promise<AffiliateLinkMutationResult> {
  try {
    const response = await adminFetch('/api/admin/affiliate-links', {
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
          : { message: result.error || 'Affiliate link mutation failed.' },
      }
    }
    return result
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Affiliate link mutation failed.' } }
  }
}
