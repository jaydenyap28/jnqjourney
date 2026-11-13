import { planFormalSpotMutation } from './formal-write-plan.mjs'
import { prepareFormalDocumentSave } from './formal-document-plan'
import { FormalError } from './formal-runtime.mjs'
import { AdminError } from './store'

// Server-only adapters. They do not expose a route or enable a capability.
export function createFormalMutations({ db, store, media, verifyPrivate }: any) {
  async function spot(method: string, body: any, context: any = {}) {
    let plan
    try { plan = planFormalSpotMutation(method, body) }
    catch { throw new FormalError(400, 'FORMAL_SPOT_CONTRACT_INVALID') }
    await verifyPrivate()
    let previous = null
    if (method !== 'POST') {
      const old = await db.from('locations').select('*').eq('id', body.id).maybeSingle()
      if (old.error) throw new FormalError(503, 'FORMAL_SPOT_READ_FAILED')
      if (!old.data) throw new FormalError(404, 'FORMAL_SPOT_NOT_FOUND')
      if (old.data.updated_at !== body.expectedUpdatedAt) throw new FormalError(409, 'FORMAL_VERSION_CONFLICT')
      previous = old.data
    }
    const binding={kind:'spot',target:previous?.id??'new',expectedVersion:previous?previous.updated_at:null}
    const mediaContext={...context,binding,proofs:body.mediaProofs}
    const mediaNames=await media.verifyChanges(plan.values, previous, mediaContext)
    const timestamp = new Date(Math.max(Date.now(), (Date.parse(body.expectedUpdatedAt) || 0) + 1)).toISOString()
    const values = { ...plan.values, updated_at: timestamp }
    let result
    if (plan.operation === 'insert') {
      // Deliberately omit id: formal sequence allocation, never fixture max+1.
      result = await db.from('locations').insert(values).select('id,updated_at').single()
    } else {
      let query = db.from('locations').update(values).eq('id', plan.id)
      const condition = plan.versionPredicate
      if (!condition) throw new FormalError(503, 'FORMAL_VERSION_PREDICATE_MISSING')
      query = condition.operator === 'is' ? query.is('updated_at', null) : query.eq('updated_at', condition.value)
      result = await query.select('id,updated_at').maybeSingle()
    }
    if (result.error) {
      if (/^(?:[0-9A-Z]{5}|PGRST[0-9]+)$/.test(result.error.code || '')) throw new FormalError(result.error.code === '23505' ? 409 : 422, 'FORMAL_SPOT_SAVE_REJECTED')
      throw new FormalError(503, 'FORMAL_SPOT_SAVE_UNCONFIRMED')
    }
    if (!result.data) throw new FormalError(409, 'FORMAL_VERSION_CONFLICT')
    // No automatic retry, no snapshot mirror, no publish/build on save.
    await media.recordBinding?.(mediaNames,mediaContext,{kind:'spot',id:result.data.id,version:result.data.updated_at})
    return { data: result.data, error: null }
  }
  async function document(kind: 'notes' | 'guides', body: any, context: any = {}) {
    await verifyPrivate()
    let saved: any,mediaNames:any[],mediaContext:any
    try { await store.update(kind, async (records: any[]) => {
      const previous = records.find(record => record.slug === body.previousSlug)
      // Actual pointer is loaded server-side, never taken from the request.
      const pointer = await store.pointer(kind)
      let plan
      try { plan = prepareFormalDocumentSave(kind, records, body, pointer) }
      catch (error) {
        throw new FormalError((error as Error).constructor.name === 'NoteConflictError' ? 409 :
          (error as Error).message === 'FORMAL_AUTHORITY_SCOPE_INVALID' ? 503 : 400, 'FORMAL_DOCUMENT_VALIDATION_OR_VERSION_CONFLICT')
      }
      mediaContext={...context,binding:{kind:kind==='notes'?'note':'guide',target:previous?.slug??'new',expectedVersion:previous?(previous.updatedAt||''):null},proofs:body.mediaProofs}
      mediaNames=await media.verifyChanges(plan.saved, previous,mediaContext)
      saved = plan.saved
      return plan.records
    }) } catch (error) {
      if (error instanceof AdminError) throw new FormalError(error.status, error.status === 409 ? 'FORMAL_STORAGE_VERSION_CONFLICT' : 'FORMAL_STORAGE_SAVE_UNCONFIRMED')
      throw error
    }
    await media.recordBinding?.(mediaNames!,mediaContext,{kind,slug:saved.slug,version:saved.updatedAt})
    return { [kind === 'notes' ? 'note' : 'guide']: saved }
  }
  return { spot, document }
}
