export function getConfiguredR2PublicBaseUrl() {
  const env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}
  return (env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

export function isSupabaseStorageImageUrl(url: string) {
  return (
    url.includes('supabase.co') ||
    url.includes('/storage/v1/object/public/') ||
    url.includes('location-images')
  )
}

export function isR2ImageUrl(url: string) {
  const baseUrl = getConfiguredR2PublicBaseUrl()
  if (baseUrl) return url.startsWith(`${baseUrl}/`)
  return /\.r2\.dev\//i.test(url) || /cloudflarestorage\.com/i.test(url)
}

export function assertR2ImageUrl(url: string) {
  const value = String(url || '').trim()
  if (!value) return

  if (isSupabaseStorageImageUrl(value)) {
    throw new Error(`Blocked Supabase Storage image URL: ${value}`)
  }

  const baseUrl = getConfiguredR2PublicBaseUrl()
  if (baseUrl && !value.startsWith(`${baseUrl}/`)) {
    throw new Error(`Image URL is not from Cloudflare R2: ${value}`)
  }
}
