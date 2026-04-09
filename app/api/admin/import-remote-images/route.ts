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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalizeCandidateUrl(raw: string, baseUrl?: string) {
  const decoded = decodeHtml(raw)
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u002F/g, '/')
    .replace(/\\u003A/g, ':')
    .replace(/\\\//g, '/')
    .replace(/^u003C/, '')
    .replace(/^\"+|\"+$/g, '')
    .trim()

  const resolved = decoded.startsWith('//')
    ? `https:${decoded}`
    : decoded.startsWith('http')
      ? decoded
      : baseUrl
        ? new URL(decoded, baseUrl).toString()
        : null

  if (!resolved) return null

  try {
    return new URL(resolved).toString()
  } catch {
    return null
  }
}

function isLikelyFacebookImage(urlString: string) {
  try {
    const url = new URL(urlString)
    const host = url.hostname.toLowerCase()
    const value = url.toString().toLowerCase()

    if (!host.includes('fbcdn.net') && !host.includes('facebook.com') && !host.includes('fbsbx.com')) {
      return false
    }

    if (host.includes('static.xx.fbcdn.net')) return false
    if (value.includes('emoji.php')) return false
    if (value.includes('safe_image.php')) return false
    if (value.includes('/rsrc.php/')) return false
    if (value.includes('profile_pic')) return false

    return true
  } catch {
    return false
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function remoteImageFingerprint(urlString: string) {
  try {
    const url = new URL(urlString)
    if (url.search) return url.toString()
    return `${url.hostname.toLowerCase()}${url.pathname}`
  } catch {
    return urlString
  }
}

function dedupeRemoteUrls(urls: string[]) {
  const seen = new Set<string>()
  return urls.filter((url) => {
    const fingerprint = remoteImageFingerprint(url)
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

function extensionFromType(contentType: string, fallbackUrl: string) {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'

  try {
    const url = new URL(fallbackUrl)
    const ext = url.pathname.split('.').pop()?.toLowerCase()
    if (ext && /^[a-z0-9]+$/.test(ext)) return ext
  } catch {
    return 'jpg'
  }

  return 'jpg'
}

function extractImageUrls(html: string, baseUrl?: string) {
  const patterns: RegExp[] = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi,
    /<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi,
    /"image":\{"uri":"([^"]+)"/gi,
    /"image_url":"([^"]+)"/gi,
    /"thumbnailImage":\{"uri":"([^"]+)"/gi,
    /(https:\\\/\\\/[^"'<>\\]+(?:fbcdn\.net|fbsbx\.com)[^"'<>\\]*)/gi,
    /(https:\/\/[^"'<>]+(?:fbcdn\.net|fbsbx\.com)[^"'<>]*)/gi,
  ]

  return unique(
    patterns.flatMap((pattern) =>
      Array.from(html.matchAll(pattern))
        .map((match) => normalizeCandidateUrl(match[1], baseUrl))
        .filter((value): value is string => Boolean(value))
    )
  )
    .filter(isLikelyFacebookImage)
    .slice(0, 8)
}

async function fetchRemote(url: string) {
  return fetch(url, {
    headers: {
      referer: 'https://www.facebook.com/',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
    cache: 'no-store',
  })
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: '?? NEXT_PUBLIC_SUPABASE_URL ? SUPABASE_SERVICE_ROLE_KEY????????' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const urls = Array.isArray(body?.urls)
      ? dedupeRemoteUrls(body.urls.map((item: unknown) => String(item || '').trim()).filter(Boolean))
      : []

    if (!urls.length) {
      return NextResponse.json({ error: '???????????' }, { status: 400 })
    }

    if (urls.length > 60) {
      return NextResponse.json({ error: '?????? 60 ????' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await ensureStorageBucket(supabase, bucketName)

    const files: Array<{ sourceUrl: string; resolvedSourceUrl: string; url: string; path: string }> = []
    const skipped: Array<{ sourceUrl: string; reason: string }> = []

    for (const [index, sourceUrl] of urls.entries()) {
      let resolvedSourceUrl = sourceUrl
      let remoteResponse = await fetchRemote(resolvedSourceUrl)

      if (!remoteResponse.ok) {
        skipped.push({ sourceUrl, reason: `HTTP ${remoteResponse.status}` })
        continue
      }

      let contentType = remoteResponse.headers.get('content-type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) {
        const html = await remoteResponse.text()
        const fallbackImageUrl = extractImageUrls(html, resolvedSourceUrl)[0]

        if (fallbackImageUrl) {
          resolvedSourceUrl = fallbackImageUrl
          remoteResponse = await fetchRemote(resolvedSourceUrl)

          if (!remoteResponse.ok) {
            skipped.push({ sourceUrl, reason: `fallback HTTP ${remoteResponse.status}` })
            continue
          }

          contentType = remoteResponse.headers.get('content-type') || 'image/jpeg'
        }
      }

      if (!contentType.startsWith('image/')) {
        skipped.push({ sourceUrl, reason: `not-image (${contentType})` })
        continue
      }

      const arrayBuffer = await remoteResponse.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      if (fileBuffer.length > 10 * 1024 * 1024) {
        skipped.push({ sourceUrl, reason: 'file-too-large' })
        continue
      }

      const fileExt = extensionFromType(contentType, resolvedSourceUrl)
      const filePath = `imported/facebook/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${index + 1}-${sanitizeFileName(`facebook-${index + 1}`)}.${fileExt}`

      const { error } = await supabase.storage.from(bucketName).upload(filePath, fileBuffer, {
        contentType,
        cacheControl: '31536000',
        upsert: false,
      })

      if (error) {
        skipped.push({ sourceUrl, reason: `upload-failed (${error.message})` })
        continue
      }

      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)

      files.push({
        sourceUrl,
        resolvedSourceUrl,
        url: data.publicUrl,
        path: filePath,
      })
    }

    if (!files.length) {
      const reason = skipped[0]?.reason || 'unknown'
      return NextResponse.json(
        { error: `??????????????????${reason}`, skipped },
        { status: 400 }
      )
    }

    return NextResponse.json({ files, skipped })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '???????????????' },
      { status: 500 }
    )
  }
}
