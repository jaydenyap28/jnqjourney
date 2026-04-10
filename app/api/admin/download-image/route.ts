import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'

function inferFileExtension(contentType?: string | null, sourceUrl?: string) {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('avif')) return 'avif'
  if (type.includes('svg')) return 'svg'
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'

  try {
    const pathname = new URL(String(sourceUrl || '')).pathname
    const matched = pathname.match(/\.([a-z0-9]{2,5})$/i)
    return matched?.[1] || 'jpg'
  } catch {
    return 'jpg'
  }
}

export async function GET(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const { searchParams } = new URL(request.url)
    const sourceUrl = String(searchParams.get('url') || '').trim()
    const requestedName = String(searchParams.get('filename') || '').trim()

    if (!sourceUrl) {
      return NextResponse.json({ error: 'Missing image url.' }, { status: 400 })
    }

    const remoteResponse = await fetch(sourceUrl, { cache: 'no-store' })
    if (!remoteResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${remoteResponse.status}` }, { status: 502 })
    }

    const contentType = remoteResponse.headers.get('content-type') || 'application/octet-stream'
    const extension = inferFileExtension(contentType, sourceUrl)
    const safeBaseName = (requestedName || 'jnq-image')
      .replace(/[^\w\-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'jnq-image'
    const filename = safeBaseName.includes('.') ? safeBaseName : `${safeBaseName}.${extension}`

    const arrayBuffer = await remoteResponse.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to download image.' }, { status: 500 })
  }
}
