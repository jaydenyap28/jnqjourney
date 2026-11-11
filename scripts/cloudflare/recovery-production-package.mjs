// Authorized production packaging reuses the accepted Preview bytes.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {link,mkdir,readFile,readdir,unlink,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY_BASE,fingerprint} from './recovery-sources.mjs'
import {staticRecoveryIndexingPolicy} from './recovery-launch-policy.mjs'

assert.deepEqual(process.argv.slice(2),['--approved-production-recovery'])
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'codex/cloudflare-static-recovery')
const accepted=path.join(RECOVERY_BASE,'runs/owner-confirmed-20261111')
const target=path.join(RECOVERY_BASE,'runs/production-20261111')
const json=async file=>JSON.parse(await readFile(file,'utf8'))
const [deployment,verification,gate,current,previous,bundle]=await Promise.all([
  json(path.join(accepted,'deployment.json')),json(path.join(accepted,'verification.json')),
  json(path.join(accepted,'media-approval-gate.json')),json(path.join(target,'source-manifest.json')),
  json(path.join(accepted,'source-manifest.json')),json(path.join(accepted,'package-result.json')),
])
assert.ok(deployment.success&&deployment.deploymentId==='368a3f26-1e0b-42c0-8c90-f38caa2cf84e'
  &&verification.passed&&verification.functions===0&&gate.finalPackageVerified)
assert.equal(current.databaseFingerprint,previous.databaseFingerprint,'PUBLICATION_CHANGED_BEFORE_PRODUCTION')
for(const name of Object.keys(previous.files).filter(name=>!['database.json','fx.json'].includes(name))){
  assert.equal(current.files[name].sha256,previous.files[name].sha256,'PUBLIC_CONTENT_CHANGED_BEFORE_PRODUCTION_'+name)
}
const source=path.join(accepted,'deploy'),output=path.join(target,'deploy')
await mkdir(output,{recursive:true})
assert.equal((await readdir(output)).length,0,'PRODUCTION_PACKAGE_ALREADY_EXISTS')
const files=[]
async function copy(directory=''){
  for(const entry of await readdir(path.join(source,directory),{withFileTypes:true})){
    const name=path.posix.join(directory,entry.name)
    assert.ok(!entry.isSymbolicLink(),'PACKAGE_SYMLINK')
    if(entry.isDirectory()){await mkdir(path.join(output,name),{recursive:true});await copy(name)}
    else {await link(path.join(source,name),path.join(output,name));files.push(name)}
  }
}
await copy()
assert.equal(files.length,verification.files)
const sha=async file=>{
  const hash=createHash('sha256')
  for await(const bytes of createReadStream(file))hash.update(bytes)
  return hash.digest('hex')
}
let cursor=0
const checks=new Array(files.length)
await Promise.all(Array.from({length:4},async()=>{
  while(cursor<files.length){
    const index=cursor++,name=files[index],digest=await sha(path.join(source,name))
    if(name.startsWith('media/static/'))assert.equal(path.basename(name).split('.')[0],digest,'FROZEN_MEDIA_DIGEST_MISMATCH')
    checks[index]={path:name,sha256:digest}
  }
}))
await writeFile(path.join(target,'accepted-package.sha256.json'),JSON.stringify({
  preview:deployment.url,deploymentId:deployment.deploymentId,publicationReceiptSha256:verification.publicationReceiptSha256,
  fileCount:checks.length,files:checks,
},null,2))
const changed=[]
async function replace(name,text){
  // Break this hard link before writing. The accepted fallback stays immutable.
  await unlink(path.join(output,name))
  await writeFile(path.join(output,name),text,{flag:'wx'})
  changed.push({path:name,sha256:createHash('sha256').update(text).digest('hex')})
}
const policy=staticRecoveryIndexingPolicy('production-review')
await replace('_headers',policy.headers.replace('X-JnQ-Hosting: production-review-only','X-JnQ-Hosting: static-recovery-production'))
await replace('robots.txt',policy.robots)
const fx=await json(path.join(target,'sources/fx.json'))
for(const base of Object.keys(fx.rates)){
  const file='public-data/fx/'+base+'.json'
  await replace(file,JSON.stringify({date:fx.date,rates:Object.fromEntries(Object.entries(fx.rates).filter(([quote])=>quote!==base).map(([quote,value])=>[quote,value/fx.rates[base]]))}))
}
const receipt=await json(path.join(output,'_publication.json'))
Object.assign(receipt,{published:true,formalMigration:'PRODUCTION_RECOVERY_AUTHORIZED_2026_11_11',
  acceptedPreviewId:deployment.deploymentId,sourceCapturedAt:current.capturedAt,
  sourceFingerprint:fingerprint(current.files),frozenImplementationCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  fxDate:fx.date,withdrawalPolicy:'A_STATIC_REPUBLISH_NO_HARD_30_MINUTE_GUARANTEE'})
await replace('_publication.json',JSON.stringify(receipt))
const sitemap=await readFile(path.join(output,'sitemap.xml'),'utf8')
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1])
assert.equal(urls.length,bundle.pages.filter(page=>page.indexable).length,'SITEMAP_ELIGIBILITY_COUNT')
assert.ok(urls.every(url=>url.startsWith('https://www.jnqjourney.com/')))
for(const page of bundle.pages){
  const html=await readFile(path.join(output,page.file),'utf8')
  assert.equal(await sha(path.join(output,page.file)),checks.find(item=>item.path===page.file).sha256)
  assert.equal(/name="robots" content="[^"]*(?:noindex|none)/.test(html),!page.indexable,'PAGE_QUALITY_NOINDEX_CHANGED')
}
assert.ok((await readFile(path.join(output,'ads.txt'),'utf8')).includes('google.com'))
const manifest={...verification,productionPackage:true,acceptedPreview:deployment.url,acceptedPreviewId:deployment.deploymentId,
  immutableAcceptedPackage:true,backupManifest:'accepted-package.sha256.json',changed,sourceCapturedAt:current.capturedAt,
  sitemapEntries:urls.length,withdrawalPolicy:receipt.withdrawalPolicy,fxDate:fx.date}
await writeFile(path.join(target,'production-package.json'),JSON.stringify(manifest,null,2))
await writeFile(path.join(target,'wrangler.jsonc'),JSON.stringify({name:'jnqjourney-static-recovery-candidate',pages_build_output_dir:'./deploy'},null,2))
console.log(JSON.stringify({pages:manifest.publicPages,files:files.length,sitemap:urls.length,functions:0,changed:changed.map(row=>row.path),backupFiles:checks.length}))
