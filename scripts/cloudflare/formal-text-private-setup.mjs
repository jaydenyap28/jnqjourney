import assert from 'node:assert/strict'
import path from 'node:path'
import {readFile,writeFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {connectFormalReadSource,getFormalKey} from './formal-read-source.mjs'
import {loadReleaseSnapshot} from './full-release-rehearsal.mjs'
import {applyFormalPrivateBootstrap} from '../../cloudflare/admin-preview/formal-bootstrap.mjs'
import {formalDigest} from '../../cloudflare/admin-preview/formal-publication.mjs'
const ref='vrufunuomioczocdsoer',bucket='jnq-admin-formal-publication'
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE||'.'),dir=path.join(root,'production-publisher/text-activation-20261113')
const json=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''))
const mode=process.argv[2];assert.ok(['--prepare','--create-bucket','--bootstrap'].includes(mode));assert.equal(process.argv[3],ref);assert.equal(process.argv.length,4)
const settings=await json(path.join(root,'production-publisher/settings.json'))
assert.equal(settings.projectRef,ref);assert.equal(settings.enabled,false);assert.equal(settings.formalPublishingEnabled,false);assert.equal(settings.formalUploadsEnabled,false)
process.env.JNQ_SUPABASE_CLI=settings.supabaseCli;process.env.JNQ_WRANGLER_CLI=settings.wranglerCli
const after=await json(path.join(dir,'legacy-after.json'));assert.equal(after.trigger.enabled,'D');assert.equal(after.cron.active,false)
const db=createClient(`https://${ref}.supabase.co`,await getFormalKey(),{auth:{persistSession:false,autoRefreshToken:false}})
if(mode==='--prepare'){
 const source=await connectFormalReadSource(), {feeds,manifest}=await loadReleaseSnapshot(path.join(root,'runs/full-review-20261112-b'))
 const authority={projectRef:ref}
 for(const name of ['notes','guides']){
  const pointer=(await source.storage(`_system/${name}-latest.webp`)).bytes.toString().trim()
  const item=await source.storage(pointer)
  assert.equal((await source.storage(`_system/${name}-latest.webp`)).bytes.toString().trim(),pointer)
  authority[name]={pointer,bytes:item.bytes.toString(),sha256:item.sha256}
  const actual=JSON.parse(authority[name].bytes)
  for(const old of feeds[name+'.json'][name])assert.equal(await formalDigest(actual.find(row=>row.slug===old.slug)),await formalDigest(old),'ORIGINAL_DOCUMENT_CHANGED')
 }
 authority.slugMap=JSON.parse((await source.storage('_system/location-slugs.webp')).bytes)
 const current=JSON.parse((await source.database('/rest/v1/locations?select=*&order=id')).bytes)
 assert.equal(current.length,586)
 const originalFields=Object.keys(feeds['database.json'].locations[0])
 const eligible=current.filter(row=>row.id!==450&&row.status==='active'&&[null,'published'].includes(row.publication_status))
 assert.equal(eligible.length,feeds['database.json'].locations.length)
 for(const row of feeds['database.json'].locations){const live=eligible.find(item=>item.id===row.id);assert.ok(live);for(const key of originalFields)assert.deepEqual(live[key],row[key],'ORIGINAL_SPOT_CHANGED:'+key)}
 const baseline={revision:await formalDigest(feeds),feeds,manifest,deploymentId:'333e51aa-506e-4a66-a7c6-4f28e3e890a1'}
 const pkg=await json(path.join(root,'restore-static/production-deploy/_publication.json'))
 assert.ok(pkg)
 await writeFile(path.join(dir,'bootstrap-input.json'),JSON.stringify({authority,baseline}),{flag:'wx'})
 console.log(JSON.stringify({privateBootstrapPrepared:true,publicSpots:eligible.length,notes:feeds['notes.json'].notes.length,guides:feeds['guides.json'].guides.length,originalSourcesUnchanged:true}))
}else if(mode==='--create-bucket'){
 const existing=await db.storage.getBucket(bucket)
 assert.ok(existing.error&&!existing.data,'TARGET_EXISTS_RECONCILE')
 await writeFile(path.join(dir,'bucket-submission.json'),JSON.stringify({bucket,public:false,at:new Date().toISOString()}),{flag:'wx'})
 const created=await db.storage.createBucket(bucket,{public:false,fileSizeLimit:16*1024*1024})
 const checked=await db.storage.getBucket(bucket)
 assert.ok(!created.error&&!checked.error&&checked.data.id===bucket&&checked.data.public===false,'PRIVATE_BUCKET_CREATION_UNCONFIRMED_STOP')
 console.log(JSON.stringify({bucket,public:false,created:true}))
}else{
 const input=await json(path.join(dir,'bootstrap-input.json'))
 const result=await applyFormalPrivateBootstrap({target:db,source:input.authority,baseline:input.baseline,approved:true,
  async verifyPrivate(){const checked=await db.storage.getBucket(bucket);assert.ok(!checked.error&&checked.data.id===bucket&&checked.data.public===false)} })
 await writeFile(path.join(dir,'bootstrap-result.json'),JSON.stringify(result),{flag:'wx'})
 console.log(JSON.stringify(result))
}
