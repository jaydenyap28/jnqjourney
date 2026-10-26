import { NextResponse } from 'next/server'
import { previewReadOnlyResponse } from '@/lib/preview-safety'

export async function GET(request: Request) {
  const blocked = previewReadOnlyResponse()
  if (blocked) return blocked
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  try {
    const res = await fetch(url, { method: 'HEAD' })
    const contentLength = res.headers.get('content-length')
    
    if (contentLength) {
      const sizeBytes = parseInt(contentLength, 10)
      return NextResponse.json({ size: sizeBytes })
    }

    return NextResponse.json({ size: null, error: 'No content-length header' })
  } catch (error) {
    return NextResponse.json({ size: null, error: 'Fetch failed' }, { status: 500 })
  }
}
