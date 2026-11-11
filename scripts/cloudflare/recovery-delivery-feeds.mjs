import assert from 'node:assert/strict'
import {CDN} from './recovery-sources.mjs'

// Old source bytes and their hashes stay in the capture. A public delivery URL
// points to the current static feed and must not claim the old source hash.
export function localizeLegacyFeedLinks(snapshot, {spotSlugs, guideSlugs, regionIds}) {
  return {...snapshot,records:snapshot.records.map(record=>{
    const old=record.source?.url
    if(typeof old!=='string'||!old.startsWith(CDN+'/public-data/'))return record
    const url=new URL(old)
    assert.ok(!url.search&&!url.hash,'UNREVIEWED_LEGACY_FEED_VARIANT')
    const id=String(record.entityId)
    let target
    if(record.entityType==='guide'&&url.pathname==='/public-data/guides.json'&&guideSlugs.has(id)){
      target=url.pathname
    }else if(record.entityType==='region'&&url.pathname==='/public-data/regions.json'&&regionIds.has(id)){
      target=url.pathname
    }else if(record.entityType==='spot'&&url.pathname.startsWith('/public-data/spots/')&&url.pathname.match(/-(\d+)\.json$/)?.[1]===id&&spotSlugs.has(id)){
      target=`/public-data/spots/${spotSlugs.get(id)}.json`
    }
    assert.ok(target,'UNREVIEWED_LEGACY_FEED_REFERENCE')
    const {contentHash,...source}=record.source
    return {...record,source:{...source,url:target}}
  })}
}
