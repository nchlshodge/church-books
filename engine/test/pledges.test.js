const test = require('node:test'), assert = require('node:assert');
const PL = require('../pledges.js');
const monthly = (from, n, amt) => Array.from({ length: n }, (_, i) => { const d = new Date(from + 'T12:00:00'); d.setMonth(d.getMonth() + i); return { date: d.toISOString().slice(0, 10), amount: amt }; });

test('a three-year monthly pledge: given, left, pace and what each gift needs to be to finish', () => {
  const p = { amount: 360000, start: '2026-05-01', end: '2029-04-30', frequency: 'monthly' };   // $3,600 over 36 months
  assert.strictEqual(PL.dueDates(p.start, p.end, 'monthly').length, 36);
  const on = PL.progress(p, monthly('2026-05-01', 6, 10000), '2026-10-19');          // $100 a month, May–Oct
  assert.deepStrictEqual([on.given, on.left, on.expected, on.status, on.giftsLeft, on.nextAmount, on.nextDate], [60000, 300000, 60000, 'onPace', 30, 10000, '2026-11-01']);
  const behind = PL.progress(p, monthly('2026-05-01', 3, 10000), '2026-10-19');
  assert.deepStrictEqual([behind.status, behind.nextAmount], ['behind', 11000]);              // $3,300 over 30 gifts
  // gifts before the pledge started or after today don't count; money from before the app counts
  const early = PL.progress({ ...p, givenBefore: 5000 }, [{ date: '2026-04-01', amount: 99900 }, { date: '2026-12-01', amount: 99900 }], '2026-10-19');
  assert.strictEqual(early.given, 5000);
  const done = PL.progress({ ...p, amount: 50000 }, monthly('2026-05-01', 6, 10000), '2026-10-19');
  assert.deepStrictEqual([done.status, done.left, done.extra], ['done', 0, 10000]);
});

test('one-gift and yearly pledges, and the campaign summary', () => {
  const once = PL.progress({ amount: 500000, start: '2026-05-01', end: '2026-12-31', frequency: 'once' }, [], '2026-10-19');
  assert.deepStrictEqual([once.expected, once.status, once.nextAmount, once.nextDate], [0, 'onPace', 500000, '2026-12-31']);   // due by Dec 31
  assert.strictEqual(PL.progress({ amount: 500000, start: '2026-05-01', end: '2026-12-31', frequency: 'once' }, [], '2027-01-02').status, 'short');
  const yr = PL.progress({ amount: 300000, start: '2026-05-01', end: '2029-04-30', frequency: 'yearly' }, [{ date: '2026-06-01', amount: 100000 }], '2026-10-19');
  assert.deepStrictEqual([yr.expected, yr.status, yr.giftsLeft, yr.nextAmount], [100000, 'onPace', 2, 100000]);
  const s = PL.summary({ goal: 750000 }, [once, yr], 180000);
  assert.deepStrictEqual([s.pledged, s.towardPledges, s.left, s.beyond, s.counts.onPace], [800000, 100000, 700000, 80000, 2]);
});
