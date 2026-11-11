import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {FINAL_DIR} from './recovery-media-inventory-final.mjs'
const token=await privateWranglerToken()
async function get(suffix){
  const response=await fetch('https://api.cloudflare.com/client/v4'+suffix,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(15000)})
  const payload=await response.json()
  return {status:response.status,success:payload.success,codes:payload.errors?.map(item=>item.code),result:payload.success?payload.result:undefined}
}
const zones=await get('/zones?name=jnqjourney.com&account.id='+ACCOUNT)
const report={checkedAt:new Date().toISOString(),remoteWrites:0,zoneLookup:{status:zones.status,codes:zones.codes},customRuleCount:'UNKNOWN',freeRuleSlots:'UNKNOWN',rulesTested:false}
if(zones.success){
  assert.ok(Array.isArray(zones.result)&&zones.result.length<=1)
  const [zone]=zones.result
  if(zone){
    assert.equal(zone.name,'jnqjourney.com');assert.equal(zone.account.id,ACCOUNT);assert.match(zone.id,/^[a-f0-9]{32}$/)
    report.zone={name:zone.name,status:zone.status,plan:zone.plan?.name??'UNKNOWN'}
    const phase=await get(`/zones/${zone.id}/rulesets/phases/http_request_firewall_custom/entrypoint`)
    report.wafLookup={status:phase.status,codes:phase.codes}
    if(phase.success){
      const rules=phase.result?.rules||[]
      report.customRuleCount=rules.length
      report.enabledRuleCount=rules.filter(rule=>rule.enabled).length
      if(/free/i.test(report.zone.plan))report.freeRuleSlots=Math.max(0,5-rules.length)
    }else if(phase.status===404){
      report.customRuleCount='NO_ENTRYPOINT_RETURNED'
    }
  }
}
await writeFile(path.join(FINAL_DIR,'zone-readonly.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
