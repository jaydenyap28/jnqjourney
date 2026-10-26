import { readPublicGuides, readPublicNotes } from '@/lib/server/public-content-store'
import { resolvePublicData } from '@/lib/server/public-data-resolver'
import { buildRegionPath } from '@/lib/region-routing'
import type { TravelPackage } from './travel-packages'

export async function packageRelatedLinks(item: TravelPackage) {
  const [guides,notes,data] = await Promise.all([
    item.related_guide_slugs?.length ? readPublicGuides() : Promise.resolve([]),
    item.related_note_slugs?.length ? readPublicNotes() : Promise.resolve([]),
    item.region_id || item.related_location_ids?.length ? resolvePublicData() : Promise.resolve(null),
  ])
  const links: Array<{href:string;title:string}> = []
  const validSlug = (slug:string) => /^[\p{L}\p{N}_-]+$/u.test(slug)
  for (const slug of item.related_guide_slugs || []) { const guide=guides.find(g=>g.slug===slug);if(guide&&validSlug(slug))links.push({href:`/guide/${encodeURIComponent(slug)}`,title:guide.title}) }
  for (const slug of item.related_note_slugs || []) { const note=notes.find(n=>n.slug===slug);if(note&&validSlug(slug))links.push({href:`/notes/${encodeURIComponent(slug)}`,title:note.title}) }
  for (const id of item.related_location_ids || []) {const spot=data?.locations.find(s=>s.id===id);if(spot&&validSlug(spot.slug))links.push({href:`/spot/${spot.slug}`,title:spot.name})}
  const region=data?.regions.find(r=>r.id===item.region_id)
  if(region)links.push({href:buildRegionPath(region.name,region.id),title:`${region.name}目的地资讯`})
  return [...new Map(links.map(link=>[link.href,link])).values()]
}
