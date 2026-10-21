const test = require('node:test');
const assert = require('node:assert');
const S = require('../schedule.js');

test('monthly on the 31st lands on the last day of short months (and Feb 29 in leap years)', () => {
  const s = { start: '2026-01-31', every: 'monthly' };
  assert.deepStrictEqual(S.between(s, null, '2026-05-31'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.strictEqual(S.nth({ start: '2028-01-31', every: 'monthly' }, 1), '2028-02-29');
  assert.strictEqual(S.nth({ start: '2026-02-28', every: 'monthly', day: 31 }, 1), '2026-03-31');   // "day 31" means the last day
});

test('quarterly, yearly, weekly and every-2-weeks', () => {
  assert.deepStrictEqual(S.between({ start: '2026-01-10', every: 'quarterly' }, null, '2026-12-31'), ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10']);
  assert.deepStrictEqual(S.between({ start: '2025-03-01', every: 'yearly' }, '2025-03-01', '2027-12-31'), ['2026-03-01', '2027-03-01']);
  assert.deepStrictEqual(S.between({ start: '2026-12-25', every: 'weekly' }, null, '2027-01-08'), ['2026-12-25', '2027-01-01', '2027-01-08']);
  assert.strictEqual(S.nth({ start: '2026-10-02', every: 'every2weeks' }, 2), '2026-10-30');
  assert.strictEqual(S.perYear('monthly') * 1500, 18000);
});

test('what is due: only what has not been paid, nothing when paused or ended, and the end date and count are respected', () => {
  const s = { start: '2026-01-15', every: 'monthly', lastRun: '2026-09-15', status: 'Active' };
  assert.deepStrictEqual(S.due(s, '2026-10-18'), ['2026-10-15']);
  assert.deepStrictEqual(S.due({ ...s, lastRun: '2026-08-15' }, '2026-10-18'), ['2026-09-15', '2026-10-15']);   // missed two
  assert.deepStrictEqual(S.due({ ...s, status: 'Paused' }, '2026-10-18'), []);
  assert.strictEqual(S.next(s, '2026-10-18'), '2026-11-15');
  assert.strictEqual(S.next({ ...s, endsOn: '2026-10-31' }, '2026-10-18'), null);
  assert.deepStrictEqual(S.between({ start: '2026-01-01', every: 'monthly', count: 3 }, null, '2026-12-31'), ['2026-01-01', '2026-02-01', '2026-03-01']);
  assert.throws(() => S.nth({ start: '2026-01-01', every: 'daily' }, 1), /Unknown frequency/);
});
