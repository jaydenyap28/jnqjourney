import { requireAdminRequest } from '@/lib/server/admin-auth'
import { createSpotNotePublicationStore, SPOT_NOTE_PUBLICATION_ORIGIN } from '@/lib/server/spot-note-publication-store'
import { isSpotNoteReceipt, publishSpotNote, safeNotePublicationSlug, SpotNotePublicationError } from '@/lib/spot-note-publication'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const json = (body: object, status = 200) => Response.json(body, { status, headers })

export async function POST(request: Request, { params }: { params: { id: string } }) {
  // Preview deployments must never construct a writer, even if they inherit secrets.
  if (process.env.VERCEL_ENV !== 'production' || process.env.JNQ_SPOT_NOTE_PUBLICATION_ENABLED !== '1'
    || new URL(request.url).origin !== SPOT_NOTE_PUBLICATION_ORIGIN
    || !process.env.ADMIN_EMAILS?.split(',').some(email => email.trim())) {
    return json({ ok: false, error: 'spot_note_publication_disabled' }, 403)
  }
  try {
    const auth = await requireAdminRequest(request)
    if (!auth.ok) return json({ ok: false, error: 'admin_required' }, 403)

    const id = Number(params.id)
    if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(id) || id === 450) {
      return json({ ok: false, error: 'invalid_spot_id' }, 400)
    }
    const body = await request.text()
    let input
    try { input = body.length <= 8192 ? JSON.parse(body) : null } catch { input = null }
    if (!input || !safeNotePublicationSlug(input.noteSlug)
      || !(Object.keys(input).length === 1 || (Object.keys(input).length === 2 && isSpotNoteReceipt(input.expected)))) {
      return json({ ok: false, error: 'invalid_publication_request' }, 400)
    }
    const store = createSpotNotePublicationStore(request.headers.get('authorization') || '')
    return json({ ok: true, ...await publishSpotNote(store, id, input.noteSlug, input.expected) })
  } catch (error) {
    if (error instanceof SpotNotePublicationError) return json({ ok: false, error: error.code }, error.status)
    return json({ ok: false, error: 'spot_note_preflight_unavailable' }, 503)
  }
}
