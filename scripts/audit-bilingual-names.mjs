import fs from 'node:fs'
import { resolveEntityDisplayName, ORIGINAL_ONLY_NAMES } from '../lib/entity-display-name.ts'

// Read-only classification. This script never changes source records or snapshots.
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'))
const payload = read('artifacts/bilingual-name/production-locations-readonly.json')
const build = read('data/langkawi-content-build.json')
const candidates = Object.values(build).find(value => Array.isArray(value) && value.some(row => row.name === 'Dataran Lang'))
const snapshot = read('public-data/locations.json')
const naturalLangkawi = new Set(['Langkawi Sky Bridge', 'Dataran Lang', 'Pantai Cenang', 'Tanjung Rhu Beach', 'Underwater World Langkawi', 'Temurun Waterfall'])
const requestedRegions = new Set(['Genting Highlands', 'Semporna', 'Kota Kinabalu', 'Kuala Lumpur', 'Kota Bharu', 'Johor'])
const han = value => /[\u3400-\u9fff]/u.test(value || '')
function classify(row, kind) {
  const pair = resolveEntityDisplayName(row)
  const original = pair.secondary || pair.primary
  if (ORIGINAL_ONLY_NAMES.includes(original)) return ['B', 'User-curated original-only name']
  if (pair.secondary && (kind === 'region' && requestedRegions.has(original) || naturalLangkawi.has(original))) return ['A', 'Natural bilingual pair explicitly covered by the request / saved curated data']
  if (!han(row.name) && !han(row.name_cn)) return ['B', 'Original-only in inspected source; no Chinese name invented']
  if (pair.secondary && /cafe|restaurant|hotel|resort|villa|izakaya|coffee|pizza|chicken rice/i.test(original)) return ['C', 'Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation']
  return ['D', 'Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification']
}
const rows = [
  ...payload.locations.map(row => ({ ...row, auditSource: 'production public API (cdn-cache)', kind: 'spot' })),
  ...payload.regions.map(row => ({ ...row, auditSource: 'production public API (cdn-cache)', kind: 'region' })),
  ...candidates.map(row => ({ ...row, id: row.key, auditSource: 'saved Langkawi proposal (not live)', kind: 'Langkawi proposal' })),
].map(row => ({ ...row, classification: classify(row, row.kind), display: resolveEntityDisplayName(row) }))
const counts = kind => Object.fromEntries(['A','B','C','D'].map(key => [key, rows.filter(row => (!kind || row.kind === kind) && row.classification[0] === key).length]))
const esc = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ')
const table = items => '| Source / ID | Name | Chinese field | Primary | Secondary | Class / reason |\n|---|---|---|---|---|---|\n' + items.map(row => `| ${esc(row.auditSource)} / ${row.id} | ${esc(row.name)} | ${esc(row.name_cn)} | ${esc(row.display.primary)} | ${esc(row.display.secondary)} | ${row.classification.join(': ')} |`).join('\n')
const report = `# Bilingual name audit\n\nInspected ${new Date().toISOString()}. No source data changed.\n\n## Evidence and limits\n\nRead-only https://www.jnqjourney.com/api/locations returned cdn-cache: ${payload.locations.length} Spots and ${payload.regions.length} Regions. Read on 2026-09-08; the response carries no snapshot generatedAt. Initial sandbox-only local API used the ${snapshot.source.generatedAt} fallback; network-authorized public API verification supersedes that inventory. ${candidates.length} saved Langkawi proposal rows are reported separately and may predate the targeted cleanup. data/langkawi-targeted-patch.json and current Guide overrides remain untouched.\n\n## Existing schema\n\n- Raw Locations and Regions: name (canonical/original), name_cn (optional localized). No name_en / english_name column is needed.\n- Lightweight PublicLocation/PublicRegion and nested region: name already contains both names as Chinese / original. No payload fields added.\n- Spot detail: name and name_cn, with an existing snapshot adapter.\n- Guide: title / shortTitle; attraction.displayName is editorial and takes precedence over canonical Spot name. spotId, spotSlug, displayOrder and enabled are identity/order fields, not presentation fields.\n- Stays: linked Spot name/name_cn; accommodationStays[].displayName or legacy stay string.\n- Aliases/tags are not evidence for creating a translated name.\n\n## Classification\n\nA = natural bilingual (only explicitly supported pairs); B = original-name only; C = suspicious Chinese translation (review candidate, never a proven machine translation); D = needs manual review. Unreviewed Chinese names remain unchanged. Production rows and historical proposal rows are counted separately; proposal rows must not be added to the production total.\n\n| Source | A | B | C | D |\n|---|---:|---:|---:|---:|\n${['spot','region','Langkawi proposal'].map(kind => { const c=counts(kind); return `| ${kind} | ${c.A} | ${c.B} | ${c.C} | ${c.D} |` }).join('\n')}\n\n## Preservation\n\n${ORIGINAL_ONLY_NAMES.map(name => '- '+name).join('\n')}\n\nThese explicit original-only choices are applied only at presentation time. Unknown business translations are not automatically removed. Guide displayName still wins, including custom editorial aliases; a safely separable bilingual override becomes two lines.\n\n## Region examples\n\n${table(rows.filter(row => row.kind === 'region' && requestedRegions.has(row.display.secondary)))}\n\nThe inspected Genting record says 云顶, not 云顶高原; existing trusted wording is retained.\n\n## Full classified inventory\n\n${table(rows)}\n`
fs.writeFileSync('artifacts/bilingual-name-audit.md', report)
fs.writeFileSync('artifacts/bilingual-name/audit-counts.json', JSON.stringify({ spots: counts('spot'), regions: counts('region'), langkawiProposal: counts('Langkawi proposal') }, null, 2))
console.log({ spots: counts('spot'), regions: counts('region'), langkawiProposal: counts('Langkawi proposal') })
