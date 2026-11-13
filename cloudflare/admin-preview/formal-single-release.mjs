import { FormalError } from './formal-runtime.mjs'
import { formalDigest } from './formal-publication.mjs'
import { requireFormalExecution } from './formal-release-control.mjs'

const digest = /^[a-f0-9]{64}$/
export function assertSingleReleaseApproval(approval, now = Date.now()) {
  const start = Date.parse(approval?.approvedAt), end = Date.parse(approval?.expiresAt)
  if (approval?.mode !== 'single-job' || !digest.test(approval.jobId || '') ||
      approval.contentFingerprint !== approval.jobId || !digest.test(approval.authorityFingerprint || '') ||
      !digest.test(approval.baselineRevision || '') || !/^[a-f0-9-]{36}$/.test(approval.expectedProductionId || '') ||
      typeof approval.expectedProductionBranch !== 'string' || !approval.expectedProductionBranch ||
      !Number.isSafeInteger(approval.attempt) || approval.attempt < 1 ||
      !Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now || end - start > 2 * 60 * 60_000) {
    throw new FormalError(423, 'FORMAL_SINGLE_JOB_APPROVAL_REQUIRED')
  }
  return approval
}

export function requireSingleReleaseSettings(settings, now = Date.now()) {
  requireFormalExecution(settings)
  return assertSingleReleaseApproval(settings.approvedRelease, now)
}

export async function requireSingleJobApproval({ approval, job, attempt, live, spent }, now = Date.now()) {
  assertSingleReleaseApproval(approval, now)
  if (spent) throw new FormalError(423, 'FORMAL_SINGLE_JOB_APPROVAL_CONSUMED')
  if (!job || approval.jobId !== job.id || approval.contentFingerprint !== await formalDigest(job.payload) ||
      approval.authorityFingerprint !== job.payload.authorityRevision ||
      approval.baselineRevision !== job.payload.baselineRevision || attempt !== approval.attempt ||
      live?.source?.revision !== approval.baselineRevision || live?.deploymentId !== approval.expectedProductionId) {
    throw new FormalError(423, 'FORMAL_SINGLE_JOB_APPROVAL_MISMATCH')
  }
}

// Every terminal or uncertain result closes all independent barriers. Failures
// in one cleanup must not prevent the other barriers from being closed.
export async function restoreSingleReleaseHold(ports, result) {
  const errors = []
  for (const name of ['consumeApproval', 'holdLocal', 'holdServer', 'disableTask']) {
    try { await ports[name](result) } catch { errors.push(name) }
  }
  return { state: 'held', result: result.state, cleanupFailures: errors }
}
