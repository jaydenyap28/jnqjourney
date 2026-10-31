import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { result, summarize, runHttpSmoke } from './lib/release-smoke.mjs'

const values={}
for(let i=2;i<process.argv.length;i+=2) {
  const key=process.argv[i]
  if(!['--base-url','--environment','--routes','--output'].includes(key)||!process.argv[i+1]) throw Error('Usage: npm run release:check -- [--base-url https://origin --environment preview|production|local] [--routes file.json] [--output artifacts/new-file.json]')
  values[key]=process.argv[i+1]
}
const git=(...args)=>spawnSync('git',args,{encoding:'utf8',windowsHide:true})
const policy=JSON.parse(await fs.readFile('docs/release-readiness.manifest.json','utf8'))
const head=git('rev-parse','HEAD').stdout.trim()
const checks=[]
for(const ref of policy.requiredAncestors) checks.push(result(`ancestor:${ref}`,git('merge-base','--is-ancestor',ref,'HEAD').status===0?'PASS':'FAIL','LOCAL_GIT','Required milestone must be an ancestor; no merging or resetting'))
for(const file of policy.rc12Paths) {
  const inherited=git('cat-file','-e',`f69d446:${file}`).status===0&&git('cat-file','-e',`HEAD:${file}`).status===0
  checks.push(result(`rc12:${file}`,inherited?'PASS':'FAIL','LOCAL_GIT','Original RC1.2 path saved by f69d446 and retained in candidate; later edits are allowed'))
}
checks.push(result('tracked-worktree',git('status','--porcelain','--untracked-files=no').stdout.trim()?'UNVERIFIED':'PASS','LOCAL_GIT','A dirty tracked worktree differs from the recorded candidate commit'))
if(!checks.some(row=>row.status==='FAIL')) {
  // Reuse the existing isolation tests, rather than implement another guard.
  // No dotenv, env export, cloud client, build, npm lifecycle or admin key.
  const tests=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/rc1.5-preview-isolation.test.cjs'],{
    encoding:'utf8',windowsHide:true,timeout:60000,
    env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'test'},
  })
  checks.push(result('preview-isolation-existing-tests',tests.status===0?'PASS':'FAIL','LOCAL_SYNTHETIC',`Existing isolation suite; pass=${tests.stdout?.match(/# pass (\d+)/)?.[1]||0}. This is not cloud verification.`))
  const runtimeFiles=git('ls-files','app','components','lib','pages').stdout.trim().split(/\r?\n/).filter(file=>/\.(ts|tsx|mjs|cjs)$/.test(file))
  const hits=[]
  for(const file of runtimeFiles) {
    const source=await fs.readFile(file,'utf8')
    for(const table of policy.backupTables) if(source.includes(table)) hits.push({file,table})
  }
  checks.push(result('backup-runtime-references',hits.length?'FAIL':'PASS','LOCAL_SOURCE',{literalReferences:hits,limitation:'Does not prove dynamic SQL, external consumers or database permissions safe'}))
}
for(const id of ['fresh-candidate-build-and-bundle','preview-config-and-readonly-db','backup-rls-change-and-external-dependencies','production-approval-and-rollback-target']) checks.push(result(id,'UNVERIFIED','EXTERNAL_REQUIRED','Requires current independently reviewed environment/permission/deployment evidence; never inferred from fixtures'))
let http
if(values['--base-url']&&!checks.some(row=>row.status==='FAIL')) {
  const routes=JSON.parse(await fs.readFile(values['--routes']||'docs/release-smoke.example.json','utf8'))
  http=await runHttpSmoke({base:values['--base-url'],environment:values['--environment'],manifest:routes})
  checks.push(...http.checks)
} else for(const id of ['home-and-public-routes','spot-http-canonical-robots-sitemap','chinese-english-indexing','guide-note-video','packages-contact','preview-production-http-boundary']) checks.push(result(id,'UNVERIFIED','NO_HTTP_TARGET','No target requested, or local integrity failed; no network request made'))
const report={schemaVersion:1,checkedAt:new Date().toISOString(),candidateCommit:head,...summarize(checks),releaseAuthorized:false,cloudWrites:0,databaseWrites:0,httpTarget:http?.target||null,checks}
const output=path.resolve(values['--output']||`artifacts/release-readiness/check-${Date.now()}.json`)
const relative=path.relative(path.resolve('artifacts'),output)
if(relative.startsWith('..')||path.isAbsolute(relative)) throw Error('Output must be a new file under artifacts/')
await fs.mkdir(path.dirname(output),{recursive:true})
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({candidateCommit:head,status:report.status,counts:report.counts,output,releaseAuthorized:false},null,2))
process.exitCode=report.status==='FAIL'?1:report.status==='UNVERIFIED'?2:0
