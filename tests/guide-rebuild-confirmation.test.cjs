const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

// Exercise the actual editor handler without mounting the unrelated Admin UI.
const source = fs.readFileSync('app/admin/guides/page.tsx', 'utf8')
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'rebuildDaysFromVisitDates') handler = node.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(handler)
const js = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const existingDays = [
  { dayLabel: 'Day 1', title: 'Edited title', summary: 'Manual summary', highlights: ['Keep me'], routeItems: [{ type: 'spot', spotId: 2 }, { type: 'note', noteSlug: 'route-note' }, { type: 'spot', spotId: 1 }], stay: 'Adjusted stay' },
  { dayLabel: 'Day 2', routeItems: [{ type: 'spot', spotId: 2 }], stayRangeStart: 1, stayRangeEnd: 2 },
]
function run(days, confirmed) {
  const form = { days, route: [{ name: 'Shanghai' }] }
  const locations = [{ id: 1, visit_date: '2026-09-21' }]
  const nextDays = [{ dayLabel: 'Day 1', title: 'Rebuilt day' }]
  const calls = []
  const fn = new Function('form', 'locations', 'window', 'buildGuideDaysFromVisitDates', 'updateField', 'setMessage', 'setMessageTone', `${js}; return rebuildDaysFromVisitDates`)(
    form, locations,
    { confirm: message => { calls.push(['confirm', message]); return confirmed } },
    (input, routes) => { calls.push(['build', input, routes]); return nextDays },
    (key, value) => { calls.push(['update', key, value]); form[key] = value },
    value => calls.push(['message', value]),
    value => calls.push(['tone', value]),
  )
  fn()
  return { form, calls, nextDays, locations }
}
test('populated Guide requests confirmation with all replacement risks', () => {
  const { calls } = run(structuredClone(existingDays), true)
  assert.equal(calls[0][0], 'confirm')
  for (const text of ['current day routes', 'manual Spot ordering', 'repeated Spots', 'Longform Note route items', 'day titles/summaries/highlights', 'accommodation adjustments', 'other manually adjusted daily structure']) assert.ok(calls[0][1].includes(text))
})
test('cancel preserves existing days and makes no updates or rebuild calls', () => {
  const days = structuredClone(existingDays)
  const before = JSON.stringify(days)
  const { form, calls } = run(days, false)
  assert.equal(form.days, days)
  assert.equal(JSON.stringify(form.days), before)
  assert.deepEqual(calls.map(call => call[0]), ['confirm'])
})
test('confirm invokes existing rebuild with unchanged inputs and applies its result', () => {
  const { form, calls, nextDays, locations } = run(structuredClone(existingDays), true)
  assert.deepEqual(calls.map(call => call[0]), ['confirm', 'build', 'update', 'message', 'tone'])
  assert.equal(calls[1][1], locations)
  assert.deepEqual(calls[1][2], ['Shanghai'])
  assert.equal(form.days, nextDays)
  assert.deepEqual(calls.at(-1), ['tone', 'success'])
})
test('empty Guide rebuilds normally without confirmation', () => {
  const { form, calls, nextDays } = run([], false)
  assert.deepEqual(calls.map(call => call[0]), ['build', 'update', 'message', 'tone'])
  assert.equal(form.days, nextDays)
})
