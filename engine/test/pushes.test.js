const test = require('node:test'), assert = require('node:assert');
const P = require('../pushes.js');

test('the monthly rhythm: Ask, Update, Celebrate, Break', () => {
  assert.deepStrictEqual(P.sundays(2026, 10), ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
  assert.strictEqual(P.rhythm(2026, 10, '2026-10-02').phase, 'before');
  assert.deepStrictEqual(['2026-10-05', '2026-10-12', '2026-10-18', '2026-10-26'].map(d => P.rhythm(2026, 10, d).phase), ['ask', 'update', 'celebrate', 'break']);
  assert.strictEqual(P.rhythm(2026, 8, '2026-08-31').phase, 'break');   // a fifth Sunday is another break week
  assert.strictEqual(P.rhythm(2026, 9, '2026-10-18').phase, 'after');
});

test('the Miracle Offering calendar', () => {
  const d = P.miracleDates(2026);
  assert.deepStrictEqual(d, { banquet: '2026-10-23', talkUp: '2026-11-01', offering: '2026-11-15', windowEnd: '2026-11-29', reveal: '2026-12-06', thanksgiving: '2026-11-26', yearEnd: '2026-12-31' });
  assert.deepStrictEqual(['2026-10-18', '2026-10-25', '2026-11-05', '2026-11-20', '2026-12-01', '2026-12-10', '2027-01-02'].map(t => P.miraclePhase(d, t)),
    ['before', 'banquet', 'talk', 'window', 'counting', 'final', 'done']);
  assert.strictEqual(P.miracleDates(2027).offering, '2027-11-14');   // Thanksgiving 2027 is Nov 25
});

test('adding up a push and closing the gap', () => {
  const t = P.tally([{ date: '2026-10-06', amount: 8000 }, { date: '2026-10-13', amount: 12000 }, { date: '2026-11-02', amount: 999 }], { from: '2026-10-01', to: '2026-10-31', goal: 300000 });
  assert.deepStrictEqual(t, { raised: 20000, count: 2, pct: 20000 / 300000, left: 280000 });
  assert.deepStrictEqual(P.gap({ goal: 12000000, given: 8000000 }), { goal: 12000000, given: 8000000, gap: 4000000, pct: 2 / 3 });
});
