// Real site components in a clean, local-only checkout without .env files.
import assert from 'node:assert/strict'
import {execFileSync,spawn} from 'node:child_process'
import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises'
import path from 'node:path'
import {isolatedKeys,ISOLATED_REF,ISOLATED_ORIGIN} from './isolated-supabase.mjs'
const root=process.cwd(),base=path.join(root,'artifacts/cloudflare-p0-consumers'),source=path.join(base,'site')
const d=JSON.parse(await readFile(path.join(base,'deployment-resumed.json')))
assert.ok(d.success&&Date.now()<d.expiresAt*1000)
await mkdir(source,{recursive:true});assert.deepEqual(await readdir(source),[],'SITE_STAGING_NOT_EMPTY')
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
const additions=['lib/admin-location-read.ts','lib/controlled-media.ts','lib/server/assert-server.ts','lib/server/request-cache.ts','lib/server/consumer-scope.ts','lib/server/public-read-source.ts','lib/server/public-spot-projection.ts','app/public-data/[...path]/route.ts','app/media/[...path]/route.ts','cloudflare/spot-loop/publication-gate.mjs','cloudflare/spot-loop/worker.mjs','cloudflare/spot-loop/spot-contract.mjs','cloudflare/spot-loop/media-identity.mjs','cloudflare/spot-loop/legacy-media-preview.mjs']
for(const file of new Set([...tracked,...additions])){
  if(!/^(app\/|pages\/|components\/|lib\/|data\/|public\/|public-data\/|types\/|cloudflare\/spot-loop\/(?:publication-gate|worker|spot-contract|media-identity|legacy-media-preview)\.mjs|[^/]+\.(?:json|mjs|js|ts|css)$)/.test(file)||/\.bak$|^\.env|^next-env\.d\.ts|^tsconfig\.tsbuildinfo/.test(file))continue
  const destination=path.join(source,file);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(root,file),destination)
}
const keys=await isolatedKeys(),fixture=JSON.parse(await readFile('cloudflare/spot-loop/.dev.vars.spot-loop-session'))
assert.equal(fixture.projectRef,ISOLATED_REF)
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(key)))
Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development',NEXT_PUBLIC_SUPABASE_URL:ISOLATED_ORIGIN,NEXT_PUBLIC_SUPABASE_ANON_KEY:keys.anon,SUPABASE_SERVICE_ROLE_KEY:keys.service,ADMIN_EMAILS:fixture.email,JNQ_PUBLIC_FEED_ORIGIN:d.origin,NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:4401'})
await writeFile(path.join(source,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2017',lib:['dom','dom.iterable','esnext'],allowJs:true,allowImportingTsExtensions:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,isolatedModules:true,jsx:'preserve',plugins:[{name:'next'}],paths:{'@/*':['./*']}},include:['next-env.d.ts','app/**/*.ts','app/**/*.tsx','pages/**/*.tsx','components/**/*.tsx','lib/**/*.ts','types/**/*.ts'],exclude:['node_modules']}))
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','4401'],{cwd:source,env,windowsHide:true,stdio:'inherit'})
await writeFile(path.join(base,'local-site.json'),JSON.stringify({origin:'http://127.0.0.1:4401',pid:child.pid,projectRef:ISOLATED_REF,source,envFilesCopied:0,formalCredentialsPassed:0,serviceKeyInBrowser:false}))
process.on('SIGINT',()=>child.kill());child.on('close',code=>{process.exitCode=code||0})
