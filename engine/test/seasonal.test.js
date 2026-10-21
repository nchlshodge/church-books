const test = require('node:test'), assert = require('node:assert');
const F = require('../forecast.js');
const per = (y, m0, n, firstShare = 1) => Array.from({ length: n }, (_, k) => ({ y: y + Math.floor((m0 + k) / 12), m: (m0 + k) % 12, share: k ? 1 : firstShare }));

test('even giving by the pace gives the same as before', () => {
  const r = F.seasonalGiving({ periods: per(2026, 6, 12), year: 2026, pattern: Array(12).fill(1), givenSoFar: 600000, elapsed: 6 });
  assert.deepStrictEqual(r.amounts, Array(12).fill(100000)); assert.strictEqual(r.yearTotal, 1200000);
});

test('a fourth-quarter-heavy fund: toward its goal, most of it in November', () => {
  const kb = [5, 6, 5, 6, 5, 4, 4, 4, 5, 10, 30, 16];   // 56% in Oct–Dec
  const r = F.seasonalGiving({ periods: per(2026, 9, 12, 0.45), year: 2026, pattern: kb, givenSoFar: 8600000, elapsed: 9.55, target: 12000000 });
  const [oct, nov, dec] = r.amounts;
  assert.ok(Math.abs(oct + nov + dec - 3400000) <= 2);                             // what's left of the goal arrives this year
  assert.ok(nov > dec && dec > oct);                                               // November biggest
  assert.strictEqual(r.amounts[3], Math.round(12000000 * 5 / 100));               // next January: the year's goal × January's share
  // by the pace alone, a quiet Jan–Sep would mean a big year: the pattern says only 44% of it is behind us
  const pace = F.seasonalGiving({ periods: per(2026, 9, 12, 0.45), year: 2026, pattern: kb, givenSoFar: 8600000, elapsed: 9.55 });
  assert.ok(pace.paceYear > 17000000 && pace.shareBehind < 0.5);
  // already past the goal: nothing more expected this year (never negative)
  assert.deepStrictEqual(F.seasonalGiving({ periods: per(2026, 10, 2), year: 2026, pattern: kb, givenSoFar: 13000000, elapsed: 10, target: 12000000 }).amounts, [0, 0]);   // Nov–Dec
});
