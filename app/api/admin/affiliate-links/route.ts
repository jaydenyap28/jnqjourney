import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'
import { mutationOutcome } from '@/lib/mutation-outcome'

import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EDITOR_FIELDS = new Set([
  'provider', 'link_type', 'url', 'title', 'description',
  'commission_rate', 'is_active', 'location_id', 'region_id',
])

function validFields(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0 && Object.keys(value).every(key => EDITOR_FIELDS.has(key))
}

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
    if (body.id !== undefined) return invalid('Create must not specify an affiliate link ID.')
    const rows = Array.isArray(body.data) ? body.data : [body.data]
    if (!rows.length || !rows.every(validFields)) return invalid('Provide affiliate link editor fields.')
  } else {
    if (typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id <= 0) return invalid('Provide a valid affiliate link ID.')
    if (method === 'PATCH' && !validFields(body.data)) return invalid('Provide affiliate link editor fields.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ data: null, error: { message: 'Missing database configuration.' } }, { status: 500 })
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const table = supabase.from('affiliate_links')
  // Keep single/batch inserts and partial updates exactly as supplied by the editors.
  const { data: written, error, status: writeStatus } = method === 'POST'
    ? await table.insert(body.data).select('id')
    : method === 'PATCH'
      ? await table.update(body.data).eq('id', body.id).select('id')
      : await table.delete().eq('id', body.id).select('id')
  if (error) {
    const uncertain=!(writeStatus>=400 && writeStatus<500)
    return NextResponse.json({data:null,error:uncertain?{...error,message:`${error.message} Write outcome unknown; reload before retrying.`}:error,mutation:{state:uncertain?'unknown':'failed'}},{status:uncertain?503:400})
  }
  const outcome = mutationOutcome(method === 'POST' ? Array.isArray(body.data) ? body.data.length : 1 : [body.id], written)
  if (outcome.state !== 'complete') return NextResponse.json({ data: null, error: { message: `Affiliate write ${outcome.state}: ${outcome.affected}/${outcome.expected}; reload before retrying.`, code: 'WRITE_NOT_CONFIRMED' }, mutation: outcome }, { status: 409 })
  try {
    return publicationResponse({ data: null, error: null, mutation: outcome }, await invalidatePublication(request, { kind: 'affiliate', ids: outcome.affectedIds }))
  } catch (error) {
    return publicationFailure(error, { kind: 'affiliate', ids: outcome.affectedIds },true,outcome)
  }
}

export async function POST(request: Request) { return mutate(request, 'POST') }
export async function PATCH(request: Request) { return mutate(request, 'PATCH') }
export async function DELETE(request: Request) { return mutate(request, 'DELETE') }
