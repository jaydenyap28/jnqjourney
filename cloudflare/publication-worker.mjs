// No browser credentials, KV eventual consistency, or in-memory queue state.
// The SQL outbox is the authority; this Worker only reserves and polls builds.
export const CANDIDATE_BRANCH = 'codex/cloudflare-free-migration'

export function assertConfig(env) {
  for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CF_ACCOUNT_ID','CF_PAGES_TOKEN','CF_PAGES_PROJECT']) {
    if (!env[key]) throw new Error(`Missing ${key}`)
  }
  if (!env.CF_PAGES_PROJECT.endsWith('-migration-candidate')) throw new Error('Candidate project required')
  if (env.PUBLICATION_ENABLED !== 'true') throw new Error('Publication is disabled')
}

export async function tick(env, transport = fetch) {
  assertConfig(env)
  const rpc = async (name, body = {}) => {
    const response = await transport(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method:'POST', headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(10000), redirect:'error',
    })
    if (!response.ok) throw new Error(`Publication RPC failed (${response.status})`)
    return response.json()
  }
  const cf = async (suffix = '', init = {}) => {
    const response = await transport(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.CF_PAGES_PROJECT)}${suffix}`, {
      ...init, headers:{Authorization:`Bearer ${env.CF_PAGES_TOKEN}`}, signal:AbortSignal.timeout(10000), redirect:'error',
    })
    if (!response.ok) throw new Error(`Pages API failed (${response.status})`)
    const payload = await response.json()
    if (!payload.success) throw new Error('Pages API refused operation')
    return payload.result
  }
  // Read configuration before reserving quota or making a deployment request.
  const project = await cf()
  if (project.production_branch === CANDIDATE_BRANCH) throw new Error('Candidate branch must not be Production')
  const state = await rpc('jnq_publication_status')
  if (state.lease_token) {
    // Unknown submission outcome is held for operator reconciliation. Never
    // retry blindly: that would spend another free build for the same revision.
    if (!state.deployment_id) return {status:'submission-needs-reconciliation'}
    const deployment = await cf(`/deployments/${encodeURIComponent(state.deployment_id)}`)
    if (deployment.environment !== 'preview' || deployment.deployment_trigger?.metadata?.branch !== CANDIDATE_BRANCH) throw new Error('Unexpected deployment target')
    const status = deployment.latest_stage?.status
    if (status !== 'failure' && status !== 'canceled' && !(status === 'success' && deployment.latest_stage?.name === 'deploy')) return {status:'building'}
    if (status === 'success') {
      // A green deployment of stale bundled snapshots isn't publication.
      // The future authoritative snapshot build must emit this public receipt.
      const origin = new URL(deployment.url)
      if (origin.protocol !== 'https:' || !origin.hostname.endsWith(`.${env.CF_PAGES_PROJECT}.pages.dev`)) throw new Error('Unexpected preview URL')
      const receiptResponse = await transport(new URL('/_publication.json',origin).href, {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})
      if (!receiptResponse.ok) throw new Error('Publication receipt missing; lease held')
      const receipt = await receiptResponse.json()
      if (receipt.schemaVersion !== 1 || !/^\d+$/.test(String(receipt.revision)) || !/^\d+$/.test(String(state.reserved_revision)) || BigInt(receipt.revision) < BigInt(state.reserved_revision)) throw new Error('Published snapshot revision is stale; lease held')
    }
    await rpc('jnq_publication_finish', {token:state.lease_token, succeeded:status==='success'})
    return {status:status==='success'?'published':'build-failed'}
  }
  const lease = await rpc('jnq_publication_claim')
  if (!lease) return {status:'waiting'}
  // Any failure from here leaves the lease held. A POST may have reached Pages
  // even when its response was lost. Daily/monthly reservations are not refunded.
  const form = new FormData()
  form.set('branch', CANDIDATE_BRANCH)
  const deployment = await cf('/deployments', {method:'POST',body:form})
  if (!deployment?.id) throw new Error('Deployment ID unavailable; reconciliation required')
  await rpc('jnq_publication_attach', {token:lease.lease_token, deployment:deployment.id})
  return {status:'submitted'}
}

const worker = {
  async fetch() { return new Response('Not Found', {status:404,headers:{'X-Robots-Tag':'noindex','Cache-Control':'no-store'}}) },
  async scheduled(_controller, env) {
    if (env.PUBLICATION_ENABLED !== 'true') return
    try { await tick(env) } catch { console.error('Publication failed; inspect private outbox status. No credentials logged.') }
  },
}
export default worker
