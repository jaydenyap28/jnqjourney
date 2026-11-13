import { validVersion, publishedSpot } from '../spot-loop/spot-contract.mjs'
import { FormalError } from './formal-runtime.mjs'
export function prepareFormalSlugEdit(records, body, spot) {
  if (!Number.isSafeInteger(body.id) || body.id < 1 || body.id >= 92000 && body.id <= 92999 || body.id >= 95000 && body.id <= 95099 || typeof body.slug !== 'string' ||
      body.slug.length > 120 || body.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) ||
      !Object.hasOwn(body,'expectedUpdatedAt') || !validVersion(body.expectedUpdatedAt)) throw new FormalError(400,'FORMAL_SLUG_INVALID')
  if (!spot || spot.id !== body.id || spot.updated_at !== body.expectedUpdatedAt) throw new FormalError(409,'FORMAL_SLUG_VERSION_CONFLICT')
  const matches=records.filter(row=>row.id===body.id)
  if (matches.length>1 || matches[0]?.version===body.expectedUpdatedAt && matches[0].slug!==body.slug) throw new FormalError(409,'FORMAL_SLUG_VERSION_CONFLICT')
  return [...records.filter(row=>row.id!==body.id),{id:body.id,slug:body.slug,version:body.expectedUpdatedAt}]
}
export function projectFormalSlugs(base, edits, currentSpots, publishedBaseline) {
  if (!base || Array.isArray(base) || edits.length>10000 || new Set(edits.map(row=>row.id)).size!==edits.length) throw new FormalError(503,'FORMAL_SLUG_AUTHORITY_INVALID')
  const map={...base}, byId=new Map(edits.map(row=>[row.id,row]))
  for (const spot of currentSpots) {
    const previous=publishedBaseline.find(row=>row.id===spot.id), edit=byId.get(spot.id)
    if (spot.id!==450 && publishedSpot(spot) && (!previous || previous.updated_at!==spot.updated_at) &&
      (!edit || edit.version!==spot.updated_at)) throw new FormalError(503,'FORMAL_SLUG_VERSION_PENDING')
  }
  for(const edit of edits){if(edit.slug)map[String(edit.id)]=edit.slug;else delete map[String(edit.id)]}
  return map
}
