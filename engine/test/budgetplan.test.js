const test = require('node:test');
const assert = require('node:assert');
const B = require('../budgetplan.js');
const total = a => a.reduce((s, x) => s + x, 0);

test('spreading a budget over the months always adds back to the exact amount', () => {
  const even = B.spread(1000001, { type: 'even' });
  assert.strictEqual(total(even), 1000001);
  assert.ok(Math.max(...even) - Math.min(...even) <= 1);
  assert.deepStrictEqual(B.spread(150000, { type: 'month', month: 9 }).map((x, i) => x ? i : null).filter(x => x !== null), [9]);   // all in October
  assert.deepStrictEqual(B.spread(240000, { type: 'quarterly' }).filter(Boolean), [60000, 60000, 60000, 60000]);
  const custom = B.spread(100000, { type: 'custom', weights: [0, 0, 0, 0, 0, 30, 40, 30, 0, 0, 0, 0] });   // summer-heavy
  assert.deepStrictEqual(custom.slice(5, 8), [30000, 40000, 30000]);
  assert.strictEqual(total(B.spread(99, { type: 'custom', weights: [1, 1, 1] })), 99);
  assert.throws(() => B.spread(100, { type: 'custom', weights: [0] }), /at least one month/);
});

test('the plan check: each fund fits its expected income, projects stay inside their ministry, months add up', () => {
  const lines = [
    { name: 'Everyday ministry', fund: 'gen', amount: 6000000, spread: { type: 'even' } },
    { name: 'Outreach Ministry', fund: 'gen', amount: 800000, spread: { type: 'even' } },
    { name: 'Fall Festival', fund: 'gen', parent: 'Outreach Ministry', amount: 150000, spread: { type: 'month', month: 9 } },
    { name: 'Kenya missions', fund: 'mis', amount: 4000000, spread: { type: 'even' } },
  ];
  const r = B.check(lines, { incomeByFund: { gen: 7000000, mis: 3600000 }, startByFund: { mis: 1600000 } });
  const gen = r.byFund.find(f => f.fund === 'gen'), mis = r.byFund.find(f => f.fund === 'mis');
  assert.deepStrictEqual([gen.planned, gen.difference, gen.usesReserves], [6800000, 200000, false]);   // Fall Festival is inside Outreach, not extra
  assert.deepStrictEqual([mis.usesReserves, mis.endsWith], [true, 1200000]);                         // uses $4,000 of reserves, still ends positive
  assert.ok(!r.balanced);
  assert.strictEqual(total(r.months.map(m => m.gen)), 6800000);
  assert.ok(r.months[9].gen - r.months[8].gen >= 150000 - 1);                                    // Fall Festival shows up in October
  assert.deepStrictEqual(B.check([{ name: 'A', fund: 'gen', amount: 100, spread: {} }, { name: 'B', fund: 'gen', parent: 'A', amount: 200, spread: {} }], { incomeByFund: { gen: 500 } }).overParent, ['A']);
});
