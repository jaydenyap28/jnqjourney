// Real Chrome acceptance for the existing isolated Preview. Never persist
// cookies, credentials, signed URLs, or browser exception text.
import {readFile,writeFile} from 'node:fs/promises'
import {makePng} from './upload-fix-images.mjs'

const root='artifacts/cloudflare-upload-fix/'
const readJson=async file=>JSON.parse(await readFile(file,'utf8'))
const deployment=await readJson(root+'deployment.json')
const boundary=await readJson(root+'boundaries.json')
const resumed=await readJson(root+'direct-resume-acceptance.json')
const fixture=await readJson('cloudflare/spot-loop/.dev.vars.spot-loop-session')
const tailFile=root+'direct-resume-runtime-events.json'
const tail=await readJson(tailFile)
const origin='https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev'
const s3Host='41feff7cd62964f2eb33bb82508509a1.r2.cloudflarestorage.com'
const s3Prefix='/jnqjourney-spot-loop-isolated-media/_candidate-staging/1/'
if(!deployment.success||deployment.environment!=='preview'||!boundary.boundariesPassed||!boundary.directUploadCredentialsReady||!resumed.securityPassed||resumed.error||resumed.deploymentId!==deployment.deploymentId||tail.deploymentId!==deployment.deploymentId||tail.diagnostics?.closed!==false||fixture.projectRef!=='rnamstwwbzknwbjwdgrf'||fixture.spotId!==1)throw new Error('BROWSER_SECURITY_GATE_REQUIRED')
const publicPath=resumed.fixtureAtResume.publicPath
if(!/^\/spot\/cloudflare-loop-[a-z0-9-]+-1$/.test(publicPath))throw new Error('ISOLATED_FIXTURE_REQUIRED')

const output=root+'direct-browser-acceptance.json'
const report={url:origin,deploymentId:deployment.deploymentId,workerSha256:deployment.workerSha256,steps:[],checks:[],r2:[],browserErrors:0,hold:true}
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'})
let browser,queue=Promise.resolve(),halt,signalHalt,stage='open'
const halted=new Promise(resolve=>{signalHalt=resolve})
const save=()=>writeFile(output,JSON.stringify(report,null,2))
function stop(code){if(!halt){halt=code;signalHalt()}}
function ensure(condition,code){if(!condition)throw new Error(code)}

async function measure(request,check){
  const responseReady=request.response().then(response=>{if(response)check.status=response.status();return response})
  const deadline=Date.now()+25000
  while(Date.now()<deadline){
    const snapshot=await readJson(tailFile)
    const trace=snapshot.deploymentId===deployment.deploymentId&&snapshot.events.find(event=>event.acceptanceId===check.acceptanceId)
    if(trace){
      const response=await responseReady
      const redactedPath=check.path.replace(/^(\/media\/candidate\/1\/)[a-f0-9-]+(\.[a-z]+)$/,'$1REDACTED$2')
      ensure(response&&trace.method===check.method&&(trace.path===check.path||trace.path===redactedPath)&&trace.status===response.status(),'BROWSER_TRACE_MISMATCH')
      Object.assign(check,{status:trace.status,cpuTimeMs:trace.cpuTime,outcome:trace.outcome})
      ensure(typeof trace.cpuTime==='number','NATIVE_CPU_NOT_OBSERVED')
      ensure(trace.cpuTime<=10&&trace.outcome!=='exceededResources','DIRECT_CPU_BUDGET_EXCEEDED')
      return
    }
    if(snapshot.diagnostics?.closed)break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  throw new Error('NATIVE_CPU_NOT_OBSERVED')
}

async function instrument(context){
  await context.route(url=>url.origin===origin&&/^\/(?:api|spot|en\/spot|media\/candidate|_next\/data)\//.test(url.pathname),async route=>{
    queue=queue.then(async()=>{
      if(halt){await route.abort();return}
      const request=route.request()
      const acceptanceId=`${Date.now()}-${1000+report.checks.length}`
      const check={stage,acceptanceId,path:new URL(request.url()).pathname,method:request.method()}
      report.checks.push(check)
      await route.continue({headers:{...await request.allHeaders(),'x-jnq-acceptance':acceptanceId}})
      await measure(request,check)
    }).catch(error=>stop(/^[A-Z_]+$/.test(error.message)?error.message:'BROWSER_REQUEST_FAILED'))
    await queue
  })
}

async function step(name,action){
  stage=name
  await Promise.race([action(),halted])
  await Promise.race([queue,halted])
  ensure(!halt,halt)
  report.steps.push(name)
  await save()
}

