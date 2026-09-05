import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifySpotRevalidation(body: string, signature: string, secret: string, now = Date.now()) {
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) throw new Error('Invalid maintenance signature')
  const expected = createHmac('sha256', secret).update(body).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new Error('Invalid maintenance signature')
  const payload = JSON.parse(body) as { slug: string; sha256: string; issuedAt: number }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug) || !/^[a-f0-9]{64}$/.test(payload.sha256) ||
      !Number.isFinite(payload.issuedAt) || Math.abs(now - payload.issuedAt) > 60_000) throw new Error('Invalid or expired revalidation payload')
  return payload
}
