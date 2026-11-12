import { FORMAL_PROJECT } from './formal-admin-read.mjs'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function verifiedFormalIdentity(token, getUser) {
  if (typeof token !== 'string' || token.length > 8192) return null
  let claims
  try {
    const encoded = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
    claims = JSON.parse(atob(encoded))
  } catch { return null }
  if (claims.iss !== `https://${FORMAL_PROJECT}.supabase.co/auth/v1` ||
      claims.role !== 'authenticated' || claims.aud !== 'authenticated' ||
      !uuid.test(claims.sub || '') || !uuid.test(claims.session_id || '') ||
      claims.session_id === '00000000-0000-0000-0000-000000000000' ||
      !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return null
  // Decoded claims only narrow the accepted token format. Auth verifies the
  // signature and loads the current user/session on every request.
  const user = await getUser(token)
  return user?.id === claims.sub && user.role === 'authenticated' &&
    !user.is_anonymous && user.email_confirmed_at ? user.id : null
}
