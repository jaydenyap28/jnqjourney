// Deploy only the independent Admin Preview; there is no public-site target.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer'
assert.deepEqual(process.argv.slice(2),['--admin-preview',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),pub=path.join(root,'production-publisher'),dir=path.join(pub,'publication-phase3-20261113'),json=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''))
const s=await json(path.join(pub,'settings.json'));assert.ok(!s.enabled&&s.productionReleaseApproved===false)
assert.equal((await json(path.join(dir,'check.json'))).result,'FORMAL_PUBLICATION_PREPARATION_PASS')
process.env.JNQ_WRANGLER_CLI=s.wranglerCli
const token=await privateWranglerToken(),headers={Authorization:'Bearer '+token}
async function cloud(project){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${project}`,{headers,redirect:'error',signal:AbortSignal.timeout(20000)}),d=await r.json();assert.ok(r.ok&&d.success);return d.result}
const publicName='jnqjourney-static-recovery-candidate',admin='jnqjourney-admin-formal',before=await cloud(publicName),p=await cloud(admin)
const sha=v=>createHash('sha256').update(v).digest('hex'),fingerprint=p=>sha(JSON.stringify({canonical:p.canonical_deployment?.id,branch:p.production_branch,domains:p.domains,config:p.deployment_configs}))
assert.equal(before.canonical_deployment.id,'333e51aa-506e-4a66-a7c6-4f28e3e890a1');assert.ok(!p.canonical_deployment&&p.production_branch==='reserved-production')
const pkg=await json(path.join(pub,'frontend-managed-off/package.json'));assert.ok(pkg.zeroFunctions&&pkg.projectRef===ref&&pkg.preparedOff)
const out=path.resolve(pkg.out);assert.ok(out.startsWith(path.join(pub,'frontend-managed-off')+path.sep))
assert.match(await readFile(path.join(out,'_headers'),'utf8'),/X-Robots-Tag: noindex, nofollow/)
const commit=sha(JSON.stringify(pkg)+JSON.stringify(await json(path.join(dir,'prepared.json')))).slice(0,40)
await writeFile(path.join(dir,'admin-submission.json'),JSON.stringify({out,commit,branch:'read-only',beforePublic:fingerprint(before)}),{flag:'wx'})
await writeFile(path.join(dir,'wrangler.jsonc'),JSON.stringify({name:admin,pages_build_output_dir:out}))
try{await promisify(execFile)(process.execPath,[s.wranglerCli,'pages','deploy',out,'--project-name',admin,'--branch','read-only','--commit-hash',commit,'--commit-dirty=true','--force'],{cwd:dir,windowsHide:true,timeout:180000,maxBuffer:2*1024**2,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false'}})}catch{throw Error('ADMIN_PREVIEW_DEPLOYMENT_UNKNOWN_RECONCILE_NO_RETRY')}
const after=await cloud(admin),d=after.latest_deployment
assert.ok(!after.canonical_deployment&&d.environment==='preview'&&d.deployment_trigger.metadata.commit_hash===commit&&!d.uses_functions&&d.latest_stage.status==='success')
assert.equal(fingerprint(await cloud(publicName)),fingerprint(before))
const result={deploymentId:d.id,url:'https://read-only.jnqjourney-admin-formal.pages.dev/admin',fixedUrl:d.url,environment:'preview',functions:0,publicProductionUnchanged:true}
await writeFile(path.join(dir,'admin-deployment.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result))
