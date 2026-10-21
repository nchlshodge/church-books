const test = require('node:test');
const assert = require('node:assert');
const F = require('../forecast.js');

test('each fund rolls forward month by month; the totals are the funds added up', () => {
  const r = F.run({ periods: ['Nov', 'Dec', 'Jan'], start: { gen: 1000000, mis: 200000 }, flows: [
    { period: 0, fund: 'gen', amount: 3000000, kind: 'giving' }, { period: 0, fund: 'gen', amount: -1600000, kind: 'payroll' },
    { period: 1, fund: 'gen', amount: 4000000, kind: 'giving' }, { period: 1, fund: 'gen', amount: -1600000, kind: 'payroll' },
    { period: 2, fund: 'gen', amount: 2500000, kind: 'giving' }, { period: 2, fund: 'gen', amount: -1600000, kind: 'payroll' },
    { period: 0, fund: 'mis', amount: -150000, kind: 'scheduled' }, { period: 1, fund: 'mis', amount: -150000, kind: 'scheduled' },
  ] });
  const gen = r.byFund.find(f => f.fund === 'gen');
  assert.deepStrictEqual(gen.rows.map(x => x.end), [2400000, 4800000, 5700000]);
  assert.strictEqual(r.total[2].end, 5700000 + (200000 - 300000));
  assert.strictEqual(r.total[0].byKind.payroll, -1600000);
});

test('it warns when a fund runs out, or drops below its cushion first', () => {
  const r = F.run({ periods: ['Nov', 'Dec', 'Jan'], start: { gen: 1200000, mis: 100000 }, cushion: { gen: 1000000 }, flows: [
    { period: 1, fund: 'gen', amount: -500000, kind: 'one-time', label: 'Roof' },
    { period: 2, fund: 'mis', amount: -150000, kind: 'scheduled' },
  ] });
  assert.deepStrictEqual(r.warnings.map(w => [w.fund, w.kind, w.label]), [['gen', 'cushion', 'Dec'], ['mis', 'negative', 'Jan']]);
  assert.strictEqual(r.byFund.find(f => f.fund === 'gen').low.end, 700000);
  assert.throws(() => F.run({ periods: ['Nov'], flows: [{ period: 3, fund: 'gen', amount: 1 }] }), /no period 3/);
});
