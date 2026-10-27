// Pure configuration check. Never include environment values in diagnostics.
// Only the standard Vercel Preview environment is affected.
function assertPreviewIsolation(env) {
  if (env.VERCEL_ENV !== 'preview') return
  const issues = []
  const forbidden = ['SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
    'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'JNQ_BUDGET_SYNC_SECRET', 'OPENAI_API_KEY']
  for (const name of forbidden) if (String(env[name] || '').trim()) issues.push(`${name}: must be absent in Preview`)
  const ref = String(env.JNQ_PREVIEW_SUPABASE_PROJECT_REF || '')
  if (!/^[a-z0-9]{20}$/.test(ref) || ref === 'vrufunuomioczocdsoer') {
    issues.push('JNQ_PREVIEW_SUPABASE_PROJECT_REF: dedicated test project required')
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) {
    issues.push('NEXT_PUBLIC_SUPABASE_URL: must match the dedicated test project')
  }
  const publicKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  let publicKeyType = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)
  if (!publicKeyType) {
    try {
      const parts = publicKey.split('.')
      publicKeyType = parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon'
    } catch {}
  }
  if (!publicKeyType) issues.push('NEXT_PUBLIC_SUPABASE_ANON_KEY: test publishable or legacy anon key required')
  const deployment = String(env.VERCEL_URL || '')
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(deployment)) issues.push('VERCEL_URL: exact Preview deployment required')
  for (const name of ['NEXT_PUBLIC_SITE_URL', 'SITE_URL']) {
    if (env[name] && String(env[name]).replace(/\/+$/, '') !== `https://${deployment}`) issues.push(`${name}: unset or use exact Preview origin`)
  }
  const sourceNames = ['PUBLIC_DATA_CDN_BASE_URL', 'R2_PUBLIC_BASE_URL', 'NEXT_PUBLIC_R2_PUBLIC_BASE_URL']
  if (sourceNames.some(name => env[name])) {
    let allowed
    try {
      const url = new URL(env.JNQ_PREVIEW_PUBLIC_DATA_ORIGIN)
      const prohibited = ['jnqjourney.com', 'www.jnqjourney.com', 'pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev', 'vrufunuomioczocdsoer.supabase.co']
      if (url.protocol === 'https:' && !url.username && !url.password && url.origin === env.JNQ_PREVIEW_PUBLIC_DATA_ORIGIN && !prohibited.includes(url.hostname)) allowed = url.origin
    } catch {}
    if (!allowed) issues.push('JNQ_PREVIEW_PUBLIC_DATA_ORIGIN: independent public test-storage origin required')
    for (const name of sourceNames) {
      if (!env[name]) continue
      try {
        const url = new URL(env[name])
        if (!allowed || url.origin !== allowed || url.username || url.password || url.search || url.hash) throw Error()
      } catch { issues.push(`${name}: must use the approved test-storage origin without credentials or query`) }
    }
  }
  if (issues.length) throw new Error(`Preview isolation configuration rejected:\n${issues.join('\n')}`)
}
module.exports = { assertPreviewIsolation }
