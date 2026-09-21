import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function invalid(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 400 })
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
  if (method === 'POST') {
    if (body.id !== undefined) return invalid('Create must not specify a region ID.')
  } else if (typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id <= 0) {
    return invalid('Provide a valid region ID.')
  }
  if (method !== 'DELETE' && (!body.data || typeof body.data !== 'object' || Array.isArray(body.data) || !Object.keys(body.data).length || 'id' in body.data)) {
    return invalid('Provide region fields without an ID.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ data: null, error: { message: 'Missing database configuration.' } }, { status: 500 })
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const table = supabase.from('regions')
  // Preserve the editor's payload and minimal-return mutation behavior.
  const { data, error } = method === 'POST'
    ? await table.insert([body.data])
    : method === 'PATCH'
      ? await table.update(body.data).eq('id', body.id)
      : await table.delete().eq('id', body.id)
  return NextResponse.json({ data, error }, { status: error ? 400 : 200 })
}

export async function POST(request: Request) { return mutate(request, 'POST') }
export async function PATCH(request: Request) { return mutate(request, 'PATCH') }
export async function DELETE(request: Request) { return mutate(request, 'DELETE') }
