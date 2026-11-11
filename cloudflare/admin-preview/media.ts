import { MEDIA_NAME, MEDIA_PREFIX } from './scope.mjs'
import { AdminError } from './store.ts'

// Reuse the Spot pilot's isolated R2 bucket and SigV4 scope. All requests
// stay server-side. Drafts use a separate prefix with no public route.
const HOST = '41feff7cd62964f2eb33bb82508509a1.r2.cloudflarestorage.com'
const BUCKET = 'jnqjourney-spot-loop-isolated-media'
const MAX_IMAGE = 10 * 1024 * 1024
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('')
const hash = async (bytes: Uint8Array<ArrayBuffer>) => hex(await crypto.subtle.digest('SHA-256', bytes))

async function sign(key: BufferSource, text: string) {
  const secret = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', secret, encoder.encode(text))
}

function imageMatches(bytes: Uint8Array, ext: string) {
  if (bytes.length < 12) return false
  const signature = String.fromCharCode(...bytes.subarray(0, 12))
  if (ext === 'png') return bytes.subarray(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  if (ext === 'jpg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (ext === 'gif') return /^GIF8[79]a/.test(signature)
  return ext === 'webp' && signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
}

export function createDraftMedia(env: (key: string) => string | undefined) {
  async function request(method: 'GET' | 'PUT' | 'HEAD', name: string, bytes?: Uint8Array<ArrayBuffer>) {
    if (!MEDIA_NAME.test(name)) throw new AdminError(400, '图片标识无效。')
    const access = env('CANDIDATE_R2_ACCESS_KEY_ID')
    const secret = env('CANDIDATE_R2_SECRET_ACCESS_KEY')
    if (!access || !secret) throw new AdminError(503, '隔离 R2 未配置。')
    const path = `/${BUCKET}/_admin-drafts/${name}`
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
    const day = date.slice(0, 8)
    const scope = `${day}/auto/s3/aws4_request`
    const digest = bytes ? name.slice(0, 64) : await hash(new Uint8Array())
    const headers: Record<string, string> = {
      host: HOST, 'x-amz-content-sha256': digest, 'x-amz-date': date,
    }
    if (bytes) headers['content-type'] = MIME[name.split('.').at(-1) as keyof typeof MIME]
    const names = Object.keys(headers).sort()
    const canonical = [method, path, '', names.map(key => `${key}:${headers[key]}\n`).join(''), names.join(';'), digest].join('\n')
    let signingKey = await sign(encoder.encode('AWS4' + secret), day)
    for (const part of ['auto', 's3', 'aws4_request']) signingKey = await sign(signingKey, part)
    const signature = hex(await sign(signingKey, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await hash(encoder.encode(canonical))}`))
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
    delete headers.host
    return fetch('https://' + HOST + path, {
      method, headers, body: bytes, redirect: 'error', signal: AbortSignal.timeout(15000),
    })
  }

  async function get(name: string) {
    const response = await request('GET', name)
    const length = Number(response.headers.get('content-length'))
    if (!response.ok || !length || length > MAX_IMAGE) {
      await response.body?.cancel()
      throw new AdminError(response.status === 404 ? 404 : 503, '图片无法读取。')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length !== length || await hash(bytes) !== name.slice(0, 64)) {
      throw new AdminError(503, '图片字节未通过校验。')
    }
    return { bytes, type: MIME[name.split('.').at(-1) as keyof typeof MIME] }
  }

  async function upload(req: Request) {
    const declared = Number(req.headers.get('content-length'))
    if (declared > MAX_IMAGE + 65536) throw new AdminError(413, '图片不得超过 10 MB。')
    // Consume a bounded body even if the transport omitted Content-Length.
    const reader = req.body?.getReader()
    if (!reader) throw new AdminError(400, '缺少图片。')
    const parts: Uint8Array<ArrayBuffer>[] = []
    let length = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_IMAGE + 65536) {
        await reader.cancel()
        throw new AdminError(413, '图片不得超过 10 MB。')
      }
      parts.push(new Uint8Array(value))
    }
    const form = await new Response(new Blob(parts), {
      headers: { 'Content-Type': req.headers.get('content-type') || '' },
    }).formData()
    const file = form.get('files') ?? form.get('file')
    if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE) throw new AdminError(400, '请提供有效图片文件。')
    const ext = Object.entries(MIME).find(([, mime]) => mime === file.type)?.[0]
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!ext || !imageMatches(bytes, ext)) throw new AdminError(415, '仅支持真实的 JPEG、PNG、WebP 或 GIF 图片。')
    const name = `${await hash(bytes)}.${ext}`
    const result = await request('PUT', name, bytes)
    await result.body?.cancel()
    if (!result.ok) throw new AdminError(503, '隔离 R2 上传失败。')
    await get(name)
    return { url: MEDIA_PREFIX + name, key: '_admin-drafts/' + name, size: file.size }
  }

  async function verifyReferences(record: unknown) {
    const names = new Set([...JSON.stringify(record).matchAll(/\/admin-draft-media\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g)].map(match => match[1]))
    if (names.size > 60) throw new AdminError(400, '一次保存最多关联 60 张草稿图片。')
    for (const name of names) {
      const response = await request('HEAD', name)
      const length = Number(response.headers.get('content-length'))
      if (!response.ok || !length || length > MAX_IMAGE) throw new AdminError(409, '关联图片缺失，请重新上传。')
    }
  }
  return { get, upload, verifyReferences }
}
