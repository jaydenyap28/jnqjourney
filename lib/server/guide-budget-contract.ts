import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import {
  GUIDE_BUDGET_SCOPES,
  PUBLIC_BUDGET_CATEGORIES,
  type MoneyBotBudgetSnapshot,
} from '../guide-budget.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/
const CHECKSUM = /^[a-f0-9]{64}$/

function cleanText(value: unknown, field: string, max: number) {
  const text = String(value ?? '').trim()
  if (!text || text.length > max) throw new BudgetContractError(`${field} is invalid.`)
  return text
}

export class BudgetContractError extends Error {}

export function moneyToCents(value: unknown, field = 'amount') {
  const text = String(value ?? '').trim()
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    throw new BudgetContractError(`${field} must be a decimal amount with at most 2 places.`)
  }
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new BudgetContractError(`${field} is outside the supported range.`)
  return negative ? -cents : cents
}

export function centsToMoney(value: number) {
  const negative = value < 0
  const absolute = negative ? -value : value
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
  return negative ? `-${text}` : text
}

function canonicalSnapshotPayload(snapshot: Omit<MoneyBotBudgetSnapshot, 'checksum'>) {
  const categories = Object.fromEntries(
    Object.entries(snapshot.categories)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, centsToMoney(moneyToCents(value, `categories.${key}`))])
  )
  return JSON.stringify({
    event_key: snapshot.event_key,
    guide_slug: snapshot.guide_slug,
    title: snapshot.title,
    currency: snapshot.currency,
    scope: snapshot.scope,
    traveller_count: snapshot.traveller_count,
    total: centsToMoney(moneyToCents(snapshot.total, 'total')),
    categories,
    transaction_count: snapshot.transaction_count,
    date_from: snapshot.date_from,
    date_to: snapshot.date_to,
    generated_at: snapshot.generated_at,
    confirmed_at: snapshot.confirmed_at,
    source: snapshot.source,
    snapshot_version: snapshot.snapshot_version,
  })
}

export function computeSnapshotChecksum(snapshot: Omit<MoneyBotBudgetSnapshot, 'checksum'>) {
  return createHash('sha256').update(canonicalSnapshotPayload(snapshot), 'utf8').digest('hex')
}

