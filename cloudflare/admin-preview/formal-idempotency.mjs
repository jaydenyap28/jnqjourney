import { formalDigest } from './formal-publication.mjs'
import { FormalError } from './formal-runtime.mjs'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

export async function formalMutationOnce(queue, { id, actor, operation, body }, action) {
  if (!uuid.test(id || '') || !uuid.test(actor || '')) throw new FormalError(400, 'FORMAL_MUTATION_ID_REQUIRED')
  const key = '_mutations/' + await formalDigest({ id, actor }) + '.json'
  const digest = await formalDigest({ operation, body })
  const nonce = crypto.randomUUID()
  const reserved = { id, actor, operation, digest, nonce, state: 'reserved', at: new Date().toISOString() }
  const receipt = await queue.createOnce(key, reserved)
  if (receipt.actor !== actor || receipt.digest !== digest || receipt.operation !== operation) throw new FormalError(409, 'FORMAL_MUTATION_ID_REUSED')
  if (receipt.state === 'committed') return receipt.result
  if (receipt.state !== 'reserved' || receipt.nonce !== nonce) throw new FormalError(409, 'FORMAL_MUTATION_RECONCILE_REQUIRED')
  let result
  try { result = await action() }
  catch (error) {
    // Never delete/reclaim an intent after an uncertain database result.
    const state = error instanceof FormalError && [400, 404, 409, 415, 422].includes(error.status) ? 'rejected' : 'uncertain'
    try { await queue.write(key, { ...reserved, state, code: error instanceof FormalError ? error.code : 'FORMAL_SAVE_UNCONFIRMED' }) } catch { /* retain reserved */ }
    throw error
  }
  const committed = { ...reserved, state: 'committed', result }
  try { await queue.write(key, committed) } catch { /* reconcile, do not execute action again */ }
  const confirmed = await queue.read(key)
  if (confirmed?.state !== 'committed' || confirmed.digest !== digest || confirmed.nonce !== nonce) throw new FormalError(503, 'FORMAL_MUTATION_RECEIPT_UNCONFIRMED')
  return confirmed.result
}

export async function formalMutationStatus(queue, id, actor) {
  if (!uuid.test(id || '') || !uuid.test(actor || '')) throw new FormalError(400, 'FORMAL_MUTATION_ID_REQUIRED')
  const receipt = await queue.read('_mutations/' + await formalDigest({ id, actor }) + '.json')
  return receipt ? { state: receipt.state, ...(receipt.state === 'committed' ? { result: receipt.result } : {}) } : { state: 'unknown' }
}
