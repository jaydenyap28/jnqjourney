import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
const root='artifacts/cloudflare-static-launch-p0',out='cloudflare/static-recovery/evidence/launch-p0-2026-11-11'
const json=async name=>JSON.parse((await readFile(root+'/'+name,'utf8')).replace(/^\uFEFF/,''))
const [images,browser,platform,media,launch,checks,focused,reachability]=await Promise.all(['image-recheck.json','image-browser.json','platform-readonly.json','media-risk-assessment.json','launch-checks.json','checks.json','checks-focused.json','closed-samples-and-hosts.json'].map(json))
assert.ok(browser.results.every(row=>row.status===200&&row.decoded.width>0))
assert.equal(launch.preserved.functions,0);assert.equal(checks.lintExit,0);assert.equal(focused.focusedTypecheckExit,0)
const freshness=await readFile(root+'/source-freshness.log','utf8')
const fxOnly=freshness.includes('PUBLIC_SOURCE_CHANGED_REBUILD_REQUIRED_fx.json')
assert.ok(fxOnly,'REVIEW_OTHER_AUTHORITY_DRIFT_BEFORE_PUBLISHING_EVIDENCE')
const summary={date:'2026-11-11',timezone:'Asia/Singapore',baseline:'2ce2e88f0ddfa6eaebb4ce702a67806689cbfce3',formalLaunch:'HOLD',policiesApproved:false,
  preserved:launch.preserved,
  images:{confirmed404:images.requests.filter(row=>row.status===404),nodeTimeoutsPreserved:images.requests.filter(row=>row.status==='UNKNOWN'),newChromeEvidence:browser,
    fix:'Exact missing price-info image now renders a truthful unavailable notice in local source; no guessed photo, no source data rewrite.',patchDeployed:false},
  media,platform,seoAndDeployment:launch,reachability,
  freshness:{status:'CONTENT_MATCHED_FX_CHANGED',evidence:'verify-capture sequentially matched database/guides/notes/slugs/English/costs/historical slugs, then stopped at fx.json. No snapshot was overwritten.',fullVerificationExit:1,rebuildRequiredBeforeFormalRelease:true},
  validation:{focusedTests:{passed:4,failed:0,skipped:0,includesActualReactSSR:true},lintExit:checks.lintExit,affectedTypecheckExit:focused.focusedTypecheckExit,rootTypecheckExit:checks.typecheckExit,rootTypecheckIssue:'Root include **/*.ts also includes historical artifact/Deno projects. Kept original diagnostics; not repaired or passed off as a clean global check.',builds:0,deployments:0},
  confidentialEvidence:'Raw nonpublic media URLs remain local under artifacts/cloudflare-static-launch-p0. The report contains hashed identities and owner IDs. No nonpublic image body was fetched.',
  unresolved:['No policy A/B approval','Permanent-public rights/allowlist approval missing','33 R2 objects referenced only by currently ineligible Spots; privacy/revocation is not inferred from business closure','Mixed public r2.dev exposure remains enabled','Old public Preview URLs need a separately approved archive/access policy','Native emergency block and formal rollback have not been deployed or tested','Account quota/AdSense approval UNKNOWN']}
await mkdir(out,{recursive:true})
await writeFile(out+'/summary.json',JSON.stringify(summary,null,2))
for(const name of ['headers.production.draft.txt','robots.production.draft.txt','host-redirect.disabled.draft.json','emergency-waf.disabled.draft.json'])await copyFile(root+'/production-review/'+name,out+'/'+name)
console.log(JSON.stringify({formalLaunch:'HOLD',imagesRecoveredInChrome:browser.results.length,confirmed404:1,publicR2Candidates:media.publicReferencedR2Objects,nonPublicOnlyR2:media.closedOnlyR2Objects,policiesApproved:false,builds:0,deployments:0}))
