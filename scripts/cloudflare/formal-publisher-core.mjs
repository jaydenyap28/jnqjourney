import { budgetBlockedUntil } from './publication-budget.mjs'

// Same bounded publication states and budget as the isolated runner. All I/O
// is explicit; the installed entry supplies the real guarded ports.
export async function formalPublisherTick({ enabled = false, ports, now = Date.now() }) {
  if (!enabled) return { state: 'disabled' }
  const lock = await ports.lock()
  if (!lock) return { state: 'busy' }
  try {
    const pending = await ports.pending()
    if (pending) {
      const deployment = await ports.findDeployment(pending)
      if (!deployment) return { state: 'verifying', reason: 'DEPLOYMENT_ID_UNKNOWN_NO_RESUBMISSION' }
      if (['failure', 'canceled'].includes(deployment.latest_stage?.status)) {
        await ports.progress(pending, { state: 'failed', retryable: true, deploymentId: deployment.id })
        await ports.clearPending()
        return { state: 'failed' }
      }
      if (deployment.latest_stage?.status !== 'success') return { state: 'verifying' }
      await ports.verifyDeployment(pending, deployment)
      // A previously committed, read-back-verified atomic live record is an
      // idempotency receipt. Do not treat later edits as a retry of this save.
      if (!await ports.alreadyCommitted(pending, deployment)) await ports.verifyAuthority(pending)
      await ports.commit(pending, deployment)
      await ports.progress(pending, { state: 'succeeded', retryable: false, deploymentId: deployment.id, url: deployment.url })
      await ports.clearPending()
      return { state: 'succeeded', deploymentId: deployment.id }
    }
    const job = await ports.latest()
    if (!job) return { state: 'idle' }
    const state = await ports.state(job)
    if (state.state === 'building') {
      // No submission journal exists, so upload could not have started. Keep
      // partial output, reserve a new budgeted attempt after a process crash.
      await ports.progress(job, { state: 'queued', attempt: (state.attempt || 1) + 1, reason: 'RECOVERED_INTERRUPTED_BUILD' })
      return { state: 'queued' }
    }
    if (state.state !== 'queued') return state
    const blockedUntil = budgetBlockedUntil(await ports.ledger(), now)
    if (blockedUntil) return { state: 'queued', blockedUntil }
    try { await ports.verifyAuthority(job) }
    catch {
      await ports.progress(job, { state: 'failed', retryable: false, reason: 'FORMAL_APPROVAL_STALE_OR_UNAVAILABLE_RESELECT' })
      return { state: 'failed' }
    }
    await ports.recordAttempt(job, now)
    await ports.progress(job, { state: 'building', attempt: state.attempt || 1 })
    let record
    try {
      const built = await ports.build(job)
      await ports.verifyAuthority(job)
      record = await ports.prepareSubmission(job, built, state.attempt || 1)
      await ports.savePending(record) // Must precede any network submission.
      await ports.progress(job, { state: 'verifying', attempt: record.attempt })
    } catch (error) {
      // No submission occurred. Only an explicit user retry can build again.
      await ports.progress(job, { state: 'failed', attempt: state.attempt || 1, retryable: true, reason: 'FORMAL_BUILD_OR_PREFLIGHT_FAILED' })
      return { state: 'failed' }
    }
    try { await ports.submit(record) } catch { /* timeout is not a confirmed failure */ }
    return { state: 'verifying', reason: 'RECONCILE_NEXT_TICK', jobId: job.id }
  } finally { await lock.release() }
}
