import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import path from 'node:path'
import {RECOVERY} from './recovery-sources.mjs'
const json=async name=>JSON.parse(await readFile(path.join(RECOVERY,name),'utf8'))
const [verification,deployment,sources,fresh,http,bytes,desktop,mobile,interactions,media,sourceMedia,checks,previousHttp,deltaBrowser,links]=await Promise.all([
  'verification.json','deployment.json','source-manifest.json','source-freshness.json','http-checks.json','byte-checks.json','browser-checks.json.before-link-fix','browser-mobile-checks.json.before-link-fix','browser-interactions.json.before-link-fix','media-availability.json','source-media-inventory.json','checks.json','http-checks.json.before-link-fix','browser-delta-checks.json','link-checks.json',
].map(json))
assert.ok(verification.passed&&deployment.success&&fresh.matched&&http.passed&&bytes.passed&&mobile.passed&&interactions.passed&&previousHttp.passed&&deltaBrowser.passed)
assert.equal(links.unresolved.length,0)
const desktopPages=desktop.pages.filter(page=>page.viewport>=500)
assert.ok(desktopPages.length&&desktopPages.every(page=>page.passed))
assert.equal(checks.lintExit,0);assert.equal(checks.typecheckExit,0)
const pages=[...desktopPages,...mobile.pages]
const originRequests=[...desktop.network.sameOrigin,...mobile.network.sameOrigin]
const report={createdAt:new Date().toISOString(),statuses:{publicStatic:'PUBLIC_STATIC_READY',admin:'ADMIN_PENDING',publication:'PUBLICATION_PENDING',formalMigration:'HOLD'},
  scope:'READY means the full pure-static Preview candidate, not Production cutover or real-time withdrawal.',
  preview:{url:deployment.url,id:deployment.deploymentId,branch:deployment.branch,project:deployment.project,productionDeployments:0,productionCanonicalEmpty:true,secretsAndBindings:0,functions:0,workerUploaded:false},
  content:{capturedAt:sources.capturedAt,authority:sources.authority,counts:sources.counts,latestReadOnlyRecheck:fresh},artifact:verification,
  tests:{lint:checks.lintExit,typecheck:checks.typecheckExit,http:{previousFull:{origin:previousHttp.origin,total:previousHttp.total,pages:previousHttp.pages,redirects:previousHttp.redirects},currentDelta:{origin:http.origin,total:http.total,pages:http.pages,redirects:http.redirects},passed:true},links:{pages:links.pages,unresolved:0},bytes:{checks:bytes.checks.length,passed:true},
    browser:{version:mobile.browserVersion,viewports:[1440,1920,390,430],completedPageVisits:pages.length,uniqueRoutes:new Set(pages.map(page=>page.route)).size,pages:pages.map(({visibleImages,...record})=>record),
      imageEvidence:'Primary-run raw visibility diagnostics are preserved locally but omitted here because the first harness did not filter horizontally offscreen cards. Availability evidence is the separate HEAD inventory and decoded interaction image; final delta visibility diagnostics use corrected viewport bounds.',
      guideSmoke:'All 7 published Guides at 1440 and 390; primary Guide sections at all 4 widths.',
      interactions:[...desktop.interactions.filter(item=>item.viewport>=500),...mobile.interactions,...interactions.checks],
      sameOriginResponses:originRequests.length,sameOriginHttpFailures:originRequests.filter(req=>req.status>=400).length,
      responseCountScope:'The two primary earlier Preview runs, including the initial mobile readiness failure. Follow-up probe total traffic was not fully instrumented; total across all runs UNKNOWN.',
      requestTypes:originRequests.reduce((acc,req)=>(acc[req.type]=(acc[req.type]||0)+1,acc),{}),
      serverRuntimeRequests:mobile.serverRuntimeRequests,hydrationErrors:0,
      preservedHarnessFailures:['Desktop run stopped at first mobile search assertion; mobile initialization wait corrected.',
        'Gallery probe wrongly expected multiple images in a real one-image Guide; original single-image wrap verified.',
        'Follow-up probe blocked mandatory YouTube iframe API and caused Event. Original error retained; restored required resource and bounded follow-up passed.'],
      thirdPartyLimits:'Ad/telemetry and some external video auxiliary resources were blocked. Click-to-load/iframe initialization passed; uninterrupted video playback and ad delivery are not certified.',
      currentDeploymentDelta:{origin:deltaBrowser.origin,passed:deltaBrowser.passed,pages:deltaBrowser.pages,sameOriginResponseCount:deltaBrowser.network.sameOrigin.length,requestTypes:deltaBrowser.network.sameOrigin.reduce((acc,req)=>(acc[req.type]=(acc[req.type]||0)+1,acc),{}),sameOriginFailures:deltaBrowser.sameOriginFailures,serverRuntimeRequests:deltaBrowser.serverRuntimeRequests}}},
  media:{renderedHead:{total:media.total,statuses:media.statuses,not200:media.results.filter(item=>item.status!==200)},sourceReferencedImages:sourceMedia.sourceReferencedImages,
    legacyR2:sourceMedia.legacyR2,sharedAcrossModules:sourceMedia.sharedAcrossModules,identityAndRevocation:'UNVERIFIED_FORMAL_MEDIA',sharedReferences:sourceMedia.assets.filter(item=>new Set(item.owners.map(owner=>owner.split(':')[0])).size>1)},
  publication:{automatic:false,localRunner:'npm run cf:recovery -- --deploy-preview',runnerChecked:'syntax + --check; constituent capture/prepare/build/package/verify/deploy actually passed. Entire new controller was not rerun to avoid a redundant full build.',
    sourceRecheck:true,accountQuota:'UNKNOWN',realtimeRevocation:false},
  unchanged:{productionSupabaseWrites:0,productionR2Writes:0,dnsChanges:0,vercelChanges:0,productionDeploys:0,mainMerges:0,newPaidServices:0},
  formalBlockers:['No user-approved static withdrawal propagation policy; old deployments, downloaded HTML and external media can remain accessible.',
    'jnqjourney-img r2.dev bypass remains public; no production switch was changed.',
    'Production anonymous database bypass not changed; new private admin write/auth/RLS integration remains pending.',
    'Automatic authenticated publication/outbox and emergency withdrawal have not been deployed or accepted.']}
const directory='cloudflare/static-recovery/evidence'
await mkdir(directory,{recursive:true})
await writeFile(path.join(directory,'acceptance-2026-11-11.json'),JSON.stringify(report,null,2))
for(const [from,to] of [['url-inventory.csv','url-inventory-2026-11-11.csv'],['byte-checks.json','bytes-2026-11-11.json']])await copyFile(path.join(RECOVERY,from),path.join(directory,to))
for(const [data,file] of [[http,'http-delta-2026-11-11.json'],[previousHttp,'http-full-before-link-fix-2026-11-11.json']]) {
  const header={...data};delete header.results
  await writeFile(path.join(directory,file),JSON.stringify(header,null,2).slice(0,-2)+',\n  "results": [\n'+data.results.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]\n}\n')
}
console.log(JSON.stringify({statuses:report.statuses,preview:deployment.url,completedPageVisits:pages.length,http:http.total,bytes:bytes.checks.length}))
