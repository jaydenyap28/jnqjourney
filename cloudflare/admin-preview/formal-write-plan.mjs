// Pure preparation only. Not imported by the deployed read-only Edge.
// The caller must implement server Auth, media checks and conditional DB writes
// in a separately approved release. This module never performs an I/O operation.
import { validateSpotFields, validVersion } from '../spot-loop/spot-contract.mjs'

const version = (request, key = 'expectedUpdatedAt') => {
  if (!Object.hasOwn(request, key) || !validVersion(request[key])) throw Error('FORMAL_VERSION_REQUIRED')
  return request[key]
}
export function planFormalSpotMutation(method, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('FORMAL_REQUEST_INVALID')
  if (method === 'POST') {
    if (Object.hasOwn(request, 'id') || Object.hasOwn(request.data || {}, 'id')) throw Error('FORMAL_IDENTITY_ALLOCATED_BY_DATABASE')
    const values = validateSpotFields({ ...request.data, publication_status: 'draft' })
    if (!values.name) throw Error('FORMAL_NAME_REQUIRED')
    return { operation: 'insert', values, databaseGeneratedId: true, publish: false }
  }
  if (!['PATCH', 'HIDE'].includes(method) || !Number.isSafeInteger(request.id) || request.id < 1 ||
      request.id >= 92000 && request.id <= 92999 || request.id >= 95000 && request.id <= 95099) throw Error('FORMAL_RECORD_ID_INVALID_OR_RESERVED')
  const expected = version(request)
  const values = method === 'HIDE' ? { publication_status: 'hidden' } : validateSpotFields(request.data)
  return { operation: 'update', id: request.id, values,
    versionPredicate: expected === null ? { column: 'updated_at', operator: 'is', value: null } :
      { column: 'updated_at', operator: 'eq', value: expected },
    requireExactlyOneRow: true, updateVersionServerSide: true, publish: false }
}

export function assertFormalAuthorityVersion(current, expectedUpdatedAt) {
  // An absent version is not the same as SQL/JSON null. No blind overwrite.
  if (!current || !Object.hasOwn(current, 'updatedAt') || !validVersion(current.updatedAt) ||
      !validVersion(expectedUpdatedAt) || current.updatedAt !== expectedUpdatedAt) throw Error('FORMAL_AUTHORITY_CONFLICT')
  return true
}