export function validateMoneyBotSnapshot(input: unknown): MoneyBotBudgetSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BudgetContractError('Snapshot must be a JSON object.')
  }
  const value = input as Record<string, unknown>
  const allowed = new Set([
    'event_key',
    'guide_slug',
    'title',
    'currency',
    'scope',
    'traveller_count',
    'total',
    'categories',
    'transaction_count',
    'date_from',
    'date_to',
    'generated_at',
    'confirmed_at',
    'source',
    'snapshot_version',
    'checksum',
  ])
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) throw new BudgetContractError(`Unknown snapshot fields: ${unknown.join(', ')}`)

  const eventKey = cleanText(value.event_key, 'event_key', 120)
  const guideSlug = cleanText(value.guide_slug, 'guide_slug', 160)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventKey) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guideSlug)) {
    throw new BudgetContractError('event_key and guide_slug must be lowercase slugs.')
  }
  const title = cleanText(value.title, 'title', 200)
  const currency = cleanText(value.currency, 'currency', 3).toUpperCase()
  if (!CURRENCY.test(currency)) throw new BudgetContractError('currency must be an ISO-style 3-letter code.')
  const scope = String(value.scope || '') as MoneyBotBudgetSnapshot['scope']
  if (!GUIDE_BUDGET_SCOPES.includes(scope)) throw new BudgetContractError('scope is invalid.')
  const travellerCount =
    value.traveller_count === null || value.traveller_count === undefined
      ? null
      : Number(value.traveller_count)
  if (travellerCount !== null && (!Number.isInteger(travellerCount) || travellerCount < 1 || travellerCount > 1000)) {
    throw new BudgetContractError('traveller_count is invalid.')
  }
  const transactionCount = Number(value.transaction_count)
  const snapshotVersion = Number(value.snapshot_version)
  if (!Number.isInteger(transactionCount) || transactionCount < 0) {
    throw new BudgetContractError('transaction_count is invalid.')
  }
  if (!Number.isInteger(snapshotVersion) || snapshotVersion < 1) {
    throw new BudgetContractError('snapshot_version is invalid.')
  }
  const dateFrom = cleanText(value.date_from, 'date_from', 10)
  const dateTo = cleanText(value.date_to, 'date_to', 10)
  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo) || dateFrom > dateTo) {
    throw new BudgetContractError('The trip date range is invalid.')
  }
  const generatedAt = cleanText(value.generated_at, 'generated_at', 40)
  const confirmedAt = cleanText(value.confirmed_at, 'confirmed_at', 40)
  if (!Number.isFinite(Date.parse(generatedAt)) || !Number.isFinite(Date.parse(confirmedAt))) {
    throw new BudgetContractError('generated_at and confirmed_at must be ISO timestamps.')
  }
  if (value.source !== 'moneybot') throw new BudgetContractError('source must be moneybot.')

  if (!value.categories || typeof value.categories !== 'object' || Array.isArray(value.categories)) {
    throw new BudgetContractError('categories must be an object.')
  }
  const categories: Record<string, string> = {}
  let categoryTotal = 0
  for (const [key, amount] of Object.entries(value.categories as Record<string, unknown>)) {
    if (![...PUBLIC_BUDGET_CATEGORIES, 'unclassified'].includes(key as never)) {
      throw new BudgetContractError(`Unknown public category: ${key}`)
    }
    const cents = moneyToCents(amount, `categories.${key}`)
    categories[key] = centsToMoney(cents)
    categoryTotal += cents
  }
  const total = centsToMoney(moneyToCents(value.total, 'total'))
  if (categoryTotal !== moneyToCents(total, 'total')) {
    throw new BudgetContractError('total does not equal the category sum.')
  }
  const checksum = cleanText(value.checksum, 'checksum', 64).toLowerCase()
  if (!CHECKSUM.test(checksum)) throw new BudgetContractError('checksum is invalid.')

  const normalized: MoneyBotBudgetSnapshot = {
    event_key: eventKey,
    guide_slug: guideSlug,
    title,
    currency,
    scope,
    traveller_count: travellerCount,
    total,
    categories,
    transaction_count: transactionCount,
    date_from: dateFrom,
    date_to: dateTo,
    generated_at: new Date(generatedAt).toISOString(),
    confirmed_at: new Date(confirmedAt).toISOString(),
    source: 'moneybot',
    snapshot_version: snapshotVersion,
    checksum,
  }
  const { checksum: ignored, ...withoutChecksum } = normalized
  void ignored
  const expected = computeSnapshotChecksum(withoutChecksum)
  if (!safeEqualHex(checksum, expected)) throw new BudgetContractError('checksum does not match the snapshot.')
  return normalized
}

function safeEqualHex(left: string, right: string) {
  if (!CHECKSUM.test(left) || !CHECKSUM.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export function computeRequestSignature(secret: string, timestamp: string, nonce: string, rawBody: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`, 'utf8').digest('hex')
}

export function verifyRequestSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
  signature: string
) {
  return safeEqualHex(signature.toLowerCase(), computeRequestSignature(secret, timestamp, nonce, rawBody))
}

export function validateRequestFreshness(timestamp: string, nowMs = Date.now(), maxAgeMs = 5 * 60 * 1000) {
  if (!/^\d{10,13}$/.test(timestamp)) throw new BudgetContractError('Invalid request timestamp.')
  const numeric = Number(timestamp)
  const timestampMs = timestamp.length === 10 ? numeric * 1000 : numeric
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > maxAgeMs) {
    throw new BudgetContractError('Request timestamp is outside the allowed window.')
  }
}

export function validateNonce(nonce: string) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(nonce)) throw new BudgetContractError('Invalid request nonce.')
}
