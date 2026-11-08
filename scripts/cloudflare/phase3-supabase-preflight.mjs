import {mkdir,writeFile} from 'node:fs/promises'
import {isolatedKeys,isolatedRequest,ISOLATED_REF} from './isolated-supabase.mjs'
const report={projectRef:ISOLATED_REF,mode:'read-only',sqlExecuted:false,productionAccessed:false}
try {
  const keys=await isolatedKeys()
  const response=await isolatedRequest(keys,'/rest/v1/',{headers:{Accept:'application/openapi+json'}})
  report.httpStatus=response.status
  if(response.ok) {
    const schema=await response.json()
    const columns=Object.keys(schema.definitions?.locations?.properties||{})
    report.locationsExists=columns.length>0
    report.columns=columns
    const required=['id','name','name_cn','description','image_url','images','status','publication_status','seo_title_zh','seo_description_zh','seo_title_en','seo_description_en','experience_zh','experience_en','address','updated_at','redirect_url','redirect_type']
    report.missingColumns=required.filter(column=>!columns.includes(column))
    report.schemaCompatible=report.missingColumns.length===0
  }
}catch(error){report.error=error.message==='ISOLATED_CLI_AUTH_FAILED'?'ISOLATED_CLI_AUTH_FAILED':error.message==='ISOLATED_KEYS_UNAVAILABLE'?'ISOLATED_KEYS_UNAVAILABLE':'ISOLATED_PREFLIGHT_FAILED'}
await mkdir('artifacts/cloudflare-phase3',{recursive:true})
await writeFile('artifacts/cloudflare-phase3/supabase-preflight.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
