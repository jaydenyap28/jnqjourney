import fs from 'node:fs/promises'
import Fuse from 'fuse.js'
import { createSpotSearch, EMPTY_SPOT_FILTERS } from '../lib/spot-search.ts'

const spots = JSON.parse(await fs.readFile('public-data/locations.json', 'utf8')).locations
const before = new Fuse(spots, { includeScore: true, threshold: .3, keys: [
  { name: 'name', weight: 1 }, { name: 'region.country', weight: .7 }, { name: 'region.name', weight: .8 },
  { name: 'category', weight: .6 }, { name: 'shortSummary', weight: .5 },
] })
const after = createSpotSearch(spots)
const results = []
for (const q of ['南湖', 'cafe mori', '  CAFE   MORI  ', '湯けむり', 'farm', '住宿', '不存在的火星景点zzzzz']) {
  const measure = fn => {
    fn(); const times = []; let hits
    for (let i = 0; i < 30; i++) { const start = performance.now(); hits = fn(); times.push(performance.now() - start) }
    times.sort((a, b) => a - b)
    return { p50Ms: +times[15].toFixed(2), p95Ms: +times[28].toFixed(2), hits: hits.length }
  }
  results.push({ q, before: measure(() => before.search(q)), after: measure(() => after({ ...EMPTY_SPOT_FILTERS, q })) })
}
const output = { mode: 'Node CPU benchmark over actual bundled records; not browser input latency', spots: spots.length, results }
await fs.mkdir('artifacts/experience-performance', { recursive: true })
await fs.writeFile('artifacts/experience-performance/search.json', JSON.stringify(output, null, 2))
console.log(JSON.stringify(output, null, 2))
