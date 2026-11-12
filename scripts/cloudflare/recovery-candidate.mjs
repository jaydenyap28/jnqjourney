// Local-only publication fallback. Never handles a browser request or deploys Production.
import assert from 'node:assert/strict'
import {open,mkdir,readFile,writeFile,unlink} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {RECOVERY_BASE,fingerprint} from './recovery-sources.mjs'
import {readFinalMediaPlan} from './recovery-media-staging.mjs'
import {budgetBlockedUntil,publicationBudget} from './publication-budget.mjs'

const deploy=process.argv.includes('--deploy-preview')
const finalMedia=process.argv.includes('--final-media')
assert.ok(process.argv.slice(2).every(arg=>['--deploy-preview','--check','--final-media'].includes(arg)),'UNSUPPORTED_RECOVERY_ARGUMENT')
const media=finalMedia?await readFinalMediaPlan({verifyCache:process.argv.includes('--check')}):null
await mkdir(RECOVERY_BASE,{recursive:true})
const lockFile=path.join(RECOVERY_BASE,'publication.lock'),ledgerFile=path.join(RECOVERY_BASE,'publication-attempts.json')
let ledger=[]
try{ledger=JSON.parse(await readFile(ledgerFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
assert.ok(Array.isArray(ledger),'INVALID_LOCAL_PUBLICATION_LEDGER')
if(process.argv.includes('--check')) {
  console.log(JSON.stringify({mode:'LOCAL_PREVIEW_ONLY',dailyBuildCap:publicationBudget.daily,monthlyBuildCap:publicationBudget.monthly,minimumIntervalMinutes:publicationBudget.spacingMs/60000,automaticAdminPublishing:false,priorAttempts:ledger.length,formalMigration:'HOLD',
    ...(media?{approvedMedia:media.images.size,addedBytes:media.addedBytes,inventorySha256:media.inventorySha256}:{})}))
  process.exit(0)
}
if(deploy)assert.ok(process.env.JNQ_WRANGLER_CLI,'EXISTING_WRANGLER_CLI_PATH_REQUIRED_NO_NPX_DOWNLOAD')
const lock=await open(lockFile,'wx') // Never steal an existing lock, including after a crash.
const id=new Date().toISOString().replace(/[^0-9]/g,'')+'-'+randomUUID().slice(0,8)
const directory=path.join(RECOVERY_BASE,'runs',id)
const env={...process.env,JNQ_RECOVERY_OUTPUT:directory}
if(finalMedia)env.JNQ_RECOVERY_FINAL_MEDIA='1'
else delete env.JNQ_RECOVERY_FINAL_MEDIA
const record={id,startedAt:new Date().toISOString(),status:'CAPTURING',mode:deploy?'preview':'build-only'}
const receipt=path.join(directory,'run-result.json')
let newAttempt=false
try {
  await lock.writeFile(JSON.stringify({id,pid:process.pid,createdAt:record.startedAt}))
  try{ledger=JSON.parse(await readFile(ledgerFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;ledger=[]}
  assert.ok(Array.isArray(ledger),'INVALID_LOCAL_PUBLICATION_LEDGER')
  await mkdir(directory,{recursive:true})
  const step=async(name,args=[])=>{
    record.step=name;await writeFile(receipt,JSON.stringify(record,null,2))
    const log=await open(path.join(directory,name+'.log'),'w')
    try {
      await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,[path.resolve('scripts/cloudflare/'+name+'.mjs'),...args],{env,windowsHide:true,stdio:['ignore',log.fd,log.fd]})
        child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('RECOVERY_STEP_FAILED_'+name+'_'+code)))
      })
    }finally{await log.close()}
  }
  await step('recovery-sources')
  const sources=JSON.parse(await readFile(path.join(directory,'source-manifest.json'),'utf8'))
  const contentFiles={...sources.files}
  // Capture timestamps must not force a rebuild of otherwise unchanged content.
  const database=JSON.parse(await readFile(path.join(directory,'sources/database.json'),'utf8'))
  delete database.capturedAt
  contentFiles['database.json']={sha256:fingerprint(database)}
  const {execFileSync}=await import('node:child_process')
  const codeCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
  const inputs=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(file=>/^(app\/|pages\/|components\/|lib\/|data\/|public\/|public-data\/|types\/|cloudflare\/spot-loop\/|scripts\/cloudflare\/|(?:package(?:-lock)?\.json|tsconfig\.json|postcss\.config\.mjs)$)/.test(file))
  const codeFiles=[]
  for(const file of inputs)codeFiles.push([file,fingerprint((await readFile(file)).toString('base64'))])
  // Include uncommitted input changes: HEAD alone is not a build identity.
  record.contentFingerprint=fingerprint({contentFiles,codeCommit,codeFiles,...(media?{mediaApproval:media.approval}:{})})
  const previous=ledger.findLast(item=>item.contentFingerprint===record.contentFingerprint&&item.status===(deploy?'PREVIEW_DEPLOYED':'STATIC_VERIFIED'))
  if(previous){record.status='COALESCED_UNCHANGED';record.previousRun=previous.id}
  else {
    const blocked=budgetBlockedUntil(ledger)
    assert.ok(!blocked,'LOCAL_BUILD_BUDGET_BLOCKED_UNTIL_'+blocked)
    record.startedAt=new Date().toISOString();record.status='BUILDING';ledger.push(record);newAttempt=true
    await writeFile(ledgerFile,JSON.stringify(ledger,null,2)) // Failed builds consume the budget too.
    for(const name of ['prepare-static-candidate','build-candidate','package-candidate','verify-static-candidate'])await step(name,['--recovery'])
    await step('recovery-links-check')
    await step('recovery-media-inventory')
    if(finalMedia)await step('recovery-media-release-gate',['--verify-package'])
    record.status='STATIC_VERIFIED'
    if(deploy){await step('recovery-sources',['--verify-capture']);await step('recovery-deploy');record.status='PREVIEW_DEPLOYED';record.preview=JSON.parse(await readFile(path.join(directory,'deployment.json'),'utf8')).url}
  }
}catch(error){record.status='FAILED_REVIEW_BEFORE_RETRY';record.failure=error.message;process.exitCode=1}
finally {
  record.finishedAt=new Date().toISOString()
  await writeFile(receipt,JSON.stringify(record,null,2))
  if(newAttempt)await writeFile(ledgerFile,JSON.stringify(ledger,null,2))
  await lock.close();await unlink(lockFile)
}
console.log(JSON.stringify(record))
