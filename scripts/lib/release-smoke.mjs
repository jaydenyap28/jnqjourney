import { evaluateSpotQuality } from '../../lib/spot-quality.ts'
import { parseNoteVideo } from '../../lib/note-video.ts'

export const result = (id,status,scope,detail) => ({id,status,scope,detail})
export function summarize(checks) {
  const counts = Object.fromEntries(['PASS','FAIL','UNVERIFIED'].map(status=>[status,checks.filter(c=>c.status===status).length]))
  return {status:counts.FAIL?'FAIL':counts.UNVERIFIED?'UNVERIFIED':'PASS',counts}
}
const decode = text => String(text || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]))
export function inspectHtml(html, headers = new Headers()) {
  // RSC scripts can contain escaped HTML strings; never accept those as DOM.
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  const tags = (withoutScripts.match(/<(?:meta|link|a|iframe|img|video)\b[^>]*>/gi) || []).map(tag=>({tag:tag.match(/^<(\w+)/)[1].toLowerCase(),...attributes(tag)}))
  const scripts = [...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)].map(match=>attributes(match[1]))
  const resources = [...tags.filter(t=>['iframe','img','video'].includes(t.tag)&&t.src).map(t=>t.src),...scripts.filter(t=>t.src).map(t=>t.src)]
  return {
    canonical:tags.filter(t=>t.tag==='link'&&t.rel==='canonical').map(t=>t.href),
    noindex:/\bnoindex\b/i.test([headers.get('x-robots-tag'),...tags.filter(t=>t.tag==='meta'&&/^(robots|googlebot)$/i.test(t.name||'')).map(t=>t.content)].join(',')),
    h1:(withoutScripts.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').match(/<h1\b/gi)||[]).length,
    links:tags.filter(t=>t.tag==='a'&&t.href).map(t=>t.href), resources,
    hasVideo:tags.some(t=> {
      const candidate=t.tag==='iframe'?t.src:t.tag==='a'?t.href:''
      const video=parseNoteVideo(candidate)
      if(!video)return false
      if(video.provider==='youtube')return true
      const url=new URL(video.watchUrl)
      return url.hostname==='fb.watch'||/^\/(?:watch|reel|videos|share\/v|plugins\/video\.php)(?:\/|$)/.test(url.pathname)||url.searchParams.has('v')
    }),
    analytics:scripts.some(t=>/googletagmanager\.com|google-analytics\.com|\/_vercel\/(?:insights|speed-insights)\//.test(t.src||'')),
  }
}

export function validateTarget(base,environment) {
  let url
  try {url=new URL(base)}catch{throw Error('Invalid target origin')}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  if (url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(local&&url.protocol==='http:')) throw Error('Use an HTTPS origin without credentials, query or path (HTTP only on loopback)')
  if (!['preview','production','local'].includes(environment)) throw Error('Explicit --environment preview|production|local required')
  if (environment==='preview'&&['jnqjourney.com','www.jnqjourney.com'].includes(url.hostname)) throw Error('Production host cannot be accepted as Preview')
  if (environment==='production'&&local) throw Error('Loopback cannot be Production evidence')
  return {origin:url.origin,evidence:local||environment==='local'?'LOCAL_SYNTHETIC':'PUBLIC_HTTP_ONLY'}
}

export async function runHttpSmoke({base,environment,manifest,fetcher=fetch}) {
  const target=validateTarget(base,environment),checks=[]
  const scope=target.evidence
  const canonicalOrigin=environment==='preview'?target.origin:manifest.canonicalOrigin||target.origin
  const add=(id,status,detail)=>checks.push(result(id,status,scope,detail))
  if(!Array.isArray(manifest.routes)) throw Error('Route manifest required')
  for(const route of manifest.routes) if(!/^\/(?:en\/?|(?:en\/)?(?:region|guide|notes|packages|spot)(?:\/[a-zA-Z0-9_-]+)?)?$/.test(route.path)||!['page','spot','guide','note','package'].includes(route.kind)) throw Error('Only explicit public page routes are permitted; API/admin paths cannot be supplied')
  for(const kind of ['page','spot','guide','note','package']) if(!manifest.routes.some(route=>route.kind===kind)) add(`coverage:${kind}`,'UNVERIFIED','No route supplied for this required category')
  if(!manifest.routes.some(route=>route.path.startsWith('/en'))) add('coverage:english','UNVERIFIED','No English route supplied')
  for(const indexable of [true,false]) if(!manifest.routes.some(route=>route.kind==='spot'&&route.indexable===indexable)) add(`coverage:spot-${indexable?'qualified':'noindex'}`,'UNVERIFIED','Supply both qualified and thin Spot examples')
  const read=async route=> {
    // Never follow redirects or send auth/cookies. No external media/contact
    // request, POST, provider click, browser JS, database client or admin key.
    const response=await fetcher(new URL(route,target.origin),{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)})
    return {response,text:await response.text()}
  }
  let sitemap
  try {
    const {response,text}=await read('/sitemap.xml')
    if(response.status===200 && /<(?:\w+:)?urlset\b/.test(text)) {
      sitemap=new Set([...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>decode(m[1])))
      add('sitemap',sitemap.size?'PASS':'FAIL',`URLs=${sitemap.size}; no fixed Active/Sitemap count requirement`)
      add('withdrawn-450',[...sitemap].some(url=>/\/spot\/(?:[^/?#]*-)?450\/?$/.test(url))?'FAIL':'PASS','Withdrawn ID absent in both languages')
    } else add('sitemap',[401,403,301,302,307,308].includes(response.status)?'UNVERIFIED':'FAIL',`HTTP ${response.status}; valid urlset required`)
    const robots=await read('/robots.txt')
    const blocksAll=/Disallow:\s*\/\s*$/mi.test(robots.text)
    add('robots-boundary',[401,403,301,302,307,308].includes(robots.response.status)?'UNVERIFIED':robots.response.status===200 && (environment==='preview'?blocksAll&&!/Sitemap:/i.test(robots.text):!blocksAll)?'PASS':'FAIL','Preview disallows all; Production must not inherit global disallow')
  } catch {add('site-inventory','UNVERIFIED','Network unavailable; no eligibility inferred')}

  for(const route of manifest.routes) {
    const id=`${route.kind}:${route.path}`
    if(!/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(route.path)) throw Error('Use a public path without query or credentials')
    try {
      const {response,text}=await read(route.path)
      if(response.status!==200) {add(id,[401,403,301,302,307,308].includes(response.status)?'UNVERIFIED':'FAIL',`HTTP ${response.status}; redirects/protection are not page content`);continue}
      const html=inspectHtml(text,response.headers)
      add(`${id}:page`,(response.headers.get('content-type')||'').includes('text/html')&&html.h1===1&&html.canonical.length===1&&html.canonical[0]===new URL(route.path,canonicalOrigin).href?'PASS':'FAIL','HTML 200, one visible H1, exact canonical required')
      if(environment==='preview') {
        add(`${id}:preview-noindex`,/\bnoindex\b/i.test(response.headers.get('x-robots-tag')||'')?'PASS':'FAIL','Global HTTP noindex required')
        add(`${id}:analytics`,html.analytics?'FAIL':'PASS','No automatic GA/Insights script in HTML; browser requests remain unverified')
        const origins=new Set([target.origin,...(manifest.allowedResourceOrigins||[])])
        const unapproved=html.resources.some(src=>{try{const u=new URL(src,target.origin);return !origins.has(u.origin)||u.pathname==='/_next/image'&&u.searchParams.get('url')&&!origins.has(new URL(u.searchParams.get('url'),target.origin).origin)}catch{return true}})
        add(`${id}:resource-origins`,unapproved?'FAIL':'PASS','Only explicitly approved test/provider resource origins; resources are not fetched')
      } else if(typeof route.indexable==='boolean') add(`${id}:robots`,html.noindex!==route.indexable?'PASS':'FAIL','HTTP + meta robots compared with declared expectation')
      if(route.kind==='spot') {
        const slug=route.path.split('/').at(-1),english=route.path.startsWith('/en/')
        const detail=await read(`/api/spots/${slug}`),routing=await read(`/api/spot-routing/${slug}${english?'?locale=en':''}`)
        if(detail.response.status!==200||routing.response.status!==200) {add(`${id}:qualification`,'FAIL','Spot detail/routing API unavailable');continue}
        const spot=JSON.parse(detail.text).spot,visibility=JSON.parse(routing.text)
        const quality=evaluateSpotQuality(spot).indexable
        const detailGate=detail.response.headers.get('x-jnq-seo-indexable'),gate=routing.response.headers.get('x-jnq-seo-indexable')
        const source=detail.response.headers.get('x-jnq-data-source')
        const publicState=spot&&spot.id===Number(slug.match(/(?:^|-)(\d+)$/)?.[1])&&[undefined,null,'published'].includes(spot.publication_status)
        const detailExpected=quality&&source!=='static-fallback',routingGate=gate==='true'
        const consistent=publicState&&visibility.visible===true&&!visibility.destination&&['cdn-cache','supabase','static-fallback'].includes(source)&&detailGate===(detailExpected?'1':'0')&&['true','false'].includes(gate)&&(!routingGate||detailExpected)&&(english||routingGate===detailExpected)
        add(`${id}:qualification`,consistent?'PASS':'FAIL','Existing quality/publication/source and routing agree; English can only narrow eligibility')
        if(environment!=='preview') {
          add(`${id}:index-consistency`,html.noindex===!routingGate?'PASS':'FAIL','HTML/HTTP robots agree with locale routing qualification')
          add(`${id}:sitemap-eligibility`,sitemap?(sitemap.has(html.canonical[0])===routingGate?'PASS':'FAIL'):'UNVERIFIED','Only this qualified canonical belongs in Sitemap; no 582 requirement')
        } else if(sitemap&&!routingGate) add(`${id}:thin-not-in-sitemap`,sitemap.has(html.canonical[0])?'FAIL':'PASS','Thin/incomplete source cannot be reintroduced by Sitemap')
      }
      if(route.kind==='note'||route.kind==='guide') {
        add(`${id}:body`,text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,'').trim().length>100?'PASS':'FAIL','Visible document body required, not RSC-only text')
        if(route.video) add(`${id}:video-markup`,html.hasVideo?'PASS':'FAIL','Provider video/watch entry exists; playback not tested')
      }
      if(route.kind==='package') {
        const contact=html.links.some(href=>{try{const u=new URL(href),message=u.searchParams.get('text')||'';return u.protocol==='https:'&&u.hostname==='wa.me'&&/^\/\d+$/.test(u.pathname)&&message.length>5&&(route.contactTerms||[]).every(term=>message.toLowerCase().includes(term.toLowerCase()))}catch{return false}})
        add(`${id}:contact`,contact?'PASS':'FAIL','Contextual WhatsApp href only; no click or message sent')
      }
    } catch(error) { add(id,error instanceof SyntaxError?'FAIL':'UNVERIFIED','Network/parse failure; no body, credentials or raw error persisted') }
  }
  for(const id of ['deployment-commit-and-env','test-db-readonly-permissions','browser-network-and-video-playback','cloud-schedules-and-integrations']) add(id,'UNVERIFIED','Requires independent deployment/configuration or browser evidence; GET cannot establish this')
  return {...summarize(checks),target,checks}
}
