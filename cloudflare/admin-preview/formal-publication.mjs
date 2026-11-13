import { sha256 } from './publication.mjs'
import { publishedSpot, SPOT_FIELDS } from '../spot-loop/spot-contract.mjs'
import { mediaReferences } from './formal-media.mjs'
import { FormalError } from './formal-runtime.mjs'
import { FORMAL_PROJECT } from './formal-admin-read.mjs'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
}
export const formalDigest = value => sha256(JSON.stringify(canonical(value)))
const lists = { spot: feeds => feeds['database.json'].locations, note: feeds => feeds['notes.json'].notes, guide: feeds => feeds['guides.json'].guides }
const identity = (kind, row) => kind === 'spot' ? String(row.id) : row.slug
const version = (kind, row) => kind === 'spot' ? row.updated_at : row.updatedAt || ''
const eligible = (kind, row) => !!row && (kind === 'spot' ? row.id !== 450 && publishedSpot(row) :
  kind === 'note' ? row.published === true : row.published !== false && [null, undefined, 'published'].includes(row.publication_status))

const publicFields = SPOT_FIELDS.filter(key => !['review_jayden', 'review_qing', 'is_visited', 'created_at'].includes(key))
export const projectFormalPublicSpot = row => Object.fromEntries(publicFields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))
const publicSpot = projectFormalPublicSpot
export async function formalPublicationCatalog(authority, baseline, projectDocument) {
  const items = []
  const counts = { added: 0, modified: 0, hidden: 0 }
  for (const [kind, list] of Object.entries(lists)) {
    const old = new Map(list(baseline.feeds).map(row => [identity(kind, row), row]))
    for (const row of list(authority)) {
      const key = identity(kind, row), prior = old.get(key), visible = eligible(kind, row)
      const project = value => JSON.parse(JSON.stringify(kind === 'spot' ? publicSpot(value) : projectDocument(kind, value))
        .replace(/\/admin-draft-media\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g,(reference,name)=>baseline.media?.[name] ? '/media/static/'+name : reference))
      let change = !visible ? prior ? 'hidden' : 'draft' : !prior ? 'added' :
        await formalDigest(project(row)) === await formalDigest(project(prior)) ? 'unchanged' : 'modified'
      if (Object.hasOwn(counts, change)) counts[change]++
      items.push({ kind, key, title: row.name_cn || row.name || row.title, version: version(kind,row),
        eligible: visible || !!prior, change, status: !visible ? prior ? '待撤下' : '草稿' : change === 'unchanged' ? '已公开' : '待批准', action: visible ? 'publish' : 'withdraw' })
      old.delete(key)
    }
    // Missing authoritative records must never be silently retained.
    for (const [key, row] of old) { counts.hidden++; items.push({kind,key,title:row.title || row.name_cn || row.name, version:null,eligible:false,change:'hidden',status:'来源缺失，需人工处理'}) }
  }
  return { items, counts }
}
export async function makeFormalPublication({ authority, baseline, selection, approvedRemovalDigest, requestedBy, projectDocument }) {
  if (!Array.isArray(selection) || selection.length > 2000 || !selection.length) throw new FormalError(400, 'FORMAL_SELECTION_REQUIRED')
  if (authority?.['database.json']?.projectRef !== FORMAL_PROJECT || baseline?.feeds?.['database.json']?.projectRef !== FORMAL_PROJECT ||
      authority['database.json'].locations.some(row => row.id >= 92000 && row.id <= 92999 || row.id >= 95000 && row.id <= 95099)) throw new FormalError(503, 'FORMAL_AUTHORITY_SCOPE_OR_FIXTURE_VIOLATION')
  const feeds = structuredClone(baseline.feeds)
  const maps = Object.fromEntries(Object.entries(lists).map(([kind, list]) => {
    const rows = list(authority)
    const map = new Map(rows.map(row => [identity(kind, row), row]))
    if (map.size !== rows.length) throw new FormalError(503, 'FORMAL_DUPLICATE_AUTHORITY')
    return [kind, map]
  }))
  // Current eligibility wins over a retained static baseline, even for records
  // not selected in this click. Removal still needs an exact reviewed digest.
  const removed = { spot: [], note: [], guide: [] }
  for (const [kind, list] of Object.entries(lists)) {
    const rows = list(feeds)
    const retained = rows.filter(row => {
      if (eligible(kind, maps[kind].get(identity(kind, row)))) return true
      removed[kind].push(kind === 'spot' ? row.id : identity(kind, row)); return false
    })
    rows.splice(0, rows.length, ...retained)
  }
  const seen = new Set()
  const approvals = []
  for (const item of selection) {
    if (!item || !Object.hasOwn(lists, item.kind) || typeof item.key !== 'string' ||
        !['publish', 'withdraw'].includes(item.action) || !Object.hasOwn(item, 'version')) throw new FormalError(400, 'FORMAL_SELECTION_INVALID')
    const key = item.kind + ':' + item.key
    if (seen.has(key)) throw new FormalError(400, 'FORMAL_DUPLICATE_SELECTION')
    seen.add(key)
    const row = maps[item.kind].get(item.key)
    if (!row || version(item.kind, row) !== item.version) throw new FormalError(409, 'FORMAL_SELECTION_STALE')
    const target = lists[item.kind](feeds)
    const index = target.findIndex(old => identity(item.kind, old) === item.key)
    if (item.action === 'withdraw') {
      if (eligible(item.kind, row)) throw new FormalError(409, 'FORMAL_WITHDRAW_REQUIRES_SAVED_STATE')
      if (index >= 0) target.splice(index, 1)
    } else {
      if (!eligible(item.kind, row)) throw new FormalError(409, 'FORMAL_CONTENT_NOT_PUBLIC')
      const projected = item.kind === 'spot' ? publicSpot(row) : projectDocument ? projectDocument(item.kind, row) : null
      if (!projected) throw new FormalError(503, 'FORMAL_DOCUMENT_PROJECTOR_REQUIRED')
      if (index >= 0) target[index] = structuredClone(projected)
      else target.push(structuredClone(projected))
    }
    approvals.push({ kind: item.kind, key: item.key, action: item.action, version: item.version })
  }
  const removalDigest = await formalDigest(removed)
  if (Object.values(removed).some(rows => rows.length) && approvedRemovalDigest !== removalDigest) {
    const error = new FormalError(409, 'FORMAL_WITHDRAWAL_CONFIRMATION_REQUIRED')
    error.removed = removed; error.removalDigest = removalDigest
    throw error
  }
  // Keep all other modules and untouched published revisions. Selected rows
  // never replace the whole website. Slugs/inventory use current authority.
  feeds['location-slugs.json'] = structuredClone(authority['location-slugs.json'])
  const approvedSpotIds = new Set(feeds['database.json'].locations.map(row => row.id))
  feeds['database.json'].locations = feeds['database.json'].locations.map(publicSpot)
  feeds['database.json'].inventory = structuredClone(authority['database.json'].inventory).map(row =>
    !approvedSpotIds.has(row.id) && eligible('spot', row) ? { ...row, publication_status: 'draft' } : row)
  const names = new Set()
  // Rich-text HTML can carry a previously published static reference outside
  // structured image fields. Only trusted baseline media identities qualify.
  const embedded = [...JSON.stringify(feeds).matchAll(/\/media\/static\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)/g)].map(match=>match[0])
  for (const raw of [...mediaReferences(feeds), ...embedded]) {
    const reference = raw.split('#')[0]
    if (reference.startsWith('/admin-draft-media/') ||
      reference.startsWith('/media/static/') && baseline.media?.[reference.slice('/media/static/'.length)]) {
    const name = reference.slice(reference.startsWith('/admin-draft-media/') ? '/admin-draft-media/'.length : '/media/static/'.length)
    if (!/^[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(name)) throw new FormalError(422, 'FORMAL_MEDIA_NAME_INVALID')
    names.add(name)
    }
  }
  if (names.size > 200) throw new FormalError(413, 'FORMAL_INCREMENTAL_MEDIA_BATCH_LIMIT')
  const oldMedia = new Set(mediaReferences(baseline.feeds))
  const publicView = value => {
    const copy = structuredClone(value)
    delete copy['database.json'].inventory; delete copy['database.json'].capturedAt
    const text = JSON.stringify(copy).replace(/\/admin-draft-media\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g,
      (reference, name) => oldMedia.has('/media/static/' + name) ? '/media/static/' + name : reference)
    return JSON.parse(text)
  }
  if (await formalDigest(publicView(feeds)) === await formalDigest(publicView(baseline.feeds))) throw new FormalError(409, 'FORMAL_NO_PUBLIC_CHANGES')
  approvals.sort((a, b) => (a.kind + ':' + a.key).localeCompare(b.kind + ':' + b.key))
  const payload = { schemaVersion: 1, baselineRevision: baseline.revision,
    authorityRevision: await formalDigest(authority), feeds, approvals, removed, media: [...names].sort() }
  const id = await formalDigest(payload)
  // Audit identity/time are private and deliberately excluded from dedup hash.
  return { id, payload, requestedBy, requestedAt: new Date().toISOString() }
}

export async function verifyFormalJob(job, authority, baselineRevision) {
  if (!/^[a-f0-9]{64}$/.test(job?.id || '') || await formalDigest(job.payload) !== job.id ||
      job.payload.baselineRevision !== baselineRevision || await formalDigest(authority) !== job.payload.authorityRevision) {
    throw new FormalError(409, 'FORMAL_QUEUED_VERSION_CHANGED')
  }
}
