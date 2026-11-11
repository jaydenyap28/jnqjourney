// A bounded two-release drill on a dedicated, synthetic Pages Preview branch.
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import {promisify} from 'node:util'
import path from 'node:path'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
import {PROJECT,RECOVERY_BASE} from './recovery-sources.mjs'
import {staticRecoveryIndexingPolicy} from './recovery-launch-policy.mjs'
import {FINAL_DIR,hash} from './recovery-media-inventory-final.mjs'

const run=promisify(execFile)
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSGUAAAAASUVORK5CYII=','base64')
const marker='JNQ_SYNTHETIC_WITHDRAWAL_TARGET'
const withdrawnMedia='/media/withdrawn-fixture.png',sharedMedia='/media/shared-fixture.png'
const withdrawnRoutes=['/spot/drill-withdrawn','/en/spot/drill-withdrawn','/old-withdrawal-fixture','/spot/drill-withdrawn.txt','/_next/data/drill/en/spot/drill-withdrawn.json','/public-data/spots/drill-withdrawn.json','/api/spots/drill-withdrawn',withdrawnMedia]
const requiredAfter=['/','/spot/drill-shared','/public-data/locations.json','/public-data/spots/drill-shared.json','/api/locations','/sitemap.xml',sharedMedia]
const sha=bytes=>hash(bytes)
const tag=()=>new Date().toISOString()
assert.ok(process.argv.slice(2).every(arg=>arg==='--no-store'))
const noStore=process.argv.includes('--no-store')
const branch=`withdrawal-drill-${Date.now().toString(36)}`
const root=path.join(FINAL_DIR,branch)
const original=JSON.parse(await readFile(path.join(RECOVERY_BASE,'deployment.json'),'utf8'))
assert.equal(PROJECT,'jnqjourney-static-recovery-candidate')
assert.match(original.url,/^https:\/\/[a-z0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
assert.ok(process.env.JNQ_WRANGLER_CLI)
await mkdir(root,{recursive:true})
const report={startedAt:tag(),branch,project:PROJECT,scope:'Synthetic release and withdrawal on separate Preview alias',cachePolicy:noStore?'no-store':'max-age=0, must-revalidate',functions:0,deployments:[],requests:[],passed:false}
const journal=()=>writeFile(path.join(root,'drill-result.json'),JSON.stringify(report,null,2))
const oauth=await privateWranglerToken()
const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`
async function get(suffix=''){
  const response=await fetch(base+suffix,{headers:{Authorization:`Bearer ${oauth}`},redirect:'manual',signal:AbortSignal.timeout(20000)})
  const body=await response.json()
  assert.ok(response.ok&&body.success,`PAGES_GET_${response.status}`)
  return body.result
}
async function boundary(){
  const [project,deployments]=await Promise.all([get(),get('/deployments')])
  assert.equal(project.name,PROJECT)
  assert.equal(project.production_branch,'main')
  assert.ok(!project.canonical_deployment&&!project.source)
  assert.ok((project.domains||[]).every(domain=>domain===`${PROJECT}.pages.dev`))
  assert.ok(deployments.every(item=>item.environment==='preview'))
  for(const config of Object.values(project.deployment_configs||{})){
    for(const key of ['env_vars','r2_buckets','kv_namespaces','d1_databases','services','durable_object_namespaces']){
      assert.equal(Object.keys(config[key]||{}).length,0)
    }
  }
  return {productionCount:0,canonicalEmpty:true,bindings:0,customDomains:0,deployments}
}
const selectedBoundary=({deployments,...summary})=>summary
function makeRelease(state){
  const visible=state.spots.filter(spot=>spot.status==='published')
  const media=new Set(visible.flatMap(spot=>spot.images).filter(url=>!state.revoked.includes(url)))
  const rows=visible.map(spot=>({...spot,images:spot.images.filter(url=>media.has(url))}))
  const policy=staticRecoveryIndexingPolicy('preview')
  const headers=noStore?policy.headers.replace('public, max-age=0, must-revalidate','no-store'):policy.headers
  const files=new Map([['_headers',headers],['robots.txt',policy.robots],
    ['404.html','<!doctype html><meta name="robots" content="noindex"><h1>Not found</h1>']])
  const redirects=['/api/locations /public-data/locations.json 200','/api/spots/:slug /public-data/spots/:slug.json 200']
  const html=spot=>`<!doctype html><meta name="robots" content="noindex"><h1>${spot.title}</h1>${spot.images.map(url=>`<img src="${url}" alt="Synthetic drill image">`).join('')}`
  for(const spot of rows){
    files.set(`spot/${spot.slug}.html`,html(spot))
    files.set(`en/spot/${spot.slug}.html`,html(spot))
    files.set(`spot/${spot.slug}.txt`,JSON.stringify(spot))
    files.set(`_next/data/drill/en/spot/${spot.slug}.json`,JSON.stringify({props:{spot}}))
    files.set(`public-data/spots/${spot.slug}.json`,JSON.stringify({spot}))
    if(spot.slug==='drill-withdrawn')redirects.push('/old-withdrawal-fixture /spot/drill-withdrawn 301')
  }
  files.set('_redirects',redirects.join('\n')+'\n')
  files.set('public-data/locations.json',JSON.stringify({locations:rows}))
  files.set('index.html','<!doctype html><meta name="robots" content="noindex"><h1>Synthetic withdrawal drill</h1>'+rows.map(spot=>`<a href="/spot/${spot.slug}">${spot.title}</a>`).join(''))
  files.set('sitemap.xml','<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+rows.map(spot=>`<url><loc>https://example.invalid/spot/${spot.slug}</loc></url>`).join('')+'</urlset>')
  for(const url of media)files.set(url.slice(1),url===sharedMedia?png:Buffer.concat([png,Buffer.from('drill withdrawn image')]))
  files.set('_publication.json',JSON.stringify({synthetic:true,revision:state.revision,functions:0,formalMigration:'HOLD'}))
  return files
}
function verifyRelease(files,state){
  const receipt=JSON.parse(files.get('_publication.json'))
  assert.equal(receipt.revision,state.revision,'STALE_RELEASE_CANNOT_RESTORE_REVOKED_CONTENT')
  assert.ok(files.size<50)
  if(state.revoked.includes(withdrawnMedia)){
    for(const route of withdrawnRoutes){
      assert.ok(!files.has(route.slice(1))&&!files.has(route.slice(1)+'.html'),'WITHDRAWN_FILE_PRESENT')
    }
    for(const content of files.values())if(typeof content==='string'){
      assert.ok(!content.includes(marker)&&!content.includes('drill-withdrawn')&&!content.includes(withdrawnMedia),'WITHDRAWN_REFERENCE_PRESENT')
    }
    assert.ok(files.has(sharedMedia.slice(1)),'SHARED_PUBLIC_IMAGE_LOST')
  }
}
async function deploy(files,state){
  verifyRelease(files,state)
  const folder=path.join(root,'revision-'+state.revision),dir=path.join(folder,'deploy')
  await mkdir(dir,{recursive:true})
  for(const [name,bytes] of files){
    const destination=path.join(dir,name)
    await mkdir(path.dirname(destination),{recursive:true})
    await writeFile(destination,bytes,{flag:'wx'})
  }
  await writeFile(path.join(folder,'wrangler.jsonc'),JSON.stringify({name:PROJECT,pages_build_output_dir:'./deploy'}))
  assert.equal((await readdir(folder)).length,2)
  const before=await boundary(),old=new Set(before.deployments.map(item=>item.id))
  const start=Date.now()
  const {stdout,stderr}=await run(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deploy',dir,'--project-name',PROJECT,'--branch',branch],{
    cwd:folder,windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false'},
  })
  assert.ok(!/Uploading (?:Worker|Functions)|Compiled Worker|worker bundle/i.test(stdout+stderr))
  const after=await boundary()
  const candidates=after.deployments.filter(item=>!old.has(item.id)&&item.deployment_trigger?.metadata?.branch===branch)
  assert.equal(candidates.length,1)
  const [deployment]=candidates
  assert.equal(deployment.latest_stage?.status,'success')
  assert.match(deployment.url,/^https:\/\/[a-z0-9]+\.jnqjourney-static-recovery-candidate\.pages\.dev$/)
  const alias=`https://${branch}.${PROJECT}.pages.dev`
  assert.ok(deployment.aliases?.includes(alias),'UNEXPECTED_BRANCH_ALIAS')
  const recorded={revision:state.revision,id:deployment.id,url:deployment.url,alias,environment:deployment.environment,wallMs:Date.now()-start,files:files.size,after:selectedBoundary(after)}
  report.deployments.push(recorded)
  await journal()
  return recorded
}
async function probe(origin,url,status,{absent=false,expectedHash,group=''}={}){
  const response=await fetch(origin+url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)})
  const bytes=Buffer.from(await response.arrayBuffer())
  const noindex=response.headers.get('x-robots-tag')
  const row={group,url,status:response.status,bytes:bytes.length,sha256:sha(bytes),noindex,cacheControl:response.headers.get('cache-control'),cache:response.headers.get('cf-cache-status'),age:response.headers.get('age')}
  report.requests.push(row)
  assert.equal(response.status,status,`UNEXPECTED_STATUS_${group}_${url}`)
  assert.match(noindex||'',/noindex/)
  if(expectedHash)assert.equal(row.sha256,expectedHash)
  if(absent)assert.ok(!bytes.includes(marker)&&!bytes.includes(withdrawnMedia)&&!bytes.includes('drill-withdrawn'))
  return bytes
}
try {
  report.before=selectedBoundary(await boundary())
  const beforeReceipt=await probe(original.url,'/_publication.json',200,{group:'frozen-before'})
  const initial={revision:1,revoked:[],spots:[
    {slug:'drill-withdrawn',title:marker,status:'published',images:[withdrawnMedia,sharedMedia]},
    {slug:'drill-shared',title:'JNQ_SYNTHETIC_SHARED_CONTROL',status:'published',images:[sharedMedia]},
  ]}
  await writeFile(path.join(root,'authority.json'),JSON.stringify(initial,null,2))
  const originalFiles=makeRelease(initial)
  const first=await deploy(originalFiles,initial)
  assert.equal(JSON.parse(await probe(first.alias,'/_publication.json',200,{group:'prewithdrawal'})).revision,1)
  for(const url of ['/spot/drill-withdrawn','/public-data/spots/drill-withdrawn.json',withdrawnMedia])await probe(first.alias,url,200,{group:'prewithdrawal'})
  const start=Date.now()
  report.withdrawalStartedAt=tag()
  const state={...initial,revision:2,revoked:[withdrawnMedia],spots:initial.spots.map((spot,index)=>index===0?{...spot,status:'withdrawn'}:spot)}
  await writeFile(path.join(root,'authority.json'),JSON.stringify(state,null,2))
  assert.throws(()=>verifyRelease(originalFiles,state),/STALE_RELEASE/)
  const bad=makeRelease(state)
  bad.set('public-data/leaked.json',JSON.stringify({title:marker}))
  assert.throws(()=>verifyRelease(bad,state),/WITHDRAWN_REFERENCE/)
  report.rejectedBeforeUpload=['stale release rollback','invalid release with withdrawn reference']
  const second=await deploy(makeRelease(state),state)
  assert.equal(second.alias,first.alias)
  assert.equal(JSON.parse(await probe(second.alias,'/_publication.json',200,{group:'postwithdrawal'})).revision,2)
  const post=await Promise.allSettled([
    ...withdrawnRoutes.map(url=>probe(second.alias,url,404,{absent:true,group:'postwithdrawal'})),
    ...requiredAfter.map(url=>probe(second.alias,url,200,{absent:true,group:'postwithdrawal',expectedHash:url===sharedMedia?sha(png):undefined})),
  ])
  const failure=post.find(result=>result.status==='rejected')
  if(failure)throw failure.reason
  report.withdrawalWallMs=Date.now()-start
  report.within30Minutes=report.withdrawalWallMs<=30*60*1000
  const old=await probe(first.url,withdrawnMedia,200,{group:'immutable-old-deployment'})
  report.oldImmutableStillServesWithdrawnBytes=sha(old)===sha(originalFiles.get(withdrawnMedia.slice(1)))
  await probe(original.url,'/_publication.json',200,{group:'frozen-after',expectedHash:sha(beforeReceipt)})
  report.after=selectedBoundary(await boundary())
  report.passed=report.within30Minutes
} catch(error) {
  report.failure=String(error.message||error.code).replaceAll(oauth,'[redacted]').split('\n')[0].slice(0,180)
  process.exitCode=1
} finally {
  report.finishedAt=tag()
  await journal()
}
console.log(JSON.stringify({passed:report.passed,root,deployments:report.deployments,withdrawalWallMs:report.withdrawalWallMs,oldImmutableStillServesWithdrawnBytes:report.oldImmutableStillServesWithdrawnBytes,failure:report.failure}))
