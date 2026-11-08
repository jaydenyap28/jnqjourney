// Normal Wrangler credential flow, captured in a private child process.
// Never print token output or read raw Wrangler credential files/browser state.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
export const ACCOUNT='41feff7cd62964f2eb33bb82508509a1'
export const PROJECT='jnqjourney-spot-loop-migration-candidate'
export const BUCKET='jnqjourney-spot-loop-isolated-media'
export const BRANCH='codex/cloudflare-free-migration'
export async function privateWranglerToken() {
  if(!process.env.JNQ_WRANGLER_CLI)throw new Error('WRANGLER_CLI_PATH_REQUIRED')
  let result,auth
  try {
    result=await promisify(execFile)(process.execPath,[process.env.JNQ_WRANGLER_CLI,'auth','token','--json'],{cwd:new URL('../../cloudflare/spot-loop/',import.meta.url),windowsHide:true,maxBuffer:1024*1024})
    auth=JSON.parse(result.stdout)
  }catch{throw new Error('WRANGLER_PRIVATE_AUTH_FAILED')}
  const token=auth.token||auth.access_token||auth.api_token
  if(typeof token!=='string'||!token)throw new Error('WRANGLER_PRIVATE_AUTH_FORMAT_UNSUPPORTED')
  return token
}
export async function cloudflareClient() {
  const token=await privateWranglerToken()
  return async function cf(suffix='',options={}) {
    if(suffix && !/^\/deployments(?:\/[a-zA-Z0-9-]+)?(?:\?.*)?$/.test(suffix))throw new Error('CANDIDATE_API_SCOPE_REQUIRED')
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}${suffix}`,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}})
    let payload
    try {payload=await response.json()}catch{throw new Error(`CANDIDATE_CF_HTTP_${response.status}`)}
    if(!response.ok||!payload.success) {
      const error=new Error(`CANDIDATE_CF_HTTP_${response.status}_CODE_${payload.errors?.[0]?.code||'UNKNOWN'}`)
      // API error text is useful, but never allow request credentials to echo.
      let reason=String(payload.errors?.[0]?.message||'').slice(0,1200)
      const secrets=[token]
      try {for(const entry of Object.values(JSON.parse(options.body||'{}').deployment_configs?.preview?.env_vars||{}))if(entry.type==='secret_text')secrets.push(entry.value)}catch{}
      for(const secret of secrets.filter(Boolean))reason=reason.split(secret).join('[redacted]')
      error.candidateReason=reason
      throw error
    }
    return payload.result
  }
}
