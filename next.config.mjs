/** @type {import('next').NextConfig} */
import previewIsolation from './scripts/lib/preview-isolation-policy.cjs'

previewIsolation.assertPreviewIsolation(process.env)

function getHostname(value) {
  if (!value) return null

  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

const r2PublicHost = getHostname(process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) || 'pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev'

const nextConfig = {
  // Public boolean only; server write guards always use VERCEL_ENV directly.
  env: { JNQ_PREVIEW_READ_ONLY: process.env.VERCEL_ENV === 'preview' ? '1' : '0' },
  async headers() {
    return process.env.VERCEL_ENV === 'preview' ? [{
      source: '/:path*',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
    }] : []
  },
  images: {
    remotePatterns: [
      ...(r2PublicHost ? [{ protocol: 'https', hostname: r2PublicHost }] : []),
      { protocol: 'https', hostname: 'vrufunuomioczocdsoer.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'i.ibb.co' },
      { protocol: 'https', hostname: 'imgbb.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'graph.facebook.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
