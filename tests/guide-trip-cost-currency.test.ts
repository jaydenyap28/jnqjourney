import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  convertGuideBudgetCents,
  formatConvertedGuideBudgetCents,
  formatGuideDisplayAmount,
  normalizeGuideDisplayCurrency,
} from '../lib/guide-budget.ts'

test('normalizes legacy Guide currency labels for reader FX display', () => {
  assert.equal(normalizeGuideDisplayCurrency('RM'), 'MYR')
  assert.equal(normalizeGuideDisplayCurrency('rmb'), 'CNY')
  assert.equal(normalizeGuideDisplayCurrency('usd'), 'USD')
  assert.equal(normalizeGuideDisplayCurrency('THB'), null)
})

test('converts Guide cents for display without changing the source amount', () => {
  assert.equal(convertGuideBudgetCents(246416, 1.62, 'CNY'), 3991.94)
  assert.equal(convertGuideBudgetCents(246416, 33.71, 'JPY'), 83067)
  assert.equal(convertGuideBudgetCents(246416, Number.NaN, 'USD'), null)
  assert.equal(formatConvertedGuideBudgetCents(246416, 1.62, 'CNY'), '¥3,991.94')
})

test('formats each supported reader currency consistently', () => {
  assert.equal(formatGuideDisplayAmount('MYR', 1234.56), 'RM 1,234.56')
  assert.equal(formatGuideDisplayAmount('CNY', 1234.56), '¥1,234.56')
  assert.equal(formatGuideDisplayAmount('USD', 1234.56), 'US$1,234.56')
  assert.equal(formatGuideDisplayAmount('JPY', 123456), '¥123,456')
  assert.equal(formatGuideDisplayAmount('SGD', 1234.56), 'S$1,234.56')
})

test('keeps the existing GuideTripCost implementation visible with a prominent five-currency selector', () => {
  const component = fs.readFileSync(new URL('../components/GuideTripCost.tsx', import.meta.url), 'utf8')
  const pageView = fs.readFileSync(new URL('../components/GuidePageView.tsx', import.meta.url), 'utf8')
  assert.match(component, /<legend[^>]*>参考币种<\/legend>/)
  assert.match(component, /\['MYR', 'CNY', 'USD', 'JPY', 'SGD'\]/)
  assert.match(component, /aria-pressed=\{displayCurrency === item\}/)
  assert.match(component, /originalAmount\(tripCost\.totalCents\)/)
  assert.match(component, /≈ \{convertedAmount\(tripCost\.totalCents\)\}/)
  assert.match(pageView, /<GuideTripCost tripCost=\{publicTripCost\} \/>/)
})
