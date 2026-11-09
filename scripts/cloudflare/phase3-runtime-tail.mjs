// Never retain raw tail events: headers/cookies/body/log messages are dropped.
import {spawn} from 'node:child_process'
import {readFile,rename,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {PROJECT} from './candidate-cloudflare.mjs'
const compatibility=process.argv.includes('--compatibility')
const galleryCpu=process.argv.includes('--gallery-cpu')
const registry=process.argv.includes('--registry')
const deployment=JSON.parse(await readFile(registry?'artifacts/cloudflare-registry-native/deployment.json':galleryCpu?'artifacts/cloudflare-gallery-cpu/deployment.json':compatibility?'artifacts/cloudflare-compatibility-native/deployment.json':process.argv.includes('--direct-upload')?'artifacts/cloudflare-upload-fix/deployment.json':'artifacts/cloudflare-phase3/deployment.json','utf8'))
if(deployment.environment!=='preview'||!deployment.success)throw new Error('VERIFIED_PREVIEW_REQUIRED')
const resume=process.argv.includes('--resume-security')
if(resume&&!process.argv.includes('--direct-upload'))throw new Error('DIRECT_PREVIEW_REQUIRED')
const output=registry?'artifacts/cloudflare-registry-native/runtime-events.json':galleryCpu?'artifacts/cloudflare-gallery-cpu/runtime-events.json':compatibility?'artifacts/cloudflare-compatibility-native/runtime-events.json':resume?'artifacts/cloudflare-upload-fix/direct-resume-runtime-events.json':process.argv.includes('--direct-upload')?'artifacts/cloudflare-upload-fix/direct-runtime-events.json':process.argv.includes('--upload-fix')?'artifacts/cloudflare-upload-fix/runtime-events.json':'artifacts/cloudflare-phase3/runtime-events.json'
const diagnostics={parsedFrames:0,parseErrors:0,unmatchedRequests:0,truncatedEvents:0,warningFrames:0,stderrWarnings:0,closed:false,incompleteFrame:false}
const records=[];let started=false,depth=0,quoted=false,escaped=false,current='',seenKeys=false
const snapshot=()=>JSON.stringify({deploymentId:deployment.deploymentId,count:records.length,diagnostics,events:records},null,2)
if(resume||compatibility||galleryCpu||registry)await writeFile(output,snapshot(),{flag:'wx'})
const args=[process.env.JNQ_WRANGLER_CLI,'pages','deployment','tail',deployment.deploymentId,'--project-name',PROJECT,'--environment','preview','--format','json']
if(resume||compatibility||galleryCpu||registry)args.push('--header','X-JnQ-Acceptance')
const child=spawn(process.execPath,args,{cwd:path.resolve('artifacts/cloudflare-spot-loop'),windowsHide:true,stdio:['ignore','pipe','pipe']})
let write=Promise.resolve()
function save(){
  const data=snapshot(),temporary=`${output}.${process.pid}.tmp`
  write=write.then(async()=>{
    await writeFile(temporary,data)
    await rename(temporary,output)
  }).catch(()=>{
    console.error('Native Tail snapshot write failed.')
    process.exitCode=1
  })
}
function event(payload){
  diagnostics.parsedFrames++
  if(!payload.event&&!payload.outcome){diagnostics.warningFrames++;return}
  if(!seenKeys){seenKeys=true;console.log(JSON.stringify({eventFieldNames:Object.keys(payload)}))}
  const request=payload.event?.request
  let pathname=null
  try {pathname=new URL(request.url).pathname}catch{}
  const numeric={}
  function metrics(obj,prefix='',level=0){if(!obj||typeof obj!=='object'||level>2)return;for(const [key,value] of Object.entries(obj)){if(/cpu|wall.?time|duration/i.test(key)&&typeof value==='number')numeric[`${prefix}${key}`]=value;else if(['metrics','timings'].includes(key))metrics(value,`${key}.`,level+1)}}
  metrics(payload)
  const marker=Object.entries(request?.headers||{}).find(([name])=>name.toLowerCase()==='x-jnq-acceptance')?.[1]
  if(request&&!marker)diagnostics.unmatchedRequests++
  if(payload.truncated)diagnostics.truncatedEvents++
  let operations
  if(registry)for(const log of payload.logs||[]){
    for(const message of log.message||[])if(typeof message==='string'){
      try{
        const data=JSON.parse(message)
        if(data.type==='jnq-registry-native-operations'&&data.acceptanceId===marker){
          const valid=value=>Number.isSafeInteger(value)&&value>=0
          if(['list','get','head','put','delete'].every(key=>valid(data.r2?.[key]))&&['supabaseRpc','supabaseRead','auth','copy'].every(key=>valid(data[key])))
            operations={r2:data.r2,supabaseRpc:data.supabaseRpc,supabaseRead:data.supabaseRead,auth:data.auth,copy:data.copy}
        }
      }catch{}
    }
  }
  records.push({timestamp:payload.eventTimestamp||null,path:pathname,method:request?.method||null,outcome:payload.outcome||null,status:payload.event?.response?.status||null,...(typeof marker==='string'&&/^[0-9-]+$/.test(marker)?{acceptanceId:marker}:{}),...numeric,...(operations?{operations}:{})})
  console.log(JSON.stringify(records.at(-1)))
}
child.stdout.setEncoding('utf8').on('data',chunk=>{
  for(const char of chunk){
    if(!started){if(char!=='{')continue;started=true;depth=1;current='{';quoted=false;escaped=false;continue}
    current+=char
    if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue}
    if(char==='"'){quoted=true;continue}
    if(char==='{')depth++;else if(char==='}')depth--
    if(depth===0){
      try{event(JSON.parse(current))}catch{diagnostics.parseErrors++}
      started=false;current='';save()
    }
  }
})
child.stderr.on('data',chunk=>{if(/error|warn|sampl/i.test(chunk.toString())){diagnostics.stderrWarnings++;save()}})
child.on('error',()=>{diagnostics.stderrWarnings++;process.exitCode=1})
process.on('SIGINT',()=>{child.kill()})
child.on('close',async(code,signal)=>{
  Object.assign(diagnostics,{closed:true,exitCode:code,exitSignal:signal,incompleteFrame:started})
  save();await write
  console.log(JSON.stringify({tailExited:code,recordCount:records.length,diagnostics}))
})
console.log('Starting native Preview tail; only request paths/status and numeric timing metrics are retained.')
