/** IDs returned by the same PostgREST write avoid a racy pre-count. */
export function mutationOutcome(expectedIds: number[] | number, rows: unknown) {
  const affectedIds = Array.isArray(rows) ? [...new Set(rows.map(row => Number(row?.id)).filter(id => Number.isSafeInteger(id) && id > 0))] : []
  const requestedIds = Array.isArray(expectedIds) ? [...new Set(expectedIds)] : undefined
  const expected = requestedIds?.length ?? expectedIds as number
  const missingIds = requestedIds?.filter(id => !affectedIds.includes(id)) || []
  const confirmed = Array.isArray(rows) && rows.length === affectedIds.length && affectedIds.length <= expected
    && (!requestedIds || affectedIds.every(id => requestedIds.includes(id)))
  const state = !confirmed ? 'unknown' : affectedIds.length === expected ? 'complete' : affectedIds.length ? 'partial' : 'failed'
  return { state, expected, affected: affectedIds.length, affectedIds, missingIds }
}
