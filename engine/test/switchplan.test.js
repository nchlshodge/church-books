const test = require('node:test'), assert = require('node:assert');
const SP = require('../switchplan.js');
const flat = n => Array(12).fill(n);

test('switching to Kingdom Builders: does Missions keep its commitments?', () => {
  const base = { from: '2027-01', switchAt: '2028-01', through: '2028-12', startBalance: 5000000,
    before: { income: flat(1300000), spending: flat(3600000) }, pattern: flat(1), commitments: 3000000, projects: 600000, tithesYear: 160000000 };
  // Missions offering $13k/mo vs $36k/mo spending: the fund falls $23k a month before the switch
  const a = SP.project({ ...base, kbYear: 70000000, missionsPct: 50 });   // $700k KB, 50% → $350k vs $432k needed
  assert.strictEqual(a.rows[11].balance, 5000000 - 12 * 2300000);
  assert.deepStrictEqual([a.missionsYear, a.needYear, a.shortYear], [35000000, 43200000, 8200000]);
  assert.strictEqual(a.minPctAll, 61.8); assert.strictEqual(a.minPctCommit, 51.5);
  assert.strictEqual(a.kbNeededAt(50), 86400000);
  assert.ok(a.low.balance < 0 && a.monthsCovered < 12);
  // a 5% tithe on the tithe as a backstop ($80k/yr) closes the gap
  const b = SP.project({ ...base, kbYear: 70000000, missionsPct: 50, titheOnTithePct: 5 });
  assert.deepStrictEqual([b.backstopYear, b.shortYear], [8000000, 200000]);
  // or 62% for Missions
  const c = SP.project({ ...base, kbYear: 70000000, missionsPct: 62 });
  assert.strictEqual(c.shortYear, 0);
});
