import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { isLocalizedTextPath } from '../lib/localization.ts'

// Run with node --env-file=.env.local --experimental-strip-types scripts/publish-localizations.mjs [--apply].
// The default is read-only. Only this new localization namespace is writable.
const body=await fs.readFile('public-data/i18n/en/records.json')
const snapshot=JSON.parse(body)
if(snapshot.schemaVersion!==1 || snapshot.locale!=='en' || !/^[a-zA-Z0-9-]+$/.test(snapshot.version)) throw Error('Invalid localization manifest')
const ids=new Set()
for(const record of snapshot.records) {
  const key=`${record.entityType}:${record.entityId}`
  if(ids.has(key)||record.locale!=='en'||!record.canonicalPath.startsWith('/')||record.canonicalPath.includes('..')) throw Error(`Invalid record ${key}`)
  ids.add(key)
  for(const [path,field] of Object.entries(record.fields)) if(!isLocalizedTextPath(path)||typeof field.source!=='string'||typeof field.text!=='string') throw Error(`Forbidden field ${key}.${path}`)
}
const sha=crypto.createHash('sha256').update(body).digest('hex')
const version=`${snapshot.version}-${sha.slice(0,16)}`
const immutable=`_system/i18n/en/${version}.webp`
const pointer='_system/i18n/en/latest.webp'
const publicKey='public-data/i18n/en/records.json'
const immutablePublic=`public-data/i18n/en/versions/${version}.json`
const receipt={mode:process.argv.includes('--apply')?'apply':'dry-run',version,sha256:sha,bytes:body.length,records:ids.size,immutable,pointer,publicKey,immutablePublic}
console.log(JSON.stringify(receipt,null,2))
if(!process.argv.includes('--apply')) process.exit(0)
const required=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL']
if(required.some(key=>!process.env[key])) throw Error(`Missing configuration: ${required.filter(key=>!process.env[key]).join(', ')}`)
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const bucket=supabase.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'location-images')
const uploaded=await bucket.upload(immutable,body,{upsert:false,contentType:'image/webp',cacheControl:'0'})
if(uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw Error(uploaded.error.message)
const stored=await bucket.download(immutable)
if(stored.error||!stored.data) throw Error('Authoritative localization read-back failed')
if(crypto.createHash('sha256').update(Buffer.from(await stored.data.arrayBuffer())).digest('hex')!==sha) throw Error('Authoritative localization hash mismatch')
const published=await bucket.upload(pointer,Buffer.from(immutable),{upsert:true,contentType:'image/webp',cacheControl:'0'})
if(published.error) throw Error(published.error.message)
const r2=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}})
for(const key of [immutablePublic,publicKey]) await r2.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:key,Body:body,ContentType:'application/json; charset=utf-8',CacheControl:key===publicKey?'public, max-age=3600, stale-while-revalidate=86400':'public, max-age=31536000, immutable'}))
const response=await fetch(`${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${publicKey}?version=${version}`)
if(!response.ok||crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==sha) throw Error('Public localization hash mismatch')
receipt.authoritativeReadBack='PASS';receipt.publicReadBack='PASS'
await fs.mkdir('artifacts/bilingual-v1',{recursive:true})
await fs.writeFile('artifacts/bilingual-v1/publication-receipt.json',JSON.stringify(receipt,null,2))
console.log('Authoritative Storage and public R2 localization hashes verified.')
