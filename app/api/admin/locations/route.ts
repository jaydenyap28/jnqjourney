import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireAdminRequest } from '@/lib/server/admin-auth'
import { publishLocationBatch } from '@/lib/server/publish-location-batch'
import { invalidatePublication, publicationResponse, publicationFailure } from '@/lib/server/publication'
import { mutationOutcome } from '@/lib/mutation-outcome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function invalid(message: string) {
  return NextResponse.json({ data: null, error: { message } }, { status: 400 })
}

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
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
  const conditional = Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt')
  if (conditional && (method !== 'PATCH' || !hasId || !body.returning || (body.expectedUpdatedAt !== null && (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))))) return invalid('Invalid save version.')
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
  // Conditional edits must advance their version even on older DBs without an updated_at trigger.
  const dataToWrite = conditional ? { ...body.data, updated_at: new Date(Math.max(Date.now(), body.expectedUpdatedAt ? Date.parse(body.expectedUpdatedAt) + 1 : 0)).toISOString() } : body.data
  const query = method === 'POST' ? table.insert([dataToWrite]) : method === 'PATCH' ? table.update(dataToWrite) : table.delete()
  let filtered = method === 'POST' ? query : hasId ? query.eq('id', body.id) : query.in('id', body.ids)
  if (conditional) filtered = body.expectedUpdatedAt === null ? filtered.is('updated_at', null) : filtered.eq('updated_at', body.expectedUpdatedAt)
  // Save returns the same ID/timestamp used by slug saving and snapshot publishing.
  // Cover clears and list mutations retain their original minimal-return behavior.
  const returning = method === 'POST' || body.returning
  const { data: written, error, status: writeStatus } = returning
    ? conditional ? await filtered.select('id, updated_at').maybeSingle() : await filtered.select('id, updated_at').single()
    : await filtered.select('id')
  if (error) {
    const uncertain=!(writeStatus>=400 && writeStatus<500)
    return NextResponse.json({ data:null,error:uncertain?{...error,code:'WRITE_OUTCOME_UNKNOWN',message:`${error.message} Write outcome unknown; reload before retrying.`}:error,mutation:{state:uncertain?'unknown':'failed'} },{status:uncertain?503:400})
  }
  const data = returning ? written : null
  if (conditional && !written) return NextResponse.json({ data: null, error: { code: 'EDIT_CONFLICT', message: '资料已被其他操作更新或删除。当前草稿仍保留；请先复制草稿并重新载入后比对，不会自动覆盖。' }, mutation: { state: 'failed' } }, { status: 409 })
  const outcome = mutationOutcome(method === 'POST' ? 1 : hasIds ? body.ids : [body.id], returning && written ? [written] : written)
  if (outcome.state === 'failed' || outcome.state === 'unknown') return NextResponse.json({ data, error: { message: `Write ${outcome.state}: no complete affected-row confirmation. Reload before retrying.`, code: 'WRITE_NOT_CONFIRMED' }, mutation: outcome }, { status: 409 })
  // Full form saves publish after custom-slug persistence. Every minimal/list
  // mutation publishes once here, including bulk update/delete and cover clear.
  if (method !== 'POST' && !body.returning) {
    const ids = outcome.affectedIds
    try {
      const published = await publishLocationBatch(ids)
      const payload = { data, error: outcome.state === 'partial' ? { message: `Partial write: ${outcome.affected}/${outcome.expected} rows changed. Reload; do not replay the whole batch.`, code: 'PARTIAL_WRITE' } : null, mutation: outcome, partial: outcome.state === 'partial' }
      return publicationResponse(payload, await invalidatePublication(request, { kind: 'spot', ids, ...published.recovery }, { previousLocations: published.previousLocations }), outcome.state === 'partial' ? 409 : 200)
    } catch (error) { return publicationFailure(error, { kind: 'spot', ids },true,outcome) }
  }
  return NextResponse.json({ data, error: null, mutation: outcome })
}

export async function POST(request: Request) { return mutate(request, 'POST') }
export async function PATCH(request: Request) { return mutate(request, 'PATCH') }
export async function DELETE(request: Request) { return mutate(request, 'DELETE') }
