// Existing CLI authorization only. Never read .env.local or a raw token store.
// Keep API credentials inside this process; never log/serialize returned secrets.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
export const ISOLATED_REF='rnamstwwbzknwbjwdgrf'
export const ISOLATED_ORIGIN=`https://${ISOLATED_REF}.supabase.co`
export async function isolatedKeys() {
  const cli=process.env.JNQ_SUPABASE_CLI
  if(!cli)throw new Error('SUPABASE_CLI_PATH_REQUIRED')
  let result
  try {result=await promisify(execFile)(process.execPath,[cli,'projects','api-keys','--project-ref',ISOLATED_REF,'--output','json'],{cwd:new URL('../../cloudflare/spot-loop/',import.meta.url),windowsHide:true,maxBuffer:1024*1024})}
  catch {throw new Error('ISOLATED_CLI_AUTH_FAILED')}
  let keys
  try {keys=JSON.parse(result.stdout)}catch {throw new Error('ISOLATED_KEY_RESPONSE_INVALID')}
  const anon=keys.find(k=>k.name==='anon')?.api_key
  const service=keys.find(k=>k.name==='service_role')?.api_key
  if(!anon||!service||anon.includes('***')||service.includes('***'))throw new Error('ISOLATED_KEYS_UNAVAILABLE')
  return {anon,service}
}
export async function isolatedRequest(keys,resource,options={}) {
  const url=new URL(resource,ISOLATED_ORIGIN)
  if(url.origin!==ISOLATED_ORIGIN)throw new Error('ISOLATED_TARGET_REQUIRED')
  return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:keys.service,Authorization:`Bearer ${keys.service}`,...options.headers}})
}
