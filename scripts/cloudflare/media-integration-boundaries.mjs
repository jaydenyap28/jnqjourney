import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile,unlink} from 'node:fs/promises'
import {ACCOUNT,BUCKET,PROJECT,cloudflareClient,privateWranglerToken} from './candidate-cloudflare.mjs'

const root='artifacts/cloudflare-media-integration/'
const origin='https://codex-spot-media-integration.jnqjourney-spot-loop-migration-candidate.pages.dev'
const existingOrigin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const name='CANDIDATE_IDENTITY_BRIDGE_KEY'
const ref='rnamstwwbzknwbjwdgrf'
const run=promisify(execFile)
const phase=process.argv[2]
assert.ok(['prepare','finish'].includes(phase))
const cf=await cloudflareClient(),token=await privateWranglerToken()
async function r2(suffix,method='GET',body){
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/${suffix}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body&&JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)})
  const data=await response.json()
  assert.ok(response.ok&&data.success,`ISOLATED_R2_${method}_${response.status}`)
  return data.result
}
async function boundary(){
  const p=await cf(),c=p.deployment_configs
  assert.ok(p.name===PROJECT&&p.production_branch==='main'&&!p.canonical_deployment)
  assert.ok((p.domains||[]).every(domain=>domain===`${PROJECT}.pages.dev`))
  assert.ok(c.preview.fail_open===false&&c.production.fail_open===false&&c.preview.r2_buckets?.TEST_MEDIA?.name===BUCKET)
  assert.ok(!Object.keys(c.production.env_vars||{}).length&&!Object.keys(c.production.r2_buckets||{}).length)
  assert.equal((await r2('domains/managed')).enabled,false)
  assert.equal((await r2('domains/custom')).domains.length,0)
  return c
}
const c=await boundary()
const file=root+'cors-rollback.json'
if(phase==='prepare'){
  const deployment=JSON.parse(await readFile(root+'deployment.json'))
  assert.ok(deployment.success&&deployment.mediaIntegration&&deployment.ui.origin===origin&&c.preview.env_vars[name]?.type==='secret_text')
  const before=await r2('cors')
  assert.equal(before.rules.length,1)
  assert.deepEqual(before.rules[0].allowed.origins,[existingOrigin])
  assert.deepEqual(before.rules[0].allowed.methods,['PUT'])
  const temporary=structuredClone(before)
  temporary.rules[0].allowed.origins.push(origin)
  await writeFile(file,JSON.stringify({before,temporary},null,2),{flag:'wx'})
  await r2('cors','PUT',temporary)
  assert.deepEqual(await r2('cors'),temporary)
  console.log('ISOLATED_PUT_ONLY_CORS_READY')
}else{
  const report={checkedAt:new Date().toISOString(),formalMigration:'HOLD'}
  const checks=await Promise.allSettled([
    (async()=>{
      if(c.preview.env_vars[name])await cf('',{method:'PATCH',body:JSON.stringify({deployment_configs:{preview:{env_vars:{[name]:null}}}})})
      const after=await boundary();assert.deepEqual(after.production,c.production)
      assert.ok(!after.preview.env_vars[name]);report.pagesTemporaryKeyRemoved=true;report.productionUnchanged=true;report.bucketPrivate=true
    })(),
    (async()=>{
      const cli=process.env.JNQ_SUPABASE_CLI
      const list=async()=>JSON.parse((await run(process.execPath,[cli,'secrets','list','--project-ref',ref,'--output','json'],{windowsHide:true})).stdout).map(item=>item.name)
      if((await list()).includes(name))await run(process.execPath,[cli,'secrets','unset',name,'--project-ref',ref,'--yes'],{windowsHide:true})
      assert.ok(!(await list()).includes(name));report.edgeTemporaryKeyRemoved=true
    })(),
    (async()=>{
      let rollback
      try{rollback=JSON.parse(await readFile(file))}catch(error){if(error.code!=='ENOENT')throw error}
      if(rollback){
        const current=await r2('cors')
        if(JSON.stringify(current)!==JSON.stringify(rollback.before)){
          assert.deepEqual(current,rollback.temporary)
          await r2('cors','PUT',rollback.before)
        }
        assert.deepEqual(await r2('cors'),rollback.before)
      }
      report.corsRestored=true
    })(),
    (async()=>{
      try{await unlink('cloudflare/spot-loop/.dev.vars.identity-bridge-media')}catch(error){if(error.code!=='ENOENT')throw error}
      report.localTemporaryKeyRemoved=true
    })(),
  ])
  report.passed=checks.every(check=>check.status==='fulfilled')
  await writeFile(root+'final-boundaries.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
  if(!report.passed)process.exitCode=1
}
