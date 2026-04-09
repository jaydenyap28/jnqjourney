import { requireAdminRequest } from '@/lib/server/admin-auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isDirectImageUrl(urlString: string) {
  try {
    const url = new URL(urlString)
    return /\.(avif|gif|jpe?g|png|webp)$/i.test(url.pathname) || url.hostname.toLowerCase().startsWith('i.ibb.co')
  } catch {
    return false
  }
}

function normalizeUrl(value: string) {
  try {
    return new URL(String(value || '').trim()).toString()
  } catch {
    return null
  }
}

async function resolveImageUrl(sourceUrl: string) {
  if (isDirectImageUrl(sourceUrl)) return sourceUrl

  const response = await fetch(sourceUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.startsWith('image/')) {
    return sourceUrl
  }

  const html = await response.text()
  const metaMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)

  const resolved = normalizeUrl(metaMatch?.[1] || '')
  if (!resolved) {
    throw new Error('未解析到可显示图片')
  }

  return resolved
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response
  try {
    const body = await request.json()
    const urls: string[] = Array.isArray(body?.urls)
      ? Array.from(new Set(body.urls.map((item: unknown) => String(item || '').trim()).filter(Boolean)))
      : []

    if (!urls.length) {
      return NextResponse.json({ error: '没有收到可解析的图片链接。' }, { status: 400 })
    }

    const resolvedUrls: string[] = []
    const skipped: Array<{ sourceUrl: string; reason: string }> = []

    for (const sourceUrl of urls) {
      try {
        const normalizedSource = normalizeUrl(sourceUrl)
        if (!normalizedSource) {
          skipped.push({ sourceUrl, reason: '链接格式无效' })
          continue
        }

        const resolvedUrl = await resolveImageUrl(normalizedSource)
        resolvedUrls.push(resolvedUrl)
      } catch (error: any) {
        skipped.push({ sourceUrl, reason: error?.message || '解析失败' })
      }
    }

    if (!resolvedUrls.length) {
      return NextResponse.json(
        { error: skipped[0]?.reason || '没有解析到可用图片。', skipped },
        { status: 400 }
      )
    }

    return NextResponse.json({
      urls: Array.from(new Set(resolvedUrls)),
      skipped,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '图片链接解析失败。' }, { status: 500 })
  }
}