try{
  const {chromium}=await import(`../../${root}browser-tools/node_modules/playwright-core/index.mjs`)
  browser=await chromium.launch({executablePath:process.env.JNQ_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
  report.browserVersion=browser.version()
  const admin=await browser.newContext(),anonymous=await browser.newContext()
  await instrument(admin);await instrument(anonymous)
  const page=await admin.newPage(),publicPage=await anonymous.newPage()
  for(const current of [page,publicPage]){
    current.setDefaultTimeout(30000)
    current.on('pageerror',()=>{report.browserErrors++})
  }
  page.on('response',response=>{
    const url=new URL(response.url()),method=response.request().method()
    if(url.hostname===s3Host&&url.pathname.startsWith(s3Prefix)&&['OPTIONS','PUT'].includes(method)){
      report.r2.push({method,status:response.status(),corsOriginMatches:response.headers()['access-control-allow-origin']===origin})
    }
  })
  const waitStatus=text=>page.waitForFunction(expected=>document.querySelector('#status').textContent.includes(expected),text)
  let originalName,imagePath
  const testName=`浏览器发布验收 ${Date.now()}`
  const png=makePng(128*1024,187)
  report.image={bytes:png.bytes.length,sha256:png.sha256}
  await step('open',async()=>{
    await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/candidate/session'&&response.status()===401),
      page.goto(`${origin}/admin/cloudflare-spot`),
    ])
    await page.locator('#login').waitFor({state:'visible'})
  })
  await step('login',async()=>{
    await page.locator('#login input[name=email]').fill(fixture.email)
    await page.locator('#login input[name=password]').fill(fixture.password)
    await page.locator('#login button').click()
    await waitStatus('已读取版本')
    ensure(await page.locator('#fixture').inputValue()==='1','BROWSER_FIXTURE_MISMATCH')
    originalName=await page.locator('[name=name_cn]').inputValue()
    await page.waitForFunction(()=>document.querySelector('#image').naturalWidth>0)
  })
  await step('missing_file_feedback',async()=>{await page.locator('#upload').click();await waitStatus('请选择照片')})
  await step('browser_upload',async()=>{
    await page.locator('#photo').setInputFiles({name:'isolated-browser-fixture.png',mimeType:'image/png',buffer:png.bytes})
    await page.locator('#upload').click()
    await page.waitForFunction(()=>document.querySelector('#photo-state').textContent.includes('已上传到测试 R2'))
    await page.waitForFunction(()=>document.querySelector('#image').complete&&document.querySelector('#image').naturalWidth>0)
    imagePath=await page.locator('#image').getAttribute('src')
    ensure(/^\/media\/candidate\/1\/[a-f0-9-]+\.png$/.test(imagePath)&&imagePath!==resumed.fixtureAtResume.mediaPath,'BROWSER_UPLOAD_PATH_MISMATCH')
    ensure(report.r2.some(check=>check.method==='PUT'&&check.status===200&&check.corsOriginMatches),'BROWSER_CORS_NOT_VERIFIED')
  })
  async function saveSpot(publication,text){
    await page.locator('[name=publication_status]').selectOption(publication)
    await page.locator('#save button[type=submit],#save button:not([type])').click()
    await waitStatus(text)
  }
  await step('save',async()=>{await page.locator('[name=name_cn]').fill(testName);await saveSpot('published','保存成功')})
  await step('anonymous_read',async()=>{
    const response=await publicPage.goto(origin+publicPath)
    ensure(response.status()===200&&(await publicPage.locator('h1').textContent())===testName,'BROWSER_PUBLIC_READ_FAILED')
    ensure(await publicPage.locator(`img[src="${imagePath}"]`).evaluate(image=>image.complete&&image.naturalWidth>0),'BROWSER_PUBLIC_IMAGE_FAILED')
  })
  await step('withdraw',async()=>{await saveSpot('hidden','已下架')})
  await step('anonymous_protection',async()=>{
    ensure((await publicPage.goto(origin+publicPath)).status()===404,'BROWSER_WITHDRAWN_SPOT_EXPOSED')
    const status=await publicPage.evaluate(async resource=>{const response=await fetch(resource);await response.arrayBuffer();return response.status},imagePath)
    ensure(status===401,'BROWSER_WITHDRAWN_IMAGE_EXPOSED')
  })
  await step('republish',async()=>{
    await page.locator('[name=name_cn]').fill(originalName)
    await saveSpot('published','保存成功')
    ensure((await publicPage.goto(origin+publicPath)).status()===200,'BROWSER_REPUBLISH_FAILED')
  })
  await step('logout',async()=>{
    await page.locator('#logout').click()
    await waitStatus('已退出登录')
    ensure(await page.locator('#login').isVisible(),'BROWSER_LOGOUT_UI_FAILED')
    const status=await page.evaluate(async()=>{const response=await fetch('/api/candidate/session');await response.arrayBuffer();return response.status})
    ensure(status===401,'BROWSER_LOGOUT_SESSION_REMAINS')
  })
  ensure(report.browserErrors===0,'BROWSER_PAGE_ERROR')
  report.hold=false;report.browserPassed=true
}catch(error){
  report.error=halt||(/^[A-Z_]+$/.test(error.message)?error.message:'BROWSER_STEP_FAILED')
  report.failedStage=stage
  process.exitCode=1
}finally{
  await browser?.close()
  report.finishedAt=new Date().toISOString()
  await save()
  console.log(JSON.stringify(report,null,2))
}
