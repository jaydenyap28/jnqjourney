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

function formValue(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function collectFiles(formData: FormData) {
  const files = [
    ...formData.getAll('file'),
    ...formData.getAll('files'),
  ].filter((entry): entry is File => entry instanceof File && entry.size > 0)

  return Array.from(new Set(files))
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  const missing = getMissingR2EnvVars()
  if (missing.length) {
    return NextResponse.json(
      { success: false, error: `Missing Cloudflare R2 environment variables: ${missing.join(', ')}` },
      { status: 500 }
    )
  }

  const formData = await request.formData()
  const files = collectFiles(formData)

  if (!files.length) {
    return NextResponse.json({ success: false, error: 'No image file was provided.' }, { status: 400 })
  }

  if (files.length > 60) {
    return NextResponse.json({ success: false, error: 'You can upload at most 60 images at once.' }, { status: 400 })
  }

  const category = formValue(formData, 'category')
  const country = formValue(formData, 'country')
  const city = formValue(formData, 'city')
  const locationSlug = formValue(formData, 'locationSlug')
  const field = formValue(formData, 'field')
  const target = formValue(formData, 'target')
  const uploadField = field || target

  const items = []

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported image type for ${file.name}. Only JPEG, PNG, WebP, and GIF are allowed.` },
        { status: 400 }
      )
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ success: false, error: 'Image size exceeds 10MB limit.' }, { status: 400 })
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const item = await uploadImageToR2({
        body: buffer,
        fileName: file.name,
        contentType: file.type,
        category,
        country,
        city,
        locationSlug,
        field: uploadField,
      })

      if (!item.url.startsWith(`${getR2PublicBaseUrl()}/`)) {
        throw new Error(`R2 upload returned a non-R2 URL: ${item.url}`)
      }

      if (item.url.includes('supabase.co') || item.url.includes('/storage/v1/object/public/')) {
        throw new Error(`R2 upload returned a Supabase URL: ${item.url}`)
      }

      console.info('[upload:r2] response url:', item.url)
      console.info('[upload:r2] uploaded image', {
        fileName: item.fileName,
        key: item.key,
        url: item.url,
        provider: item.provider,
      })

      items.push(item)
    } catch (error: any) {
      return NextResponse.json(
        { success: false, error: error?.message || `Failed to upload ${file.name}.` },
        { status: 500 }
      )
    }
  }

  if (items.length === 1) {
    const item = items[0]
    return NextResponse.json({
      success: true,
      url: item.url,
      publicUrl: item.publicUrl,
      key: item.key,
      fileName: item.fileName,
      provider: item.provider,
      urls: [item.url],
      items,
      files: items,
    })
  }

  return NextResponse.json({
    success: true,
    urls: items.map((item) => item.url),
    provider: 'cloudflare-r2',
    items,
    files: items,
  })
}
