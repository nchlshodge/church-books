const test = require('node:test');
const assert = require('node:assert');
const C = require('../campaigns.js');

const camp = { levels: ['Plan', 'Vision', 'Dream'], goal: 2000000, commitments: [
  { household: 'A', amounts: [600000, 750000, 1000000], given: 600000 },   // reached Plan
  { household: 'B', amounts: [400000, 500000, 640000], given: 300000 },    // 75% with 70% of the year gone → on pace
  { household: 'C', amounts: [200000, 250000, 320000], given: 50000 },     // behind
] };

test('commitments add up by level and are compared with what has actually been given', () => {
  const s = C.summarize(camp, { givenTotal: 1000000, yearDone: 0.7 });
  assert.deepStrictEqual(s.levels.map(l => l.amount), [1200000, 1500000, 1960000]);
  assert.strictEqual(s.committedGiven, 950000);
  assert.strictEqual(s.otherGiven, 50000);                          // from people without a commitment
  assert.strictEqual(s.expectedByNow, 840000);
  assert.strictEqual(s.pace, 110000);                               // ahead of pace
  assert.deepStrictEqual(s.counts, { reached: 1, onPace: 1, behind: 1 });
  assert.strictEqual(s.projected, Math.round(1000000 / 0.7));
});

test('works with a single level and no commitments yet', () => {
  const s = C.summarize({ goal: 50000 }, { givenTotal: 12000, yearDone: 0.5 });
  assert.deepStrictEqual(s.levels, [{ name: 'Commitment', amount: 0 }]);
  assert.strictEqual(s.otherGiven, 12000);
  assert.strictEqual(s.households, 0);
});
