const test = require('node:test'), assert = require('node:assert');
const G = require('../giving.js');

test('recurring gift dates: weekly, every two weeks, monthly (short months), 1st and 15th', () => {
  assert.deepStrictEqual(G.upcoming({ frequency: 'weekly', start: '2026-10-25' }, '2026-10-19', 3), ['2026-10-25', '2026-11-01', '2026-11-08']);
  assert.deepStrictEqual(G.upcoming({ frequency: 'every2weeks', start: '2026-10-25' }, '2026-10-26', 2), ['2026-11-08', '2026-11-22']);
  assert.deepStrictEqual(G.upcoming({ frequency: 'monthly', start: '2026-01-31' }, '2026-01-31', 3), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepStrictEqual(G.upcoming({ frequency: 'firstFifteenth', start: '2026-10-20' }, '2026-10-19', 4), ['2026-11-01', '2026-11-15', '2026-12-01', '2026-12-15']);
  assert.deepStrictEqual(G.upcoming({ frequency: 'firstFifteenth', start: '2026-12-10' }, '2026-01-01', 3), ['2026-12-15', '2027-01-01', '2027-01-15']);
  assert.deepStrictEqual(G.between({ frequency: 'firstFifteenth', start: '2026-10-01' }, null, '2026-10-31'), ['2026-10-01', '2026-10-15']);
});

test('end dates, pausing and cancelling stop the next gift', () => {
  const s = { frequency: 'monthly', start: '2026-11-05', end: '2027-01-31', status: 'active' };
  assert.deepStrictEqual(G.upcoming(s, '2026-10-19', 10), ['2026-11-05', '2026-12-05', '2027-01-05']);
  assert.strictEqual(G.next(s, '2027-01-05'), null);
  assert.strictEqual(G.next({ ...s, status: 'paused' }, '2026-10-19'), null);
  assert.strictEqual(G.next({ ...s, status: 'cancelled' }, '2026-10-19'), null);
  assert.deepStrictEqual([G.perMonth(5000, 'weekly'), G.perMonth(5000, 'firstFifteenth'), G.perYear(5000, 'every2weeks')], [21667, 10000, 130000]);
  assert.throws(() => G.next({ frequency: 'daily', start: '2026-10-19' }, '2026-10-19'), /Unknown frequency/);
});

test('fees, and covering them so the church gets the whole gift', () => {
  assert.deepStrictEqual([G.fee(10000, 'card'), G.fee(10000, 'bank'), G.fee(200000, 'bank')], [320, 80, 500]);   // bank fees stop at $5
  assert.deepStrictEqual(G.cover(10000, 'card'), { gross: 10330, fee: 330, cover: 330 });
  assert.deepStrictEqual(G.cover(10000, 'bank'), { gross: 10081, fee: 81, cover: 81 });
  assert.deepStrictEqual(G.cover(100000, 'bank'), { gross: 100500, fee: 500, cover: 500 });
  for (const amt of [100, 2500, 7777, 15000, 123456]) for (const m of ['card', 'bank']) {
    const c = G.cover(amt, m);
    assert.ok(c.gross - c.fee >= amt && c.gross - 1 - G.fee(c.gross - 1, m) < amt, `${m} ${amt}`);   // the smallest charge that leaves the whole gift
  }
  assert.deepStrictEqual(G.charge({ amount: 10000, method: 'card' }), { amount: 10000, cover: 0, gross: 10000, fee: 320, net: 9680 });
  assert.strictEqual(G.charge({ amount: 10000, method: 'bank', coverFee: true }).net, 10000);
  assert.throws(() => G.charge({ amount: 0, method: 'card' }), /above zero/);
});

test('a payout: gifts by way to give, fee-cover to the operating offering, refunds come back out', () => {
  const p = G.payout([
    { giving: 'tithe', amount: 10000, cover: 0, fee: 80 },
    { giving: 'legacy', amount: 15000, cover: 121, fee: 121 },
    { giving: 'missions', amount: 5000, cover: 0, fee: 175 },
    { giving: 'missions', amount: 2500, refund: true },
  ], 'tithe');
  assert.deepStrictEqual(p, { gifts: 3, byGiving: { tithe: 10121, legacy: 15000, missions: 2500 }, fee: 376, gross: 27621, net: 27245 });
  const y = G.yearTotals([{ date: '2026-01-05', giving: 'tithe', gross: 40000 }, { date: '2026-02-05', giving: 'tithe', gross: 40000, refunded: true },
    { date: '2026-03-05', giving: 'legacy', gross: 15000 }, { date: '2025-12-05', giving: 'tithe', gross: 40000 }], 2026);
  assert.deepStrictEqual(y, { total: 55000, byGiving: { tithe: 40000, legacy: 15000 }, count: 2 });
});
