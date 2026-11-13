import { FormalError } from './formal-runtime.mjs'

// Queue admission and Production execution are separate capabilities. Missing
// approval is a hard HOLD, not an offline worker or a successful deployment.
export function requireFormalExecution(settings) {
  if (settings?.enabled !== true || settings?.formalPublishingEnabled !== true ||
      settings?.productionReleaseApproved !== true || settings?.supportedReleaseEnvironment !== 'production') {
    throw new FormalError(423, 'FORMAL_PRODUCTION_RELEASE_HELD')
  }
}

// A create-only slot serializes concurrent publish clicks without relying on
// a browser lock. A lost job-write response is reconciled by the same slot.
export async function enqueueFormalJob(queue, job, baselineRevision) {
  const latest = await queue.latest()
  let predecessor = baselineRevision
  if (latest?.id === job.id) return { job: latest, duplicate: true }
  if (latest) {
    const state = await queue.progress(latest.id)
    if (!['succeeded', 'failed'].includes(state?.state)) throw new FormalError(409, 'FORMAL_QUEUE_BUSY')
    // A pending retry must not be silently superseded.
    if (await queue.retry(latest.id, (state.attempt || 1) + 1)) throw new FormalError(409, 'FORMAL_QUEUE_BUSY')
    predecessor = latest.id + '-' + (state.attempt || 1)
  }
  const slot = await queue.createOnce('_publication/admission/' + predecessor + '.json', { id: job.id })
  if (slot.id !== job.id) throw new FormalError(409, 'FORMAL_CONCURRENT_PUBLISH_RESELECT')
  const saved = await queue.createOnce('_publication/jobs/' + job.id + '.json', job)
  return { job: saved, duplicate: saved.requestedAt !== job.requestedAt }
}

export async function reserveFormalRetry(queue, latest, progress, actor) {
  const attempt=(progress.attempt || 1)+1
  const slot=await queue.createOnce('_publication/admission/'+latest.id+'-'+(attempt-1)+'.json',{id:latest.id,retry:attempt})
  if(slot.id!==latest.id||slot.retry!==attempt)throw new FormalError(409,'FORMAL_CONCURRENT_PUBLISH_RESELECT')
  await queue.createOnce(`_publication/retry/${latest.id}/${attempt}.json`,{at:new Date().toISOString(),actor})
}
