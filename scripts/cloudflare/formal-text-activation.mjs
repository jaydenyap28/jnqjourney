// Explicit first-stage tools only. Never start a Publisher or touch public media.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {formalPrivateReadSnapshot} from './formal-postgres-backup.mjs'
import {ACCOUNT,privateWranglerToken} from './candidate-cloudflare.mjs'
const ref='vrufunuomioczocdsoer',root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.')
const directory=path.join(root,'production-publisher/text-activation-20261113')
const json=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
assert.ok(['--snapshot','--verify-isolation'].includes(process.argv[2]));assert.equal(process.argv[3],ref);assert.equal(process.argv.length,4)
const settings=await json(path.join(root,'production-publisher/settings.json'))
assert.equal(settings.projectRef,ref)
for(const name of ['enabled','formalWritesEnabled','formalUploadsEnabled','formalPublishingEnabled'])assert.equal(settings[name],false)
process.env.JNQ_WRANGLER_CLI=settings.wranglerCli
if(process.argv[2]==='--verify-isolation'){
 const before=await json(path.join(directory,'legacy-before.json'))
 const snapshot=await formalPrivateReadSnapshot({directory,filename:'legacy-after.json',sql:await readFile('scripts/cloudflare/formal-text-preflight.read-only.sql','utf8')})
 const after=await json(snapshot.path)
 assert.deepEqual(after.cron,{...before.cron,active:false});assert.equal(after.trigger.enabled,'D')
 assert.deepEqual({...after.trigger,enabled:before.trigger.enabled},before.trigger)
 for(const key of ['queue','business','other_cron','other_triggers'])assert.deepEqual(after[key],before[key],key+'_CHANGED')
 console.log(JSON.stringify({legacyIsolated:true,queueUnchanged:true,originalBusinessUnchanged:true,unrelatedObjectsUnchanged:true,snapshotSha256:snapshot.sha256}));process.exit(0)
}
const backup=await json(path.join(root,'postgres-logical-2026-11-12T03-20-25-865Z/manifest.json'))
assert.equal(backup.projectRef,ref)
for(const [name,expected] of Object.entries(backup.files))assert.equal(sha(await readFile(path.join(root,'postgres-logical-2026-11-12T03-20-25-865Z',name))),expected.sha256)
const restore=await json(path.join(root,'postgres-restore-2026-11-12T03-33-28-425Z/restore-result.json'))
assert.ok(restore.restored&&restore.archiveSha256===backup.files['formal.dump'].sha256)
const token=await privateWranglerToken()
const cloud=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/jnqjourney-static-recovery-candidate`,{headers:{Authorization:'Bearer '+token},redirect:'error'})
const project=(await cloud.json()).result
assert.ok(cloud.ok&&project.canonical_deployment.id==='333e51aa-506e-4a66-a7c6-4f28e3e890a1'&&!project.canonical_deployment.uses_functions)
const response=await fetch('https://www.jnqjourney.com/_publication.json',{cache:'no-store',redirect:'error'})
const receipt=Buffer.from(await response.arrayBuffer()),staticBackup=await json(path.join(root,'static-backup-result.json'))
assert.equal(response.status,200);assert.equal(sha(receipt),staticBackup.receiptSha256)
const snapshot=await formalPrivateReadSnapshot({directory,filename:'legacy-before.json',sql:await readFile('scripts/cloudflare/formal-text-preflight.read-only.sql','utf8')})
const before=await json(snapshot.path)
assert.equal(before.identity.read_only,'on');assert.equal(before.queue.rows,586);assert.equal(before.queue.pending,4)
await writeFile(path.join(directory,'preflight.json'),JSON.stringify({projectRef:ref,snapshotSha256:snapshot.sha256,backupHashes:5,restore:true,
 productionId:project.canonical_deployment.id,receiptSha256:sha(receipt),queue:before.queue,oldCronJobId:before.cron.jobid,triggerState:before.trigger.enabled}),{flag:'wx'})
console.log(JSON.stringify({snapshotSavedPrivately:true,backupHashesVerified:5,priorRestoreVerified:true,productionUnchanged:true,queue:before.queue,oldCronJobId:before.cron.jobid,triggerState:before.trigger.enabled}))
