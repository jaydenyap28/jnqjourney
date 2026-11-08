// Never retain raw tail events: headers/cookies/body/log messages are dropped.
import {spawn} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {PROJECT} from './candidate-cloudflare.mjs'
const deployment=JSON.parse(await readFile(process.argv.includes('--direct-upload')?'artifacts/cloudflare-upload-fix/deployment.json':'artifacts/cloudflare-phase3/deployment.json','utf8'))
if(deployment.environment!=='preview'||!deployment.success)throw new Error('VERIFIED_PREVIEW_REQUIRED')
const child=spawn(process.execPath,[process.env.JNQ_WRANGLER_CLI,'pages','deployment','tail',deployment.deploymentId,'--project-name',PROJECT,'--environment','preview','--format','json'],{cwd:path.resolve('artifacts/cloudflare-spot-loop'),windowsHide:true,stdio:['ignore','pipe','pipe']})
const records=[];let buffer='',started=false,depth=0,quoted=false,escaped=false,current='',seenKeys=false
const output=process.argv.includes('--direct-upload')?'artifacts/cloudflare-upload-fix/direct-runtime-events.json':process.argv.includes('--upload-fix')?'artifacts/cloudflare-upload-fix/runtime-events.json':'artifacts/cloudflare-phase3/runtime-events.json'
let write=Promise.resolve()
function save(){const data=JSON.stringify({deploymentId:deployment.deploymentId,count:records.length,events:records},null,2);write=write.then(()=>writeFile(output,data))}
function event(payload){
  if(!payload.event&&!payload.outcome)return
  if(!seenKeys){seenKeys=true;console.log(JSON.stringify({eventFieldNames:Object.keys(payload)}))}
  const request=payload.event?.request
  let pathname=null
  try {pathname=new URL(request.url).pathname}catch{}
  const numeric={}
  function metrics(obj,prefix='',level=0){if(!obj||typeof obj!=='object'||level>2)return;for(const [key,value] of Object.entries(obj)){if(/cpu|wall.?time|duration/i.test(key)&&typeof value==='number')numeric[`${prefix}${key}`]=value;else if(['metrics','timings'].includes(key))metrics(value,`${key}.`,level+1)}}
  metrics(payload)
  const marker=request?.headers?.['x-jnq-acceptance']||request?.headers?.['X-Jnq-Acceptance']||request?.headers?.['X-JnQ-Acceptance']
  records.push({timestamp:payload.eventTimestamp||null,path:pathname,method:request?.method||null,outcome:payload.outcome||null,status:payload.event?.response?.status||null,...(typeof marker==='string'&&/^[0-9-]+$/.test(marker)?{acceptanceId:marker}:{}),...numeric})
  save()
  console.log(JSON.stringify(records.at(-1)))
}
child.stdout.on('data',chunk=>{
  buffer=chunk.toString()
  for(const char of buffer){
    if(!started){if(char!=='{')continue;started=true;depth=1;current='{';quoted=false;escaped=false;continue}
    current+=char
    if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue}
    if(char==='"'){quoted=true;continue}
    if(char==='{')depth++;else if(char==='}')depth--
    if(depth===0){try{event(JSON.parse(current))}catch{};started=false;current=''}
  }
})
child.stderr.on('data',chunk=>{const text=chunk.toString();if(/ERROR|Error|error/.test(text))console.log('Native Preview tail reported an error; raw diagnostic omitted to avoid credential leakage.')})
process.on('SIGINT',()=>{child.kill();save();write.finally(()=>process.exit())})
child.on('exit',code=>{save();console.log(JSON.stringify({tailExited:code,recordCount:records.length}))})
console.log('Starting native Preview tail; only request paths/status and numeric timing metrics are retained.')
