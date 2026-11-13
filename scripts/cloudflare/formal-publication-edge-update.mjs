import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
const ref='vrufunuomioczocdsoer',fn='jnq-admin-formal'
assert.deepEqual(process.argv.slice(2),['--held-update',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),pub=path.join(root,'production-publisher'),dir=path.join(pub,'publication-phase3-20261113'),json=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''))
const s=await json(path.join(pub,'settings.json')),before=await json(path.join(dir,'prepared.json'));assert.ok(!s.enabled&&s.formalPublishingEnabled&&s.productionReleaseApproved===false)
const run=promisify(execFile);async function cli(args){try{return await run(process.execPath,[s.supabaseCli,...args,'--project-ref',ref],{windowsHide:true,timeout:180000,maxBuffer:2*1024**2})}catch{throw Error('FORMAL_EDGE_UPDATE_UNKNOWN_STOP')}}
const old=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===fn);assert.equal(old.ezbr_sha256,before.ezbrSha256)
const work=path.join(dir,'edge-update-'+Date.now()),folder=path.join(work,'supabase/functions',fn);await mkdir(folder,{recursive:true})
const {build}=await import(pathToFileURL(path.resolve(path.dirname(s.wranglerCli),'../../esbuild/lib/main.js')).href)
await build({entryPoints:['cloudflare/admin-preview/formal-publication-edge.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['npm:*'],outfile:path.join(folder,'index.ts')})
await writeFile(path.join(work,'supabase/config.toml'),`project_id="jnq-formal-queue-held"\n[functions.${fn}]\nverify_jwt=true\nentrypoint="./functions/${fn}/index.ts"\n`)
await writeFile(path.join(dir,'update-submission-'+old.version+'.json'),JSON.stringify({work,sourceSha256:createHash('sha256').update(await readFile(path.join(folder,'index.ts'))).digest('hex')}),{flag:'wx'})
await cli(['functions','deploy',fn,'--workdir',work,'--use-api','--yes'])
const out=JSON.parse((await cli(['functions','list','--output','json'])).stdout).find(v=>v.slug===fn);assert.ok(out.verify_jwt&&out.version>old.version&&out.status==='ACTIVE')
await writeFile(path.join(dir,'prepared-version-'+old.version+'.json'),JSON.stringify(before),{flag:'wx'})
const result={...before,version:out.version,ezbrSha256:out.ezbr_sha256,sourceSha256:createHash('sha256').update(await readFile(path.join(folder,'index.ts'))).digest('hex')}
await writeFile(path.join(dir,'prepared.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({version:out.version,queue:true,execution:false}))
