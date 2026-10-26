import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readPublicationPriceHighlights } from '@/lib/server/guide-price-highlights-store'
import { readPublicationWidgets } from '@/lib/server/klook-widgets-store'
import { formatPriceHighlightAmount } from '@/lib/guide-price-highlights'
import { normalizePublicGuideTripCost } from '@/lib/guide-budget'
import type { PublicationCatalog, PublicationChange, PublicationPlan } from '@/lib/publication-plan'
import type { HtmlValue } from '@/lib/publication-html'

/** Edit-time reads only. Public renderers retain their existing tagged stores. */
export async function publicationValueChecks(change: PublicationChange, catalog: PublicationCatalog, plan: PublicationPlan) {
  const checks: Array<{ path: string; status: number; values: HtmlValue[] }> = []
  if (change.kind === 'price') {
    const base = String(process.env.PUBLIC_DATA_CDN_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
    let snapshot: any
    if(change.priceSource!=='highlights') {
      const response = await fetch(`${base}/public-data/guide-trip-costs.json?publication=${randomUUID()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error('Authoritative trip cost read-back unavailable')
      snapshot=await response.json()
      if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.tripCosts)) throw new Error('Invalid trip cost source')
    }
    for (const guide of catalog.guides.filter(g=>plan.paths.includes(`/guide/${g.slug}`))) {
      const prices = change.priceSource==='trip-cost'?[]:await readPublicationPriceHighlights(guide.slug)
      const cost = snapshot?.tripCosts.find((r: any)=>r.slug===guide.slug)?.tripCost
      if (snapshot && !cost) throw new Error('Published trip cost missing')
      const values: HtmlValue[] = change.priceSource==='trip-cost'?[]:[{ attribute:'data-jnq-prices', value:JSON.stringify(prices) }]
      if(cost)values.push({ attribute:'data-jnq-trip-cost',value:JSON.stringify(cost) })
      for (const price of prices) values.push({ attribute:'data-jnq-price-amount',value:`${price.currency}:${price.amountMinor}`,text:formatPriceHighlightAmount(price.currency,price.amountMinor) })
      if (cost && cost.source !== 'hidden') values.push({ attribute:'data-jnq-trip-total',value:String(cost.totalCents) })
      const normalizedCost=cost?normalizePublicGuideTripCost(cost):null
      if (cost && !normalizedCost) throw new Error('Invalid public trip cost')
      checks.push({ path:`/guide/${guide.slug}`,status:200,values:values.map(value=>value.attribute==='data-jnq-trip-cost'?{...value,value:JSON.stringify(normalizedCost)}:value) }, { path:`/en/guide/${guide.slug}`,status:200,values })
    }
  } else if (change.kind === 'widget' || change.kind === 'affiliate') {
    const widgets = change.kind === 'widget' ? await readPublicationWidgets() : []
    if(change.kind==='affiliate' && !catalog.notes.some(n=>plan.paths.includes(`/notes/${n.slug}`))) {
      if(!change.ids?.length) throw new Error('Affiliate source verification requires written IDs')
      const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})}})
      const result=await client.from('affiliate_links').select('id').in('id',change.ids)
      if(result.error)throw new Error('Authoritative affiliate source unavailable')
    }
    for (const note of catalog.notes.filter(n=>plan.paths.includes(`/notes/${n.slug}`))) {
      const values: HtmlValue[] = []
      if (change.kind === 'widget') {
        const ids = note.blocks.filter(b=>b.type==='klookWidget').flatMap(b=>b.klookWidgetIds || [])
        const visible = widgets.filter(w=>w.isActive && (ids.includes(w.id) || w.noteSlugs.includes(note.slug))).sort((a,b)=>a.id.localeCompare(b.id))
        values.push({ attribute:'data-jnq-widget-values',value:JSON.stringify(visible) })
        for (const widget of visible) values.push({ attribute:'data-jnq-widget-code',value:widget.htmlCode,text:widget.noteSlugs.includes(note.slug)?widget.title:note.blocks.find(b=>b.type==='klookWidget' && b.klookWidgetIds?.includes(widget.id))?.title || widget.title })
      } else {
        const ids = [...new Set(note.blocks.filter(b=>b.type==='affiliate').flatMap(b=>b.affiliateIds || []))]
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{ auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{
          const headers=new Headers(init?.headers);headers.set('X-JNQ-Publication-Read','authoritative')
          return fetch(input,{...init,cache:'no-store',headers})
        }} })
        const { data,error } = ids.length ? await supabase.from('affiliate_links').select('id,title,description,provider,link_type,url,preview_image_url,image_url').in('id',ids).eq('is_active',true) : {data:[],error:null}
        if (error) throw new Error('Authoritative affiliate read-back unavailable')
        const links = [...data || []].sort((a,b)=>a.id-b.id)
        values.push({ attribute:'data-jnq-affiliate-values',value:JSON.stringify(links) })
        for (const link of links) values.push({ attribute:'data-jnq-affiliate-title',value:link.url,...(link.title ? {text:link.title} : {}) })
      }
      checks.push({path:`/notes/${note.slug}`,status:200,values})
    }
  }
  // An unbound new widget/link has no rendered consumer. The fresh source read
  // above confirms persistence; do not invent or prewarm an unrelated page.
  return checks
}
