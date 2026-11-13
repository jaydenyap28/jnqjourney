import { FormalError } from './formal-runtime.mjs'
const prefix = '/admin-draft-media/'
const namePattern = /^[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/
const mediaFields = new Set(['image_url', 'imageUrl', 'coverImage', 'cover_image', 'image', 'src', 'images', 'gallery', 'image_metadata'])

export function mediaReferences(value) {
  const result = new Set()
  const add = text => { if (/^(?:https?:\/\/|\/)/.test(text)) result.add(text) }
  function walk(item, context = false) {
    if (typeof item === 'string') {
      if (context) add(item.trim())
      for (const match of item.matchAll(/\/admin-draft-media\/[^\s"'<>\\)]+/g)) add(match[0])
      for (const match of item.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) add(match[1])
    } else if (Array.isArray(item)) item.forEach(child => walk(child, context))
    else if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) {
      if (/^(?:https?:\/\/|\/)/.test(key)) add(key)
      walk(child, mediaFields.has(key) || context && ['url', 'src'].includes(key))
    }
  }
  walk(value)
  return [...result]
}

export function createFormalMediaChecks(media) {
  return {
    ...media,
    async verifyChanges(record, previous) {
      const old = new Set(mediaReferences(previous))
      const current = mediaReferences(record)
      const pending = new Set()
      for (const reference of current) {
        if (reference.startsWith(prefix)) {
          const name = reference.slice(prefix.length)
          if (!namePattern.test(name)) throw new FormalError(400, 'FORMAL_MEDIA_NAME_INVALID')
          pending.add(name)
        } else if (!old.has(reference) && reference !== '/placeholder-image.jpg') {
          throw new FormalError(422, 'FORMAL_NEW_MEDIA_MUST_USE_PRIVATE_UPLOAD')
        }
      }
      if (pending.size > 60) throw new FormalError(413, 'FORMAL_MEDIA_REFERENCE_LIMIT')
      // Only a server receipt established by full byte/signature/SHA checking
      // can authorize a live HEAD identity check. Build/preview always use get
      // and re-hash actual bytes. A browser flag or HEAD alone never suffices.
      for (const name of pending) await (media.verifyIdentity ? media.verifyIdentity(name) : media.get(name))
    },
  }
}
