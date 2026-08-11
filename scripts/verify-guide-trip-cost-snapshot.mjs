import fs from 'node:fs'
import { createHash } from 'node:crypto'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const index = trimmed.indexOf('=')
  if (index < 1) continue
  const key = trimmed.slice(0, index).trim()
  let value = trimmed.slice(index + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  if (!process.env[key]) process.env[key] = value
}

const base = String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
if (!base) throw new Error('Missing public R2/CDN base URL')
const response = await fetch(`${base}/public-data/guide-trip-costs.json?verify=${Date.now()}`, { cache: 'no-store' })
const body = Buffer.from(await response.arrayBuffer())
if (!response.ok) throw new Error(`Guide Trip Cost snapshot returned ${response.status}`)
const payload = JSON.parse(body.toString('utf8'))
const total = (slug) => payload.tripCosts?.find((record) => record.slug === slug)?.tripCost?.totalCents
console.log(JSON.stringify({
  status: response.status,
  bytes: body.length,
  sha256: createHash('sha256').update(body).digest('hex'),
  records: payload.tripCosts?.length,
  jiangnan: total('china-jiangnan-autumn-15d14n'),
  eastCoast: total('malaysia-east-coast-route3-10d9n'),
  japan: total('japan-hokkaido-yamagata-tokyo-10d9n'),
}, null, 2))
