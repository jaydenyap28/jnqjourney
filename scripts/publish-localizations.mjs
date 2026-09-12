import fs from 'node:fs/promises'
import { createLocalizationIO, readAuthoritativeLocalization, saveAndPublishLocalization, validateLocalizationSnapshot } from '../lib/server/localization-publisher.mjs'

// Draft import only. Supabase Storage latest remains authoritative; no public snapshot bootstrap.
const snapshot=validateLocalizationSnapshot(JSON.parse(await fs.readFile('public-data/i18n/en/records.json','utf8')))
if(!process.argv.includes('--apply')) {
  console.log(JSON.stringify({mode:'dry-run',version:snapshot.version,records:snapshot.records.length}))
} else {
  const io=createLocalizationIO()
  const current=await readAuthoritativeLocalization(io)
  const explicit=process.argv.find(arg=>arg.startsWith('--expected-revision='))?.split('=')[1]
  if(!explicit && snapshot.version!==current.snapshot.version) throw Error('Draft differs from authoritative version; supply reviewed --expected-revision before publishing')
  const result=await saveAndPublishLocalization(io,explicit||current.revision,()=>snapshot)
  const receipt={mode:'apply',version:result.version,sha256:result.revision,records:result.snapshot.records.length,immutable:`_system/i18n/en/${result.version}.webp`,pointer:'_system/i18n/en/latest.webp',publicKey:'public-data/i18n/en/records.json',immutablePublic:`public-data/i18n/en/versions/${result.version}.json`,authoritativeReadBack:'PASS',publicReadBack:'PASS'}
  await fs.mkdir('artifacts/bilingual-v1',{recursive:true})
  await fs.writeFile('artifacts/bilingual-v1/publication-receipt.json',JSON.stringify(receipt,null,2))
  console.log(JSON.stringify(receipt))
}
