// Exact one-object compatibility probe. The old hostname remains external.
import {integrationImage} from './worker.mjs'

export const legacySource='https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/636-turtle-alley55-c31f4813-26cb-4b04-957f-9805f2b3fdf8.webp'
export const legacyPath=new URL(legacySource).pathname
export const canonicalMediaPath='/media/legacy/636/turtle-alley-cover.webp'
export const previewOrigin='https://codex-public-readiness.jnqjourney-spot-loop-migration-candidate.pages.dev'
const supabase='https://rnamstwwbzknwbjwdgrf.supabase.co'
const headers={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}
const notFound=()=>new Response('Not Found',{status:404,headers})

export default {
  async fetch(request,env) {
    const url=new URL(request.url)
    const key=env.LEGACY_MEDIA_TEST_KEY||''
    if(url.origin!==previewOrigin||!['GET','HEAD'].includes(request.method)||url.search||
       ![legacyPath,canonicalMediaPath].includes(url.pathname))return notFound()
    if(env.SUPABASE_URL!==supabase||!env.SUPABASE_SERVICE_ROLE_KEY||!env.TEST_MEDIA||
       !/^media\/candidate\/92017\/[a-f0-9-]{36}\.webp$/.test(key)||
       !Number.isSafeInteger(Number(env.LEGACY_MEDIA_TEST_EXPIRES))||Date.now()>=Number(env.LEGACY_MEDIA_TEST_EXPIRES)*1000)
      return new Response('Unavailable',{status:503,headers})
    try {
      // Both aliases run the same current-publication and native-object gate.
      // A null settings object explicitly disables editor cookie previews.
      return await integrationImage(request,env,null,'92017',key,(...args)=>fetch(...args))
    } catch(error) {
      if(error.status===404)return notFound()
      return new Response('Unavailable',{status:503,headers})
    }
  },
}
