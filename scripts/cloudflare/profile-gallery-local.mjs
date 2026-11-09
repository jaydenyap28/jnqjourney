// Local CPU only. Not a Cloudflare CPU measurement or quota verdict.
import {writeFile,mkdir} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import {execFileSync} from 'node:child_process'
import {fixture} from '../../tests/helpers/cloudflare-spot-fixture.mjs'
import {validateSpotFields} from '../../cloudflare/spot-loop/spot-contract.mjs'
const report={measuredAt:new Date().toISOString(),environment:'Local Node synthetic R2; excludes Cloudflare binding/runtime overhead',wholeRequestCpuCaveat:'Windows process.cpuUsage has coarse accounting: raw 0/16ms deltas are not a precise CPU cost for one short request. Only batched 20000-iteration pure-JS averages are useful here; none are native CPU.',samples:[]}
let workerFactory
if(!process.argv.includes('--after')){
  const source=execFileSync('git',['show','f584cd4:cloudflare/spot-loop/worker.mjs'],{encoding:'utf8',windowsHide:true}).replace("'./spot-contract.mjs'",JSON.stringify(new URL('../../cloudflare/spot-loop/spot-contract.mjs',import.meta.url).href))
  workerFactory=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).createWorker
}
function measure(fn,count=20000){const start=process.cpuUsage();for(let i=0;i<count;i++)fn();const cpu=process.cpuUsage(start);return (cpu.user+cpu.system)/1000/count}
for(const count of [1,5,17,30]){
  const f=fixture({workerFactory}),images=await f.seedMedia(count)
  const data={image_url:images[0],images,image_metadata:Object.fromEntries(images.map(p=>[p,{alt_zh:'合成',alt_en:'Synthetic',caption:'Caption'}]))}
  const body=JSON.stringify({expectedUpdatedAt:f.rows.get('1').updated_at,data})
  const receipts=images.map(p=>f.objects.get('_candidate-validation/'+p.slice('/media/candidate/'.length)+'.json').bytes.toString())
  const baseline=f.reads(),cpu=process.cpuUsage(),start=performance.now();const response=await f.save(data);await response.arrayBuffer();const used=process.cpuUsage(cpu)
  report.samples.push({images:count,distinctMedia:count,r2Reads:f.reads()-baseline,httpStatus:response.status,rawProcessCpuDeltaMs:(used.user+used.system)/1000,localWholeRequestWallMs:performance.now()-start,localFieldValidationCpuMs:measure(()=>validateSpotFields(data)),localReceiptParseCpuMs:measure(()=>receipts.map(r=>JSON.parse(r))),localRequestParseCpuMs:measure(()=>JSON.parse(body)),localPatchSerializeCpuMs:measure(()=>JSON.stringify({...data,updated_at:'2026-11-09T00:00:00Z'}))})
}
await mkdir('artifacts/cloudflare-gallery-cpu',{recursive:true})
const label=process.argv.includes('--after')?'after':'before'
await writeFile(`artifacts/cloudflare-gallery-cpu/local-profile-${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
