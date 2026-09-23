import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

import { readAuthoritativeNotes } from '@/lib/server/notes-store'
import { syncNoteCardEnglish } from '@/lib/server/note-card-english-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HEADERS = { 'Cache-Control': 'private, no-store' }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration for Note English queue.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function remainingCount(supabase: ReturnType<typeof adminClient>) {
  const { count } = await supabase
    .from('note_english_sync_queue')
    .select('note_slug', { count: 'exact', head: true })
    .is('completed_at', null)
    .lt('attempts', 5)
  return Number(count || 0)
}

async function runOne() {
  const supabase = adminClient()
  const { data: claimRows, error: claimError } = await supabase.rpc('claim_next_note_english_sync')
  if (claimError) throw new Error(claimError.message || 'Unable to claim pending Note English sync.')

  const claim = Array.isArray(claimRows) ? claimRows[0] : null
  if (!claim?.note_slug) {
    return { ok: true, processed: false, remaining: await remainingCount(supabase) }
  }

  const slug = String(claim.note_slug)

  try {
    const notes = await readAuthoritativeNotes()
    const note = notes.find((item) => item.slug === slug && item.published)
    if (!note) throw new Error(`Published Note not found: ${slug}`)

    const result = await syncNoteCardEnglish([note])
    const item = result.items[0]
    if (!item || (!item.translated && item.reason && item.reason !== 'English is already current')) {
      throw new Error(item?.reason || 'Note English sync did not complete.')
    }

    const { error: completeError } = await supabase.rpc('complete_note_english_sync', { p_note_slug: slug })
    if (completeError) throw new Error(completeError.message || 'Unable to mark Note English sync complete.')

    revalidatePath('/en')
    revalidatePath('/en/notes')
    revalidatePath(`/en/notes/${slug}`)

    return {
      ok: true,
      processed: true,
      slug,
      result,
      remaining: await remainingCount(supabase),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic Note English sync failed.'
    try {
      await supabase.rpc('fail_note_english_sync', { p_note_slug: slug, p_error: message })
    } catch {}

    return {
      ok: false,
      processed: true,
      slug,
      error: message,
      remaining: await remainingCount(supabase),
    }
  }
}

export async function GET() {
  try {
    const result = await runOne()
    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: HEADERS })
  } catch (error) {
    return NextResponse.json(
      { ok: false, processed: false, error: error instanceof Error ? error.message : 'Automatic Note English sync failed.' },
      { status: 503, headers: HEADERS }
    )
  }
}

export async function POST() {
  return GET()
}
