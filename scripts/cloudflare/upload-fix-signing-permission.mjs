// Read-only check; do not create broader credentials or print token material.
import {writeFile} from 'node:fs/promises'
import {privateWranglerToken,ACCOUNT,PROJECT} from './candidate-cloudflare.mjs'
const token=await privateWranglerToken()
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/tokens/permission_groups`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)})
const payload=await response.json()
const report={project:PROJECT,operation:'read account token permission groups',httpStatus:response.status,success:payload.success===true,tokenCreated:false,secretsPrinted:false}
if(payload.success)report.bucketObjectWritePermissions=(payload.result||[]).filter(item=>item.name==='Workers R2 Storage Bucket Item Write').map(({id,name,is_selectable})=>({id,name,is_selectable}))
else report.errorCodes=(payload.errors||[]).map(item=>item.code)
await writeFile('artifacts/cloudflare-upload-fix/signing-permission.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
