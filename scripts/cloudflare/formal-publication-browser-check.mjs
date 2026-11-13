import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createClient} from '@supabase/supabase-js'
import {getFormalKey} from './formal-read-source.mjs'
const ref='vrufunuomioczocdsoer',origin='https://read-only.jnqjourney-admin-formal.pages.dev'
assert.deepEqual(process.argv.slice(2),['--held-ui',ref])
const root=path.resolve(process.env.JNQ_RECOVERY_WORKSPACE),pub=path.join(root,'production-publisher'),dir=path.join(pub,'publication-phase3-20261113'),json=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''))
const s=await json(path.join(pub,'settings.json'));assert.ok(!s.enabled&&s.productionReleaseApproved===false);process.env.JNQ_SUPABASE_CLI=s.supabaseCli
const role=await json(path.join(pub,'verified-operator-allowlists.json')),key=(await json('artifacts/cloudflare-static-recovery/.public-read-key.json')).apiKey
const db=createClient(`https://${ref}.supabase.co`,await getFormalKey(),{auth:{persistSession:false}}),client=createClient(`https://${ref}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}})
const {chromium}=await import('../../artifacts/cloudflare-upload-fix/browser-tools/node_modules/playwright-core/index.mjs')
let browser,session;const result={result:'PENDING',publicationPosts:0,blockedMutations:0,pageErrors:0,desktop:false,mobile:false,publishClick:'NOT_EXECUTED_APPROVAL_REVIEW_REJECTED'}
try {
 const u=await db.auth.admin.getUserById(role.publisherAuthIds[0]);assert.ok(!u.error)
 const l=await db.auth.admin.generateLink({type:'magiclink',email:u.data.user.email});assert.ok(!l.error)
 const v=await client.auth.verifyOtp({type:'magiclink',token_hash:l.data.properties.hashed_token});assert.ok(!v.error&&v.data.user.id===role.publisherAuthIds[0]);session=v.data.session
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:960}})
 await context.addInitScript(({ref,session})=>localStorage.setItem('sb-'+ref+'-auth-token',JSON.stringify(session)),{ref,session})
 await context.route('**/functions/v1/jnq-admin-formal/**',async route=>{const r=route.request();if(!['GET','OPTIONS'].includes(r.method())){result.blockedMutations++;return route.fulfill({status:423,contentType:'application/json',body:'{"error":"TEST_NO_MUTATIONS"}'})}return route.continue()})
 const page=await context.newPage();page.on('pageerror',()=>result.pageErrors++);page.on('request',r=>{if(r.url().includes('/publication')&&r.method()==='POST')result.publicationPosts++})
 await page.goto(origin+'/admin',{waitUntil:'domcontentloaded',timeout:45000})
 const state=page.locator('[data-publication-state="held"]');await state.waitFor({state:'attached',timeout:60000})
 await page.getByLabel('网站发布',{exact:true}).click()
 await page.getByRole('button',{name:'准备发布',exact:true}).click()
 await page.getByText('待审批：新增 0 · 修改 0 · 隐藏 0',{exact:true}).waitFor({timeout:60000})
 assert.match(await page.locator('details').filter({has:page.getByLabel('网站发布',{exact:true})}).innerText(),/Production HOLD/)
 const release=page.getByRole('button',{name:'发布网站',exact:true});assert.equal(await release.isDisabled(),true)
 // Read-only check only: no selection, publish click, dialog or POST.
 assert.equal(result.publicationPosts,0);assert.equal(result.blockedMutations,0);result.desktop=true
 await page.setViewportSize({width:390,height:844});assert.ok(await page.getByRole('button',{name:'准备发布',exact:true}).isVisible());result.mobile=true
 await page.screenshot({path:path.join(dir,'publication-ui.private.png'),fullPage:false})
 assert.equal(result.pageErrors,0);result.result='FORMAL_PUBLICATION_HELD_UI_PASS'
}catch(error){result.result='FORMAL_PUBLICATION_HELD_UI_FAIL';result.error=error.name;process.exitCode=1}
finally{if(browser)await browser.close();if(session){const v=await client.auth.signOut({scope:'local'});result.testSessionRevoked=!v.error}await writeFile(path.join(dir,'browser-check.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result))}
