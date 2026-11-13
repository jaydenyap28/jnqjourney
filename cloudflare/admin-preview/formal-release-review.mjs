import { FormalError } from './formal-runtime.mjs'
import { formalDigest, verifyFormalJob, projectFormalPublicSpot } from './formal-publication.mjs'
import { publishedSpot } from '../spot-loop/spot-contract.mjs'

const revokedTestImage = 'f9dce8bd73884fd12f1dedaff14302fd1415fc8358da672937b8b5d8eeeb8f98'
export function assertFormalFixtureExclusion(payload, targets) {
  if (!Array.isArray(targets) || !['spot','note','guide'].every(kind => targets.some(row=>row.kind===kind))) {
    throw new FormalError(503, 'FORMAL_PRIVATE_FIXTURE_BOUNDARY_UNKNOWN')
  }
  const lists = {spot:payload.feeds['database.json'].locations,note:payload.feeds['notes.json'].notes,guide:payload.feeds['guides.json'].guides}
  if (lists.spot.some(row=>row.id===853) || targets.some(target=>lists[target.kind]?.some(row=>String(target.kind==='spot'?row.id:row.slug)===String(target.target))) ||
      JSON.stringify(payload.feeds).includes(revokedTestImage)) throw new FormalError(409, 'FORMAL_PRIVATE_TEST_CONTENT_EXCLUDED')
}

export async function formalReleaseReview({job,current,baseline,targets}) {
  await verifyFormalJob(job,current,baseline.revision)
  assertFormalFixtureExclusion(job.payload,targets)
  const fields={spot:['database.json','locations','id'],note:['notes.json','notes','slug'],guide:['guides.json','guides','slug']}
  const changes={added:[],modified:[],hidden:[]}, expected={}
  for(const [kind,[file,field,id]] of Object.entries(fields)) {
    const before=new Map(baseline.feeds[file][field].map(row=>[String(row[id]),row])),after=job.payload.feeds[file][field]
    expected[kind]=after.length
    for(const row of after) {
      const key=String(row[id]),old=before.get(key)
      const item={kind,key,title:row.name_cn||row.name||row.title}
      if(!old)changes.added.push(item)
      else if(await formalDigest(kind==='spot'?projectFormalPublicSpot(row):row)!==await formalDigest(kind==='spot'?projectFormalPublicSpot(old):old))changes.modified.push(item)
      before.delete(key)
    }
    for(const [key,row]of before)changes.hidden.push({kind,key,title:row.name_cn||row.name||row.title})
  }
  const visible=(kind,row)=>kind==='spot'?row.id!==450&&publishedSpot(row):kind==='note'?row.published===true:row.published!==false&&[null,undefined,'published'].includes(row.publication_status)
  const rollbackWithdrawals=[]
  for(const [kind,[file,field,id]]of Object.entries(fields)) {
    const now=new Map(current[file][field].map(row=>[String(row[id]),row]))
    for(const row of baseline.feeds[file][field])if(!now.has(String(row[id]))||!visible(kind,now.get(String(row[id]))))rollbackWithdrawals.push({kind,key:String(row[id])})
  }
  return {jobId:job.id,contentFingerprint:await formalDigest(job.payload),authorityFingerprint:job.payload.authorityRevision,
    baselineRevision:job.payload.baselineRevision,requestedAt:job.requestedAt,changes,expectedPublicContent:expected,
    newMedia:job.payload.media.filter(name=>!baseline.media?.[name]),retainedControlledMedia:job.payload.media.filter(name=>baseline.media?.[name]),
    fixtureExclusion:'PASS',rollback:{baselineEligible:rollbackWithdrawals.length===0,withdrawals:rollbackWithdrawals,requiresFreshCheck:true},
    productionSubmitted:false,queueClaimed:false}
}
