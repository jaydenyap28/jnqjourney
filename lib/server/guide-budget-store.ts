import { createClient } from '@supabase/supabase-js'

import type {
  GuideBudgetReviewStatus,
  GuideBudgetDisplaySnapshot,
  GuideBudgetSnapshotRecord,
  MoneyBotBudgetSnapshot,
} from '@/lib/guide-budget'
import { canonicalTripCostCategory } from '@/lib/guide-budget'

function canonicalDisplayCategories(input: Record<string, string>) {
  const centsByKey = new Map<string, number>()
  for (const [key, amount] of Object.entries(input || {})) {
    const canonical = canonicalTripCostCategory(key)
    if (!canonical) continue
    const match = String(amount).match(/^(\d+)(?:\.(\d{1,2}))?$/)
    if (!match) continue
    const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
    centsByKey.set(canonical, (centsByKey.get(canonical) || 0) + cents)
  }
  return Object.fromEntries([...centsByKey].map(([key, cents]) => [key, `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`]))
}

function getBudgetAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Guide budget storage is not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const BUDGET_SNAPSHOT_SELECT = 'id,guide_slug,source,source_project_key,source_project_name,snapshot_version,currency,scope,traveller_count,total,categories,unclassified_amount,transaction_count,generated_at,confirmed_at,received_at,review_status,published_at,checksum'

function toDisplaySnapshot(value: GuideBudgetSnapshotRecord): GuideBudgetDisplaySnapshot {
  return {
    source_project_name: value.source_project_name,
    currency: value.currency,
    scope: value.scope,
    traveller_count: value.traveller_count,
    total: value.total,
    categories: canonicalDisplayCategories(value.categories),
    transaction_count: value.transaction_count,
    received_at: value.received_at,
  }
}

function normalizeRecord(value: any): GuideBudgetSnapshotRecord {
  return {
    id: String(value.id),
    guide_slug: String(value.guide_slug),
    source: 'moneybot_project',
    source_project_key: String(value.source_project_key),
    source_project_name: String(value.source_project_name),
    snapshot_version: Number(value.snapshot_version),
    currency: String(value.currency),
    scope: value.scope,
    traveller_count: value.traveller_count === null ? null : Number(value.traveller_count),
    total: String(value.total),
    categories: value.categories || {},
    unclassified_amount: String(value.unclassified_amount || '0.00'),
    transaction_count: Number(value.transaction_count),
    generated_at: String(value.generated_at),
    confirmed_at: String(value.confirmed_at),
    received_at: String(value.received_at),
    review_status: value.review_status,
    published_at: value.published_at ? String(value.published_at) : null,
    checksum: String(value.checksum),
  }
}

export async function claimBudgetSyncNonce(nonce: string, requestTimestamp: string) {
  const client = getBudgetAdminClient()
  const { error } = await client.from('guide_budget_sync_nonces').insert({
    nonce,
    request_timestamp: new Date(
      requestTimestamp.length === 10 ? Number(requestTimestamp) * 1000 : Number(requestTimestamp)
    ).toISOString(),
  })
  if (error) {
    if (error.code === '23505') return false
    throw new Error(error.message)
  }
  return true
}

