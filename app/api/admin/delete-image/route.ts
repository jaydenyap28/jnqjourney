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

  const { url } = await request.json().catch(() => ({}))
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: '无效的图片 URL。' }, { status: 400 })
  }

  // Ensure this is a Supabase URL and part of our bucket
  if (!url.includes('supabase.co') || !url.includes(`/object/public/${bucketName}/`)) {
    return NextResponse.json({ error: '该图片并非原生存储在当前的 Supabase 云空间内，仅会在表单中被移除。' }, { status: 400 })
  }

  try {
    // Extract the object path from the public URL
    const searchStr = `/object/public/${bucketName}/`
    const pathIndex = url.indexOf(searchStr)
    const filePath = decodeURIComponent(url.slice(pathIndex + searchStr.length).split('#')[0])

    if (!filePath) {
      return NextResponse.json({ error: '无法解析文件路径。' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { error } = await supabase.storage.from(bucketName).remove([filePath])
    
    if (error) {
      return NextResponse.json({ error: `删除失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: '图片已从 Supabase 云空间彻底删除。' })
  } catch (error: any) {
    return NextResponse.json({ error: `服务器内部错误: ${error.message || '未知错误'}` }, { status: 500 })
  }
}
