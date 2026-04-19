import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStorageBucketName } from '@/lib/server/storage-admin'

export const runtime = 'nodejs'

const bucketName = getStorageBucketName()

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: '缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。' },
      { status: 500 }
    )
  }

  const body = await request.json().catch(() => ({}))
  
  let urlsToDelete: string[] = []
  if (body.url && typeof body.url === 'string') {
    urlsToDelete.push(body.url)
  } else if (Array.isArray(body.urls)) {
    urlsToDelete = body.urls.filter((u: any) => typeof u === 'string')
  }

  if (urlsToDelete.length === 0) {
    return NextResponse.json({ error: '没有提供需要删除的图片 URL。' }, { status: 400 })
  }

  const paths: string[] = []
  for (const url of urlsToDelete) {
    if (!url.includes('supabase.co') || !url.includes(`/object/public/${bucketName}/`)) {
      continue
    }
    const searchStr = `/object/public/${bucketName}/`
    const pathIndex = url.indexOf(searchStr)
    const filePath = decodeURIComponent(url.slice(pathIndex + searchStr.length).split('#')[0])
    if (filePath) {
      paths.push(filePath)
    }
  }

  if (paths.length === 0) {
    // If none of the URLs are supabase URLs, return success but 0 count, 
    // since they just aren't managed by Supabase storage (e.g. imgbb).
    return NextResponse.json({ success: true, count: 0, message: '这些图片并非原生存储，无需云端删除。' })
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { error, data } = await supabase.storage.from(bucketName).remove(paths)
    
    if (error) {
      return NextResponse.json({ error: `删除失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      count: data?.length || paths.length, 
      message: `已从 Supabase 云空间彻底删除 ${data?.length || paths.length} 张图片。` 
    })
  } catch (error: any) {
    return NextResponse.json({ error: `服务器内部错误: ${error.message || '未知错误'}` }, { status: 500 })
  }
}
