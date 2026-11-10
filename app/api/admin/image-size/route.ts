import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
export const dynamic = 'force-dynamic'
const headers={'Cache-Control':'private, no-store, max-age=0'}
export async function GET(request: Request) {
  const auth=await requireAdminRequest(request)
  if (!auth.ok) return auth.response
  const raw=new URL(request.url).searchParams.get('url')
  if (!raw) return NextResponse.json({error:'URL is required'},{status:400,headers})
  try {
    const gateway=process.env.JNQ_PUBLIC_FEED_ORIGIN
    let target: URL
    if(gateway){
      if(gateway!=='https://codex-p0-consumers.jnqjourney-spot-loop-migration-candidate.pages.dev')throw Error('scope')
      target=new URL(raw,gateway)
      if(target.origin!==gateway||target.username||target.password||!/^\/media\/candidate\/9206[12]\/[a-f0-9-]{36}\.png$/.test(target.pathname)||target.search)throw Error('scope')
    }else{
      target=new URL(raw)
      const allowed=[process.env.R2_PUBLIC_BASE_URL,process.env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean).map(base=>new URL(base!).origin)
      if(target.protocol!=='https:'||!allowed.includes(target.origin)||target.username||target.password)throw Error('scope')
    }
    const response=await fetch(target,{method:'HEAD',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)})
    if(!response.ok)return NextResponse.json({size:null,error:'Image unavailable'},{status:response.status===404?404:503,headers})
    const length=response.headers.get('content-length'),size=length&&/^\d+$/.test(length)?Number(length):null
    return NextResponse.json({size:Number.isSafeInteger(size)?size:null},{headers})
  }catch{return NextResponse.json({size:null,error:'Unsupported or unavailable image'},{status:400,headers})}
}
