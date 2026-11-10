import './assert-server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PublicReadUnavailable, PUBLIC_READ_LIMITS } from './public-spot-projection'
import { controlledMediaValue } from '@/lib/controlled-media'
export { PublicReadUnavailable, PUBLIC_READ_LIMITS, publicServiceClient, readPublicRows, validatePublicRows } from './public-spot-projection'

const FEEDS = new Set(['regions.json', 'guides.json', 'notes.json', 'guide-trip-costs.json', 'i18n/en/records.json'])
export async function readPrivatePublicFeed<T>(key: string): Promise<T> {
  if (!FEEDS.has(key)) throw new PublicReadUnavailable()
  const gateway = process.env.JNQ_PUBLIC_FEED_ORIGIN
  if (gateway) {
    const origin = new URL(gateway)
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.jnqjourney-spot-loop-migration-candidate.pages.dev') || origin.pathname !== '/' || origin.search || origin.hash) throw new PublicReadUnavailable()
    const response = await fetch(`${origin.origin}/public-data/${key}`, {cache:'no-store', redirect:'manual', signal:AbortSignal.timeout(8000)})
    if (!response.ok) throw new PublicReadUnavailable()
    return controlledMediaValue(await response.json()) as T
  }
  const { R2_ACCOUNT_ID: account, R2_BUCKET_NAME: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
  if (!account || !bucket || !accessKeyId || !secretAccessKey) throw new PublicReadUnavailable()
  const client = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } })
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `public-data/${key}` }), { abortSignal: AbortSignal.timeout(8000) })
    if (!object.Body || !object.ContentLength || object.ContentLength > PUBLIC_READ_LIMITS.feedBytes) throw new PublicReadUnavailable()
    const bytes = await object.Body.transformToByteArray()
    if (bytes.length !== object.ContentLength) throw new PublicReadUnavailable()
    return controlledMediaValue(JSON.parse(new TextDecoder().decode(bytes))) as T
  } catch { throw new PublicReadUnavailable() } finally { client.destroy() }
}
