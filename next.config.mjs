// This validation branch can read the public snapshot CDN without R2 credentials.
const useIssue10PreviewCdn =
  process.env.VERCEL_ENV === 'preview' &&
  process.env.VERCEL_GIT_COMMIT_REF === 'codex/issue-10-shanghai-curated-links' &&
  !process.env.PUBLIC_DATA_CDN_BASE_URL &&
  !process.env.R2_PUBLIC_BASE_URL

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(useIssue10PreviewCdn ? {
    env: { PUBLIC_DATA_CDN_BASE_URL: 'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev' },
  } : {}),
  async headers() {
    return [{
      // Font directories are versioned; future font updates use a new path.
      source: '/fonts/:family/:version/:file',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }]
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'vrufunuomioczocdsoer.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'i.ibb.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'graph.facebook.com' },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
