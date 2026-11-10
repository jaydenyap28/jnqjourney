import { PublicReadUnavailable } from '@/lib/server/public-read-source'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}

export async function GET(request: Request, {params}: {params:{path:string[]}}) {
  // Only the isolated registered-media path is currently verified. Historical
  // multi-owner keys have no verified enrollment yet and deliberately 404.
  const path = '/media/'+params.path.join('/')
  if (!/^\/media\/candidate\/9206[12]\/[a-f0-9-]{36}\.png$/.test(path)) return new Response('Not Found',{status:404,headers})
  try {
    const origin = process.env.JNQ_PUBLIC_FEED_ORIGIN
    if (origin !== 'https://codex-p0-consumers.jnqjourney-spot-loop-migration-candidate.pages.dev') throw new PublicReadUnavailable()
    const response = await fetch(origin+path,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000)})
    if (!response.ok) {await response.body?.cancel();return new Response('Media unavailable',{status:response.status===404?404:503,headers})}
    return new Response(response.body,{headers:{...headers,'Content-Type':response.headers.get('Content-Type') || 'application/octet-stream'}})
  } catch {return new Response('Media source unavailable',{status:503,headers})}
}
