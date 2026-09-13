import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { homepageShowcase, usableVisitDate, hasShowcaseImage } from '../lib/homepage-order.ts'
import type { PublicLocation, PublicRegion } from '../lib/public-data.ts'

const region = (id:number, thumbnail:string|null='https://images.example/trip.jpg'):PublicRegion => ({id,slug:`region-${id}`,name:`Region ${id}`,country:'Malaysia',thumbnail,shortSummary:null,parentId:null,code:'home-malaysia'})
const spot = (id:number, date:string|null, r:PublicRegion):PublicLocation => ({id,slug:`spot-${id}`,name:`Spot ${id}`,visitDate:date,region:r,thumbnail:'https://images.example/place.webp',category:'attraction',latitude:1,longitude:103,shortSummary:null})

test('actual visit date wins over newer IDs and modification timestamps',()=>{
  const r=region(1), older={...spot(999,'2024-01-01',r),updated_at:'2099-01-01'},newer=spot(1,'2025-01-01',r)
  assert.deepEqual(homepageShowcase([older,newer],[r]).latest.map(x=>x.id),[1,999])
  const modified = {...older,updated_at:'1900-01-01'}
  assert.deepEqual(homepageShowcase([modified,newer],[r]).latest.map(x=>x.id),[1,999])
})
test('Region order uses newest eligible Spot date, not pinning or count',()=>{
  const a=region(1),b={...region(2),code:null}
  const result=homepageShowcase([spot(900,'2020-01-01',a),spot(901,'2020-01-02',a),spot(1,'2025-02-01',b)],[a,b])
  assert.deepEqual(result.malaysia.map(x=>x.id),[2,1])
})
test('missing dates, invalid dates, image-less and placeholder cards cannot take showcase slots',()=>{
  const a=region(1),b=region(2,null),c=region(3,'/placeholder-image.jpg')
  const bad=[spot(2,null,a),spot(3,'2025-02-30',a),{...spot(4,'2026-01-01',a),thumbnail:null},{...spot(5,'2026-01-01',a),thumbnail:'/blank.svg'}]
  const result=homepageShowcase([...bad,spot(1,'2024-01-01',a),spot(6,'2025-01-01',b),spot(7,'2025-01-01',c)],[a,b,c])
  assert.deepEqual(result.latest.map(x=>x.id),[6,7,1])
  assert.deepEqual(result.malaysia.map(x=>x.id),[1])
  assert.equal(result.malaysia[0].visitDate,'2024-01-01')
  for(const value of ['','/logo.png','/placeholder-image.jpg','/blank.webp','https://placehold.co/300.png','data:image/png,x']) assert.equal(hasShowcaseImage(value),false,value)
  for(const value of ['invalid','2025-02-29','2024-13-01']) assert.equal(usableVisitDate(value),null)
  assert.equal(usableVisitDate('2024-02-29'),'2024-02-29')
})
test('failed images are skipped before filling showcase positions',()=>{
  const r=region(1);const spots=Array.from({length:10},(_,i)=>({...spot(i,`2025-01-${String(20-i).padStart(2,'0')}`,r),thumbnail:`https://images.example/${i}.jpg`}))
  assert.deepEqual(homepageShowcase(spots,[r],new Set([spots[0].thumbnail!])).latest.map(x=>x.id),[1,2,3,4,5,6,7,8])
  assert.equal(homepageShowcase(spots,[r],new Set([r.thumbnail!])).malaysia.length,0)
})
test('ordering is independent of locale labels and both homes use shared UI',()=>{
  const regions=[region(1),region(2)],spots=[spot(1,'2025-01-01',regions[0]),spot(2,'2025-01-01',regions[1])]
  const zh=homepageShowcase(spots,regions)
  const en=homepageShowcase(spots.map(x=>({...x,name:'English'})),regions.map(x=>({...x,name:'English'})))
  assert.deepEqual(en.latest.map(x=>x.id),zh.latest.map(x=>x.id))
  assert.deepEqual(en.malaysia.map(x=>x.id),zh.malaysia.map(x=>x.id))
  assert.match(fs.readFileSync('app/page.tsx','utf8'),/HomePageClient/)
  assert.match(fs.readFileSync('components/EnglishRouteAdapter.tsx','utf8'),/HomePageClient/)
})
test('public normalization projects only canonical visit_date and does not add reads',()=>{
  const source=fs.readFileSync('lib/server/public-data-resolver.ts','utf8')
  assert.match(source,/LOCATIONS_SELECT = '[^']*visit_date'/)
  assert.match(source,/visitDate: usableVisitDate\(row.visit_date\)/)
  const home=fs.readFileSync('components/HomePageClient.tsx','utf8')
  assert.match(home,/homepageShowcase\(visibleLocations, regions, failedImages\)/)
  assert.doesNotMatch(home,/return right.id - left.id/)
})
