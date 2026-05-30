import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  getR2PublicBaseUrl,
  getMissingR2EnvVars,
  uploadImageToR2,
} from '@/lib/server/r2'

export const runtime = 'nodejs'

// Deprecated: ImgBB/Supabase Storage upload disabled. Use Cloudflare R2 instead.
// Kept for older admin code paths; new uploads should call /api/upload/r2.

function collectFiles(formData: FormData) {
  return formData
    .getAll('files')
    .concat(formData.getAll('file'))
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  const missing = getMissingR2EnvVars()
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing Cloudflare R2 environment variables: ${missing.join(', ')}` },
      { status: 500 }
    )
  }

  const formData = await request.formData()
  const target = formData.get('target') === 'cover' ? 'cover' : 'gallery'
  const files = collectFiles(formData)

  if (!files.length) {
    return NextResponse.json({ error: '没有收到图片文件。' }, { status: 400 })
  }

  if (files.length > 12) {
    return NextResponse.json({ error: '单次最多上传 12 张图片。' }, { status: 400 })
  }

  const uploadedFiles = []

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: `文件 ${file.name} 不是支持的图片格式。` }, { status: 400 })
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image size exceeds 10MB limit.' }, { status: 400 })
    }

    try {
      const fileBuffer = Buffer.from(await file.arrayBuffer())
      const uploaded = await uploadImageToR2({
        body: fileBuffer,
        fileName: file.name,
        contentType: file.type,
        category: 'locations',
        field: target,
      })

      if (!uploaded.url.startsWith(`${getR2PublicBaseUrl()}/`)) {
        throw new Error(`R2 upload returned a non-R2 URL: ${uploaded.url}`)
      }

      if (uploaded.url.includes('supabase.co') || uploaded.url.includes('/storage/v1/object/public/') || uploaded.url.includes('location-images')) {
        throw new Error(`R2 upload returned a forbidden Supabase Storage URL: ${uploaded.url}`)
      }

      console.info('[admin:upload-image] uploaded image through R2 compatibility route', {
        fileName: uploaded.fileName,
        key: uploaded.key,
        url: uploaded.url,
        provider: uploaded.provider,
      })

      uploadedFiles.push({
        name: file.name,
        path: uploaded.key,
        key: uploaded.key,
        fileName: uploaded.fileName,
        url: uploaded.url,
        publicUrl: uploaded.publicUrl,
        provider: uploaded.provider,
      })
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || `上传 ${file.name} 失败。` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true, provider: 'cloudflare-r2', files: uploadedFiles })
}