export async function importBudgetSnapshot(snapshot: MoneyBotBudgetSnapshot) {
  const client = getBudgetAdminClient()
  const unclassifiedAmount = snapshot.categories.unclassified || '0.00'
  const categories = Object.fromEntries(
    Object.entries(snapshot.categories).filter(([key]) => key !== 'unclassified')
  )
  const row = {
    guide_slug: snapshot.guide_slug,
    source: snapshot.source,
    source_project_key: snapshot.source_project_key,
    source_project_name: snapshot.source_project_name,
    snapshot_version: snapshot.snapshot_version,
    currency: snapshot.currency,
    scope: snapshot.scope,
    traveller_count: snapshot.traveller_count,
    total: snapshot.total,
    categories,
    unclassified_amount: unclassifiedAmount,
    transaction_count: snapshot.transaction_count,
    generated_at: snapshot.generated_at,
    confirmed_at: snapshot.confirmed_at,
    review_status: 'imported',
    checksum: snapshot.checksum,
  }
  const { data, error } = await client
    .from('guide_budget_snapshots')
    .upsert(row, { onConflict: 'source,source_project_key,snapshot_version', ignoreDuplicates: true })
    .select(BUDGET_SNAPSHOT_SELECT)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return { record: normalizeRecord(data), alreadyImported: false }

  const { data: existing, error: existingError } = await client
    .from('guide_budget_snapshots')
    .select(BUDGET_SNAPSHOT_SELECT)
    .eq('source', snapshot.source)
    .eq('source_project_key', snapshot.source_project_key)
    .eq('snapshot_version', snapshot.snapshot_version)
    .single()
  if (existingError || !existing) throw new Error(existingError?.message || 'Imported snapshot could not be read.')
  if (existing.checksum !== snapshot.checksum) {
    throw new Error('Snapshot version already exists with a different checksum.')
  }
  return { record: normalizeRecord(existing), alreadyImported: true }
}

export async function listGuideBudgetSnapshots(guideSlug: string) {
  const client = getBudgetAdminClient()
  const { data, error } = await client
    .from('guide_budget_snapshots')
    .select(BUDGET_SNAPSHOT_SELECT)
    .eq('guide_slug', guideSlug)
    .order('snapshot_version', { ascending: false })
    .order('received_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(normalizeRecord)
}

export async function readPublishedGuideBudget(guideSlug: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client
    .from('guide_budget_snapshots')
    .select(BUDGET_SNAPSHOT_SELECT)
    .eq('guide_slug', guideSlug)
    .eq('review_status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return toDisplaySnapshot(normalizeRecord(data))
}

export async function readReviewedGuideBudgetDisplay(guideSlug: string) {
  const snapshots = await listGuideBudgetSnapshots(guideSlug)
  const reviewed = snapshots.find((snapshot) => snapshot.review_status === 'reviewed')
  return reviewed ? toDisplaySnapshot(reviewed) : null
}

export async function updateGuideBudgetSnapshot(
  id: string,
  action: 'review' | 'reject' | 'publish' | 'restore' | 'merge_unclassified'
) {
  const client = getBudgetAdminClient()
  if (action === 'publish' || action === 'restore') {
    const { data, error } = await client.rpc('publish_guide_budget_snapshot', { target_id: id })
    if (error) throw new Error(error.message)
    return normalizeRecord(Array.isArray(data) ? data[0] : data)
  }

  const { data: current, error: currentError } = await client
    .from('guide_budget_snapshots')
    .select(BUDGET_SNAPSHOT_SELECT)
    .eq('id', id)
    .single()
  if (currentError || !current) throw new Error(currentError?.message || 'Snapshot not found.')

  let patch: Record<string, unknown>
  if (action === 'merge_unclassified') {
    if (current.review_status !== 'imported') throw new Error('Only imported snapshots can merge unclassified spend.')
    const unclassified = Number(current.unclassified_amount || 0)
    if (!(unclassified > 0)) throw new Error('There is no unclassified amount to merge.')
    const categories = { ...(current.categories || {}) }
    categories.Other = (Number(categories.Other || 0) + unclassified).toFixed(2)
    patch = { categories, unclassified_amount: '0.00', review_status: 'reviewed' }
  } else {
    const nextStatus: GuideBudgetReviewStatus = action === 'review' ? 'reviewed' : 'rejected'
    if (current.review_status !== 'imported') {
      throw new Error(`Only imported snapshots can be marked ${nextStatus}.`)
    }
    if (action === 'review' && Number(current.unclassified_amount || 0) !== 0) {
      throw new Error('Resolve unclassified spend before review.')
    }
    patch = { review_status: nextStatus }
  }

  const { data, error } = await client
    .from('guide_budget_snapshots')
    .update(patch)
    .eq('id', id)
    .select(BUDGET_SNAPSHOT_SELECT)
    .single()
  if (error || !data) throw new Error(error?.message || 'Snapshot update failed.')
  return normalizeRecord(data)
}
