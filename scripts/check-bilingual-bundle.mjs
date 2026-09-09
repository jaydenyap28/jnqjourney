import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

// Run after next build. Exercises the actual deployment manifest, not a source regex.
const manifestPath = '.next/server/pages/en/[[...path]].js.nft.json'
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const files = new Set(manifest.files.map(file => path.resolve(path.dirname(manifestPath), file)))
const required = ['data/location-slugs.json', 'data/guides.json', 'public-data/locations.json', 'public-data/regions.json', 'public-data/guide-trip-costs.json']
for (const file of required) assert.ok(files.has(path.resolve(file)), `Missing serverless fallback: ${file}`)
const spots = (await fs.readdir('public-data/spots')).filter(file => file.endsWith('.json'))
for (const spot of spots) assert.ok(files.has(path.resolve('public-data/spots', spot)), `Missing serverless Spot fallback: ${spot}`)
console.log(`PASS: serverless manifest includes ${required.length} shared snapshots and ${spots.length} Spot fallbacks`)
