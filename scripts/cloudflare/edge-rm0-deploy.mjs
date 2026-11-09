// One official-CLI deployment to the explicitly authorized isolated project.
// Local fixture credentials are read only to generate the server admin allowlist.
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const PROJECT='rnamstwwbzknwbjwdgrf',NAME='jnq-registry-rm0-pilot'
assert.deepEqual(process.argv.slice(2),[PROJECT])
const cli=process.env.JNQ_SUPABASE_CLI
assert.ok(cli)
const root='artifacts/cloudflare-edge-rm0/'
const work=path.resolve(root+'project')
const folder=work+'/supabase/functions/'+NAME
await mkdir(folder,{recursive:true})
const credentials=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session','utf8'))
assert.equal(credentials.projectRef,PROJECT)
assert.equal(typeof credentials.userId,'string')
assert.equal(typeof credentials.email,'string')
const source=await readFile('cloudflare/spot-loop/edge-pilot/index.ts','utf8')
await writeFile(folder+'/index.ts',source)
await writeFile(folder+'/pilot-config.json',JSON.stringify({adminId:credentials.userId,adminEmail:credentials.email.toLowerCase()}))
await writeFile(work+'/supabase/config.toml',`project_id = "jnq-edge-rm0-pilot-local-config"\n[functions.${NAME}]\nverify_jwt = true\nentrypoint = "./functions/${NAME}/index.ts"\n`)
const report={projectRef:PROJECT,name:NAME,stage:'identity-only',verifyJwt:true,sourceSha256:createHash('sha256').update(source).digest('hex'),success:false}
const exec=promisify(execFile)
try{
  const {stdout}=await exec(process.execPath,[cli,'functions','list','--project-ref',PROJECT,'--output','json'],{windowsHide:true,maxBuffer:1024*1024})
  const functions=JSON.parse(stdout)
  assert.ok(Array.isArray(functions)&&!functions.some(f=>f.slug===NAME||f.name===NAME))
  await exec(process.execPath,[cli,'functions','deploy',NAME,'--project-ref',PROJECT,'--workdir',work,'--use-api','--yes'],{windowsHide:true,timeout:120000,maxBuffer:4*1024*1024})
  const after=await exec(process.execPath,[cli,'functions','list','--project-ref',PROJECT,'--output','json'],{windowsHide:true,maxBuffer:1024*1024})
  const deployed=JSON.parse(after.stdout).find(f=>f.slug===NAME||f.name===NAME)
  assert.ok(deployed)
  report.functionId=deployed.id
  report.version=deployed.version
  report.status=deployed.status
  report.verifyJwt=deployed.verify_jwt
  assert.equal(report.verifyJwt,true)
  report.success=true
}catch(error){
  report.error='ISOLATED_IDENTITY_FUNCTION_DEPLOYMENT_FAILED'
  report.exitCode=typeof error.code==='number'?error.code:null
  process.exitCode=1
}
await writeFile(root+'identity-deployment.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report,null,2))
