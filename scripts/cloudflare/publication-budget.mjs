export const publicationBudget = Object.freeze({ daily: 8, monthly: 240, spacingMs: 600000 })

export function budgetBlockedUntil(attempts, now = Date.now()) {
  const date = new Date(now).toISOString()
  const stamps = attempts.map(row => row.startedAt)
  if (stamps.some(stamp => !Number.isFinite(Date.parse(stamp)))) throw Error('INVALID_LOCAL_PUBLICATION_LEDGER')
  const day = date.slice(0, 10)
  const month = date.slice(0, 7)
  let next = Math.max(0, ...stamps.map(stamp => Date.parse(stamp) + publicationBudget.spacingMs))
  if (stamps.filter(stamp => stamp.startsWith(day)).length >= publicationBudget.daily) {
    next = Math.max(next, Date.parse(day + 'T00:00:00Z') + 86400000)
  }
  if (stamps.filter(stamp => stamp.startsWith(month)).length >= publicationBudget.monthly) {
    const current = new Date(now)
    next = Math.max(next, Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1))
  }
  return next > now ? new Date(next).toISOString() : null
}
