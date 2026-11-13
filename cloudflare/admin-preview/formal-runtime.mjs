import { FORMAL_PROJECT } from './formal-admin-read.mjs'

// This release cannot be activated just by changing remote environment values.
// Each capability needs its own approved release + explicit server setting.
export const FORMAL_RELEASE_GATES = Object.freeze({ writes: false, uploads: false, publication: false })
export const FORMAL_PRIVATE_SCOPE = Object.freeze({
  projectRef: FORMAL_PROJECT, storageBucket: 'jnq-admin-formal-publication',
  mediaBucket: 'jnqjourney-admin-private-media', mediaPrefix: '_admin-formal-drafts',
  origin: 'https://read-only.jnqjourney-admin-formal.pages.dev',
})
export class FormalError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
export function assertFormalScope(scope) {
  for (const [key, value] of Object.entries(FORMAL_PRIVATE_SCOPE)) {
    if (scope?.[key] !== value) throw new FormalError(503, 'FORMAL_SCOPE_MISMATCH')
  }
}
export function requireCapability(name, gates, settings) {
  if (!['writes', 'uploads', 'publication'].includes(name) || gates?.[name] !== true || settings?.[name] !== true) {
    throw new FormalError(405, 'FORMAL_CAPABILITY_OFF')
  }
}
