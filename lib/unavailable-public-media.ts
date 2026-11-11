// Presentation-only evidence of a missing public source, not a revocation ACL.
// Exact price-info reference in Spot 232, confirmed by HEAD + GET 404.
const missingPriceBoard = 'https://i.ibb.co/r2FHQynR/Chat-GPT-Image-Apr-8-2026-04-05-23-PM.png'

export function isConfirmedUnavailablePublicImage(value: string) {
  try {
    const url = new URL(value)
    url.hash = '' // A crop/focus fragment does not change the source object.
    return url.href === missingPriceBoard
  } catch {
    return false
  }
}
