import { FORMAL_PRIVATE_SCOPE, FormalError } from './formal-runtime.mjs'
import { formalDigest } from './formal-publication.mjs'
import { sha256 } from './publication.mjs'

// Explicit, create-only bootstrap helper. Not exposed by either Edge entry.
// The caller must freshly capture/verify the source, approved ACL and bucket.
export async function applyFormalPrivateBootstrap({ target, verifyPrivate, source, baseline, approved = false }) {
  if (approved !== true || source?.projectRef !== FORMAL_PRIVATE_SCOPE.projectRef ||
      target.supabaseUrl !== `https://${FORMAL_PRIVATE_SCOPE.projectRef}.supabase.co`) throw new FormalError(405, 'FORMAL_BOOTSTRAP_NOT_APPROVED')
  await verifyPrivate()
  if (await formalDigest(baseline.feeds) !== baseline.revision) throw new FormalError(409, 'FORMAL_BOOTSTRAP_BASELINE_HASH_MISMATCH')
  const objects = []
  for (const name of ['notes', 'guides']) {
    const item = source[name]
    if (!new RegExp(`^_system/${name}/[0-9]{13}(?:-[a-f0-9-]{36})?\\.webp$`).test(item?.pointer || '') ||
        !Array.isArray(JSON.parse(item.bytes)) || new TextEncoder().encode(item.bytes).length > 8 * 1024 * 1024 ||
        await sha256(item.bytes) !== item.sha256) throw new FormalError(503, 'FORMAL_BOOTSTRAP_AUTHORITY_INVALID')
    const records = JSON.parse(item.bytes)
    for (const approved of baseline.feeds[name + '.json'][name]) {
      const row = records.find(record => record.slug === approved.slug)
      if (!row || await formalDigest(row) !== await formalDigest(approved)) throw new FormalError(409, 'FORMAL_BOOTSTRAP_PUBLIC_BASELINE_STALE')
    }
    objects.push({ key: item.pointer, text: item.bytes }, { key: `_system/${name}-latest.webp`, text: item.pointer })
  }
  if (!source.slugMap || Array.isArray(source.slugMap) || typeof source.slugMap !== 'object') throw new FormalError(503, 'FORMAL_BOOTSTRAP_SLUGS_INVALID')
  const slugVersion='_system/location-slug-edits/'+source.notes.pointer.match(/[0-9]{13}/)[0]+'.webp'
  objects.push({key:slugVersion,text:'[]'},{key:'_system/location-slug-edits-latest.webp',text:slugVersion})
  objects.push({ key: '_system/location-slugs.webp', text: JSON.stringify(source.slugMap) },
    { key: '_publication/live.json', text: JSON.stringify({ id: 'accepted-static-baseline', deploymentId: baseline.deploymentId,
      source: baseline, routes: baseline.routes || [], mediaPaths: baseline.mediaPaths || [] }) })
  const bucket = target.storage.from(FORMAL_PRIVATE_SCOPE.storageBucket)
  for (const object of objects) {
    await bucket.upload(object.key, object.text, { upsert: false, contentType: object.key.endsWith('.webp') ? 'image/webp' : 'application/json', cacheControl: '0' })
    const actual = await bucket.download(object.key)
    if (actual.error || !actual.data || await actual.data.text() !== object.text) {
      // Whether upload returned an error or not, never overwrite or clean up
      // an unknown pointer/live result. Retain all source and target objects.
      throw new FormalError(409, 'FORMAL_BOOTSTRAP_TARGET_CONFLICT_OR_UNKNOWN')
    }
  }
  return { copied: objects.length, sourceWrites: 0, sourcePointersChanged: false }
}
