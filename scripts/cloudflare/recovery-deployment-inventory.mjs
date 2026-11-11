import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'

const token=await privateWranglerToken()
const base='https://api.cloudflare.com/client/v4'
async function get(resource){
  const response=await fetch(base+resource,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
  const data=await response.json()
  return {status:response.status,codes:data.errors?.map(error=>error.code)??[],result:data.success?data.result:null,info:data.result_info}
}
async function list(resource){
  const entries=[]
  for(let page=1;page<=40;page++){
    const result=await get(resource+(resource.includes('?')?'&':'?')+'per_page=10&page='+page)
    assert.ok(result.status===200&&Array.isArray(result.result),`PAGES_LIST_${result.status}_${result.codes.join('_')}`)
    entries.push(...result.result)
    if(result.info?.total_pages!==undefined?page>=result.info.total_pages:result.result.length<10)return entries
  }
  throw new Error('PAGES_INVENTORY_PAGE_LIMIT')
}
const account='/accounts/'+ACCOUNT
const projects=(await list(account+'/pages/projects')).filter(item=>/^jnqjourney(?:-|$)/.test(item.name))
assert.ok(projects.some(item=>item.name==='jnqjourney-static-recovery-candidate'),'STATIC_PROJECT_NOT_VISIBLE')
const records=[]
for(const project of projects){
  const host=project.name+'.pages.dev'
  const listResult=await list(account+'/pages/projects/'+project.name+'/deployments')
  const previews=listResult.filter(row=>row.environment==='preview')
  const latest=new Map()
  for(const row of previews){
    const branch=row.deployment_trigger?.metadata?.branch
    if(branch&&(!latest.has(branch)||latest.get(branch).created_on<row.created_on))latest.set(branch,row)
  }
  records.push({project:project.name,defaultUrl:'https://'+host,canonicalProduction:project.canonical_deployment?.environment==='production'?project.canonical_deployment.id:null,
    customDomains:(project.domains??[]).filter(domain=>domain!==host),productionDeployments:listResult.length-previews.length,
    previews:previews.map(row=>{
      const branch=row.deployment_trigger?.metadata?.branch??null
      const aliases=(row.aliases??[]).filter(alias=>new URL(alias).hostname.endsWith('.'+host))
      const disposition=!branch?'CHECK_BRANCH_BEFORE_DELETE':latest.get(branch)?.id===row.id?'PROTECT_OR_REPLACE_FIRST':aliases.length?'REVIEW_ACTIVE_ALIAS_BEFORE_DELETE':'OLD_FIXED_DELETE_ELIGIBLE'
      return {id:row.id,url:row.url,branch,aliases,status:row.latest_stage?.status??null,usesFunctions:row.uses_functions??null,disposition}
    })})
}
const directory='artifacts/cloudflare-static-cutover-implementation'
await mkdir(directory,{recursive:true})
await writeFile(path.join(directory,'deployment-inventory.json'),JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,projects:records},null,2))
console.log(JSON.stringify(records.map(row=>({project:row.project,previews:row.previews.length,production:row.productionDeployments,customDomains:row.customDomains.length}))))
