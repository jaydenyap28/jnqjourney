// GET-only, credential-free, explicit public projection. Never edits frozen snapshots.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { evaluateSpotQuality } from '../lib/spot-quality.ts'

const origin = 'https://www.jnqjourney.com'
const version = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}(?:-r\d+)?$/.test(version || '')) throw Error('Pass an immutable snapshot version, e.g. 2026-10-30')
const output = path.resolve('public-data/fallback', `${version}.json`)
try { await fs.access(output); throw Error('Version already exists; choose a new version') } catch (e) { if (e.code !== 'ENOENT') throw e }
const startedAt = new Date().toISOString()
const receipts = []
async function get(route) {
  const response = await fetch(origin + route, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(25000), headers: { 'Cache-Control': 'no-cache' } })
  const receipt = { route, status: response.status, source: response.headers.get('x-jnq-data-source'), indexable: response.headers.get('x-jnq-seo-indexable'), date: response.headers.get('date'), age: response.headers.get('age') }
  receipts.push(receipt)
  if (!response.ok) throw Error(`Public source unavailable: ${route} (${response.status})`)
  if (!['supabase', 'cdn-cache'].includes(receipt.source)) throw Error(`Refuse stale/static/unknown source: ${route}`)
  return { data: await response.json(), receipt }
}
const pick = (object, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(object, k)).map(k => [k, object[k]]))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value
const equal = (left,right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))
const regionKeys = ['id','slug','name','country','thumbnail','shortSummary','parentId','code']
const summaryKeys = ['id','slug','name','category','latitude','longitude','thumbnail','shortSummary','visitDate']
const spotKeys = ['id','name','name_cn','category','latitude','longitude','image_url','images','description','review','tags','video_url','facebook_video_url','visit_date','opening_hours','address','region_id','publication_status','seo_title_zh','seo_description_zh','seo_title_en','seo_description_en','experience_zh','experience_en','related_note_slugs']
const priceKeys = ['currency','secondaryCurrency','accommodationBudget','accommodationBudgetSecondary','isFree','admissionLocalAdult','admissionLocalAdultSecondary','admissionLocalChild','admissionLocalChildSecondary','admissionForeignAdult','admissionForeignAdultSecondary','admissionForeignChild','admissionForeignChildSecondary','admissionAdult','admissionAdultSecondary','admissionChild','admissionChildSecondary','mealBudget','mealBudgetSecondary','mealPartySize','parkingBudget','parkingBudgetSecondary','transportBudget','transportBudgetSecondary','infoImages','priceSource','lastCheckedAt','notes']
function publicPrice(raw) {
  let data = raw
  if (typeof raw === 'string') { try { data = JSON.parse(raw) } catch { return raw } }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return { ...pick(data, priceKeys), ...(Array.isArray(data.customItems) ? { customItems: data.customItems.map(item => pick(item, ['label','labelEn','value','valueSecondary','note'])) } : {}) }
}
const inventory = (await get('/api/locations')).data
if (!Array.isArray(inventory.locations) || !inventory.locations.length || !Array.isArray(inventory.regions)) throw Error('Invalid inventory')
const locations = inventory.locations.map(row => ({ ...pick(row, summaryKeys), region: row.region ? pick(row.region, ['id','slug','name','country','code']) : null }))
const ids = new Set(locations.map(x => x.id))
if (ids.size !== locations.length || ids.has(450)) throw Error('Duplicate ID or withdrawn ID 450 in live inventory')
const spots = {}, eligibility = {}
let cursor = 0
async function worker() {
  while (cursor < locations.length) {
    const summary = locations[cursor++]
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(summary.slug)) throw Error('Unsafe public slug')
    const { data, receipt } = await get(`/api/spots/${summary.slug}`)
    const row = data.spot
    if (row?.id !== summary.id || !Object.hasOwn(row, 'publication_status') || ![null, 'published'].includes(row.publication_status)) throw Error(`Unknown/nonpublic publication state: ${summary.id}`)
    if (!['0','1'].includes(receipt.indexable)) throw Error('Missing public indexing qualification')
    const quality = evaluateSpotQuality(row)
    if (quality.indexable !== (receipt.indexable === '1')) throw Error(`Public policy mismatch for ${summary.id}; review before capture`)
    spots[summary.id] = { ...pick(row, spotKeys), slug: summary.slug, price_info: publicPrice(row.price_info),
      regions: row.regions ? pick(row.regions, ['id','name','name_cn','country','description','image_url','parent_id','code']) : null,
      image_metadata: row.image_metadata ? Object.fromEntries(Object.entries(row.image_metadata).map(([url, text]) => [url, pick(text, ['alt_zh','alt_en','caption'])])) : null }
    eligibility[summary.id] = { status: 'active', publication_status: row.publication_status, indexableAtCapture: quality.indexable }
  }
}
await Promise.all([worker(), worker(), worker()])
// A second inventory prevents publishing a partial capture during collection edits.
const after = (await get('/api/locations')).data.locations
if (JSON.stringify(after.map(x => [x.id,x.slug]).sort()) !== JSON.stringify(locations.map(x => [x.id,x.slug]).sort())) throw Error('Public identities changed during capture; retry as a new version')
const bundle = { schemaVersion: 1, version, source: { type: 'public-api-get-only', origin, generatedAt: new Date().toISOString(), startedAt }, withdrawnIds: [450], locations, regions: inventory.regions.map(row => pick(row, regionKeys)), spots, eligibility }
const serialized = JSON.stringify(bundle)
if (/(?:service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|"access_token"|"refresh_token")/.test(serialized)) throw Error('Unexpected sensitive content')
const legacy = JSON.parse(await fs.readFile('public-data/locations.json','utf8')).locations
const old = new Map(legacy.map(x => [x.id,x]))
const diff = { version, source: bundle.source, beforeCount: old.size, afterCount: locations.length,
  added: locations.filter(x => !old.has(x.id)).map(x => ({id:x.id,name:x.name,slug:x.slug})),
  removed: legacy.filter(x => !ids.has(x.id)).map(x => ({id:x.id,name:x.name})),
  changed: locations.filter(x => old.has(x.id) && !equal(old.get(x.id),x)).map(x => ({id:x.id,fields: [...new Set([...Object.keys(old.get(x.id)),...Object.keys(x)])].filter(k => !equal(old.get(x.id)[k],x[k]))})),
  noindexIds: Object.entries(eligibility).filter(([,x]) => !x.indexableAtCapture).map(([id]) => Number(id)),
  bytes: Buffer.byteLength(serialized), sha256: createHash('sha256').update(serialized+'\n').digest('hex'), receipts }
await fs.mkdir(path.dirname(output),{recursive:true})
await fs.mkdir('artifacts/spot-travel-upgrade',{recursive:true})
await fs.writeFile('artifacts/spot-travel-upgrade/fallback-diff.json',JSON.stringify(diff,null,2))
await fs.writeFile(output,serialized+'\n',{flag:'wx'})
console.log(JSON.stringify({version,spots:Object.keys(spots).length,noindex:diff.noindexIds.length,added:diff.added.length,removed:diff.removed.length,bytes:diff.bytes}))
