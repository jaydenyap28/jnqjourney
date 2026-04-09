import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureStorageBucket, getStorageBucketName } from '@/lib/server/storage-admin'

export const runtime = 'nodejs'

const bucketName = getStorageBucketName()

function sanitizeFileName(fileName: string) {
  const normalized = fileName.toLowerCase().replace(/\.[^.]+$/, '')
  return normalized.replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
}

function extensionForFile(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName

  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: '缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，无法上传图片。' },
      { status: 500 }
    )
  }

  const formData = await request.formData()
  const target = formData.get('target') === 'cover' ? 'cover' : 'gallery'
  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (!files.length) {
    return NextResponse.json({ error: '没有收到图片文件。' }, { status: 400 })
  }

  if (files.length > 12) {
    return NextResponse.json({ error: '单次最多上传 12 张图片。' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  try {
    await ensureStorageBucket(supabase, bucketName)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || `无法初始化 Storage bucket: ${bucketName}` },
      { status: 500 }
    )
  }

  const uploadedFiles = []

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: `文件 ${file.name} 不是图片。` }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: `文件 ${file.name} 超过 10MB 限制。` }, { status: 400 })
    }

    const fileExt = extensionForFile(file)
    const filePath = `${target}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}.${fileExt}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage.from(bucketName).upload(filePath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false,
    })

    if (error) {
      return NextResponse.json({ error: `上传 ${file.name} 失败: ${error.message}` }, { status: 500 })
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)

    uploadedFiles.push({
      name: file.name,
      path: filePath,
      url: data.publicUrl,
    })
  }

  return NextResponse.json({ files: uploadedFiles })
}



