// Preview public reads must honor test-project RLS, even if a secret was
// accidentally inherited. next.config also rejects that deployment configuration.
export function supabaseReadKey(serviceRoleRequired = false) {
  if (process.env.VERCEL_ENV === 'preview') {
    if (process.env.JNQ_PREVIEW_SUPABASE_PROJECT_REF !== 'rnamstwwbzknwbjwdgrf'
      || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://rnamstwwbzknwbjwdgrf.supabase.co') {
      throw new Error('Preview database configuration rejected.')
    }
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
  return process.env.SUPABASE_SERVICE_ROLE_KEY || (serviceRoleRequired ? undefined : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
