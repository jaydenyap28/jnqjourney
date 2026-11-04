// Pure configuration check. Never include environment values in diagnostics.
const PREVIEW_REF = 'rnamstwwbzknwbjwdgrf'
const PREVIEW_BRANCH = 'codex/jnq-preview-cpu'

function assertPreviewIsolation(env) {
  if (env.VERCEL_ENV !== 'preview' && env.VERCEL_TARGET_ENV !== 'preview' && env.VERCEL_GIT_COMMIT_REF !== PREVIEW_BRANCH) return
  const issues = []
  if (env.VERCEL_ENV !== 'preview' || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== 'preview')) {
    issues.push('VERCEL_ENV: standard Preview target required')
  }
  const forbidden = ['SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
    'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'JNQ_BUDGET_SYNC_SECRET', 'OPENAI_API_KEY',
    'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'YOUTUBE_API_KEY', 'NEXT_PUBLIC_YOUTUBE_API_KEY',
    'NEXT_PUBLIC_MAPBOX_TOKEN', 'PUBLIC_DATA_CDN_BASE_URL', 'R2_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_R2_PUBLIC_BASE_URL', 'JNQ_PREVIEW_PUBLIC_DATA_ORIGIN']
  for (const name of forbidden) if (String(env[name] || '').trim()) issues.push(`${name}: must be absent in Preview`)
  const ref = String(env.JNQ_PREVIEW_SUPABASE_PROJECT_REF || '')
  if (ref !== PREVIEW_REF) {
    issues.push('JNQ_PREVIEW_SUPABASE_PROJECT_REF: dedicated test project required')
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${PREVIEW_REF}.supabase.co`) {
    issues.push('NEXT_PUBLIC_SUPABASE_URL: must match the dedicated test project')
  }
  const publicKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  let publicKeyType = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)
  if (!publicKeyType) {
    try {
      const parts = publicKey.split('.')
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      publicKeyType = parts.length === 3 && claims.role === 'anon' && claims.ref === PREVIEW_REF
    } catch {}
  }
  if (!publicKeyType) issues.push('NEXT_PUBLIC_SUPABASE_ANON_KEY: test publishable or legacy anon key required')
  const deployment = String(env.VERCEL_URL || '')
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(deployment)) issues.push('VERCEL_URL: exact Preview deployment required')
  for (const name of ['NEXT_PUBLIC_SITE_URL', 'SITE_URL']) {
    if (env[name] && String(env[name]).replace(/\/+$/, '') !== `https://${deployment}`) issues.push(`${name}: unset or use exact Preview origin`)
  }
  if (issues.length) throw new Error(`Preview isolation configuration rejected:\n${issues.join('\n')}`)
}
module.exports = { assertPreviewIsolation }
