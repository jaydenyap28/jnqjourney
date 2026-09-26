import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function invalid(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 400 })
}

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function normalizeJsonObjectField(value: unknown) {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return value

  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : value
  } catch {
    return value
  }
}

function normalizeLocationMutationData(data: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(data, 'price_info')) return data
  return {
    ...data,
    price_info: normalizeJsonObjectField(data.price_info),
  }
}

async function mutate(request: Request, method: 'POST' | 'PATCH' | 'DELETE') {
  const auth = await requireAdminRequest(request)
  if (!auth.ok) return auth.response

  let body
  try {
    body = await request.json()
  } catch {
    return invalid('Invalid JSON body.')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Invalid mutation.')

  const hasId = body.id !== undefined
  const hasIds = body.ids !== undefined
  if (method === 'POST') {
    if (hasId || hasIds) return invalid('Create must not specify location IDs.')
  } else if (hasId === hasIds || (hasId ? !validId(body.id) : !Array.isArray(body.ids) || !body.ids.length || !body.ids.every(validId))) {
    return invalid('Provide a location ID or a non-empty list of location IDs.')
  }
  if (body.returning !== undefined && typeof body.returning !== 'boolean') return invalid('Invalid returning option.')
  if (body.returning && (method === 'DELETE' || hasIds)) return invalid('Returning a record requires a single save.')
  if (method !== 'DELETE' && (!body.data || typeof body.data !== 'object' || Array.isArray(body.data) || !Object.keys(body.data).length || 'id' in body.data)) {
    return invalid('Provide location fields without an ID.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ data: null, error: { message: 'Missing database configuration.' } }, { status: 500 })
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const table = supabase.from('locations')
  const mutationData = method === 'DELETE' ? null : normalizeLocationMutationData(body.data)
  const query = method === 'POST' ? table.insert([mutationData]) : method === 'PATCH' ? table.update(mutationData) : table.delete()
  const filtered = method === 'POST' ? query : hasId ? query.eq('id', body.id) : query.in('id', body.ids)
  // Save returns the same ID/timestamp used by slug saving and snapshot publishing.
  // Cover clears and list mutations retain their original minimal-return behavior.
  const { data, error } = method === 'POST' || body.returning
    ? await filtered.select('id, updated_at').single()
    : await filtered
  return NextResponse.json({ data, error }, { status: error ? 400 : 200 })
}

export async function POST(request: Request) { return mutate(request, 'POST') }
export async function PATCH(request: Request) { return mutate(request, 'PATCH') }
export async function DELETE(request: Request) { return mutate(request, 'DELETE') }
