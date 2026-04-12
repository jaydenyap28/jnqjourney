import { NextResponse } from 'next/server'
import archiver from 'archiver'
import { PassThrough } from 'node:stream'
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

function sanitizeBaseName(value: string, fallback: string) {
  return (String(value || '').trim() || fallback)
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminRequest(request)
  if (!adminCheck.ok) return adminCheck.response

  try {
    const body = await request.json().catch(() => ({}))
    const urls = Array.isArray(body?.urls) ? body.urls.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
    const baseName = sanitizeBaseName(String(body?.baseName || ''), 'gallery')

    if (!urls.length) {
      return NextResponse.json({ error: 'No gallery images were provided.' }, { status: 400 })
    }

    const archive = archiver('zip', { zlib: { level: 9 } })
    const output = new PassThrough()
    const failures: string[] = []

    archive.on('warning', (error) => {
      if (error?.code !== 'ENOENT') {
        output.destroy(error)
      }
    })

    archive.on('error', (error) => {
      output.destroy(error)
    })

    archive.pipe(output)

    let appendedCount = 0

    for (let index = 0; index < urls.length; index += 1) {
      const sourceUrl = urls[index]

      try {
        const remoteResponse = await fetch(sourceUrl, { cache: 'no-store' })
        if (!remoteResponse.ok) {
          failures.push(`${index + 1}. ${sourceUrl} -> HTTP ${remoteResponse.status}`)
          continue
        }

        const contentType = remoteResponse.headers.get('content-type') || 'application/octet-stream'
        const extension = inferFileExtension(contentType, sourceUrl)
        const filename = `${baseName}-${String(index + 1).padStart(2, '0')}.${extension}`
        const arrayBuffer = await remoteResponse.arrayBuffer()
        archive.append(Buffer.from(arrayBuffer), { name: filename })
        appendedCount += 1
      } catch (error: any) {
        failures.push(`${index + 1}. ${sourceUrl} -> ${error?.message || 'Download failed'}`)
      }
    }

    if (!appendedCount) {
      return NextResponse.json({ error: 'None of the gallery images could be downloaded.' }, { status: 502 })
    }

    if (failures.length) {
      archive.append(
        `Some images could not be downloaded.\n\n${failures.join('\n')}\n`,
        { name: '_download-report.txt' }
      )
    }

    await archive.finalize()

    return new NextResponse(output as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${baseName}-gallery.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to build gallery archive.' }, { status: 500 })
  }
}
