// Read-only metadata probe. No project discovery, SQL, RPC calls or row bodies.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {SPOT_FIELDS} from '../../cloudflare/spot-loop/spot-contract.mjs'
import {ISOLATED_REF,ISOLATED_ORIGIN,isolatedKeys,isolatedRequest} from './isolated-supabase.mjs'

if(process.argv.length!==3||process.argv[2]!==ISOLATED_REF||ISOLATED_REF!=='rnamstwwbzknwbjwdgrf')throw Error('EXPLICIT_ISOLATED_PROJECT_REQUIRED')
const rpcNames=['register','save','withdraw','revoke','delete','lookup'].map(name=>'jnq_media_'+name)
const typeInfo=async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[process.env.JNQ_SUPABASE_CLI,'gen','types','typescript','--project-id',ISOLATED_REF,'--schema','public'],
    {cwd:new URL('../../cloudflare/spot-loop/',import.meta.url),windowsHide:true,maxBuffer:4*1024*1024})
  const row=stdout.match(/\blocations:\s*\{\s*Row:\s*\{\r?\n([\s\S]*?)\r?\n\s+}\r?\n\s+Insert:/)?.[1]
  if(!row)throw Error('TYPES_PARSE_FAILED')
  const columns=Object.fromEntries([...row.matchAll(/^\s+([a-z_]+):\s*(\S.*)$/gm)].map(([,name,type])=>[name,type.trim()]))
  return {columns,required:SPOT_FIELDS.length,missing:SPOT_FIELDS.filter(name=>!Object.hasOwn(columns,name)),
    extra:Object.keys(columns).filter(name=>!SPOT_FIELDS.includes(name)),rpcNamesInPublicTypeMetadata:rpcNames.filter(name=>new RegExp(`^\\s+${name}:`, 'm').test(stdout))}
}
const restInfo=async()=>{
  const keys=await isolatedKeys()
  const api=options=>isolatedRequest(keys,'/rest/v1/',{...options,headers:{Accept:'application/openapi+json',...options?.headers}})
  const count=async (key,query={})=>{
    const params=new URLSearchParams({select:SPOT_FIELDS.join(','),...query})
    const response=await isolatedRequest(key,'/rest/v1/locations?'+params,{method:'HEAD',headers:{Prefer:'count=exact'}})
    const range=response.headers.get('content-range')
    return {status:response.status,count:range&&/\/\d+$/.test(range)?Number(range.split('/').at(-1)):null}
  }
  const [root,privateSchema,serviceSelect,anonSelect,reservedFixtures]=await Promise.all([
    api(),api({headers:{'Accept-Profile':'jnq_media_private'}}),count(keys),count({service:keys.anon}),count(keys,{and:'(id.gte.92000,id.lt.93000)'})
  ])
  const schema=root.ok?await root.json():null
  const privateError=!privateSchema.ok?await privateSchema.json().catch(()=>null):null
  await privateSchema.body?.cancel().catch(()=>{})
  const version=schema?.info?.version
  return {rootStatus:root.status,openApiVersion:typeof version==='string'&&/^[\w. +-]{1,48}$/.test(version)?version:null,
    rpcNamesInOpenApi:rpcNames.filter(name=>Object.hasOwn(schema?.paths??{},'/rpc/'+name)),
    privateProfile:{status:privateSchema.status,code:/^PGRST\d+$/.test(privateError?.code||'')?privateError.code:null},
    serviceSelect,anonSelect,reservedFixtures}
}
const [types,rest]=await Promise.allSettled([typeInfo(),restInfo()])
const result={project:ISOLATED_REF,origin:ISOLATED_ORIGIN,
  typeMetadata:types.status==='fulfilled'?types.value:{error:'EXPLICIT_PROJECT_TYPE_METADATA_UNAVAILABLE'},
  dataApi:rest.status==='fulfilled'?rest.value:{error:'ISOLATED_DATA_API_METADATA_UNAVAILABLE'}}
console.log(JSON.stringify(result,null,2))
if(types.status!=='fulfilled'||rest.status!=='fulfilled')process.exitCode=1
